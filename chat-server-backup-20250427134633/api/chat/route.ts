import { NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { lookupUserTool, getAvailableSlotsTool, getServicesTool, bookAppointmentTool, createContactTool } from '@/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createSystemPrompt as createAdminSystemPrompt } from '@/prompts/systemPrompt-admin';
import { createSystemPrompt as createCustomerSystemPrompt } from '@/prompts/systemPrompt-customer';
import { ToolResult } from '@/types/tools';

// Store executors in memory keyed by session ID
export const executors = new Map<string, AgentExecutor>();
export const adminExecutors = new Map<string, AgentExecutor>(); // Separate store for admin executors
export const toolResults = new Map<string, ToolResult[]>();

// Cache for public holidays
let publicHolidaysCache: {
  date: string;
  holiday: string;
}[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Function to fetch Singapore public holidays from data.gov.sg
async function fetchPublicHolidays() {
  // Check cache first
  const now = Date.now();
  if (publicHolidaysCache && (now - lastFetchTime < CACHE_DURATION)) {
    console.log('📅 Using cached public holidays data');
    return publicHolidaysCache;
  }
  
  try {
    console.log('📅 Fetching Singapore public holidays from data.gov.sg');
    const response = await fetch('https://data.gov.sg/api/action/datastore_search?resource_id=d_3751791452397f1b1c80c451447e40b7');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public holidays: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.result || !data.result.records) {
      throw new Error('Invalid response format from data.gov.sg API');
    }
    
    // Transform the data to a simpler format
    const holidays = data.result.records.map((record: { date: string; holiday: string; }) => ({
      date: record.date,
      holiday: record.holiday
    }));
    
    // Update cache
    publicHolidaysCache = holidays;
    lastFetchTime = now;
    
    console.log(`📅 Fetched ${holidays.length} public holidays`);
    return holidays;
  } catch (error) {
    console.error('❌ Error fetching public holidays:', error);
    // Return empty array if there's an error, so the app still works
    return [];
  }
}

// Server-side date determination function
async function getServerDate() {
  const currentDate = new Date();
  
  // Format the date
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = currentDate.getDay();
  const isSunday = dayOfWeek === 0;
  
  // Format today's date as YYYY-MM-DD for comparison with public holidays
  const todayYMD = currentDate.toISOString().split('T')[0];
  
  // Fetch public holidays
  const publicHolidays = await fetchPublicHolidays();
  
  // Check if today is a public holiday
  const todayHoliday = publicHolidays.find((holiday: { date: string; holiday: string }) => holiday.date === todayYMD);
  const isPublicHoliday = !!todayHoliday;
  
  // Create status message
  let todayStatus = "We are OPEN today.";
  if (isSunday) {
    todayStatus = "Today is Sunday and we are CLOSED.";
  } else if (isPublicHoliday) {
    todayStatus = `Today is ${todayHoliday.holiday} (Public Holiday) and we are CLOSED.`;
  }
    
  return {
    formattedDate,
    dayOfWeek,
    isSunday,
    isPublicHoliday,
    holidayName: todayHoliday?.holiday || null,
    todayStatus
  };
}

// Add a utility function to escape JSON strings in tool outputs
function escapeJsonForTemplate(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;

  // Check if it's a JSON string
  try {
    const parsedJson = JSON.parse(jsonStr);
    // If it parsed successfully, return a sanitized version
    return `Tool result: ${JSON.stringify(parsedJson).replace(/[{}"]/g, '').replace(/:/g, ' = ').replace(/,/g, ', ')}`;
  } catch (e) {
    // Not JSON, return as is
    return jsonStr;
  }
}

export async function getOrCreateExecutor(sessionId: string, isAdmin: boolean = false): Promise<AgentExecutor> {
  // Use appropriate executor map based on role
  const executorMap = isAdmin ? adminExecutors : executors;
  
  // Return existing executor if it exists
  if (executorMap.has(sessionId)) {
    return executorMap.get(sessionId)!;
  }
  
  console.log(`🔧 Creating new ${isAdmin ? 'admin' : 'customer'} executor for session ${sessionId}`);
  
  // Set up tools - use imported instances
  const tools: any[] = [
    lookupUserTool,
    getServicesTool,
    getAvailableSlotsTool,
    bookAppointmentTool,
  ];
  
  // Add admin-only tools if admin mode is enabled
  if (isAdmin) {
    tools.push(createContactTool);
    console.log('🔧 Added admin-only tools');
  }
  
  console.log(`📋 Initialized tools:`, tools.map(t => t.name));
  
  // Setup LLM
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenAI API key - please set OPENAI_API_KEY in environment variables');
  }
  
  const llm = new ChatOpenAI({
    temperature: 0,
    modelName: 'gpt-4o',
    apiKey,
  });
  
  // Get the server date
  const dateInfo = await getServerDate();
  console.log(`📅 Server date info:`, dateInfo);
  
  // Create system prompt with server date based on role
  const systemPromptContent = isAdmin 
    ? createAdminSystemPrompt(dateInfo)
    : createCustomerSystemPrompt(dateInfo);
  
  console.log(`📝 Using ${isAdmin ? 'admin' : 'customer'} system prompt`);
  
  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPromptContent],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    ["system", "{agent_scratchpad}"]
  ]);
  
  // Create agent with error handling
  let agent;
  try {
    agent = await createToolCallingAgent({
      llm,
      tools,
      prompt,
    });
    console.log(`✅ Agent created successfully for session ${sessionId}`);
  } catch (error) {
    console.error(`❌ Error creating agent:`, error);
    throw new Error(`Failed to create agent: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Create executor with error handling options
  const executor = new AgentExecutor({
    agent,
    tools,
    returnIntermediateSteps: true,
    handleParsingErrors: true,
    maxIterations: 5,
    // verbose: process.env.NODE_ENV !== 'production', // Enable verbose mode in non-production
  });
  
  // Store executor for future use in appropriate map
  executorMap.set(sessionId, executor);
  
  return executor;
}

export async function POST(request: Request) {
  try {
    // Generate a session ID from request headers or create a new one
    const sessionId = request.headers.get('x-session-id') || crypto.randomUUID();
    
    // Parse request
    const { message, isAdmin = false, mcpContext } = await request.json();
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: message is required and must be a string' },
        { status: 400 }
      );
    }
    
    console.log(`📨 Received message for session ${sessionId}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}" (Admin: ${isAdmin})`);
    
    // Get or create executor
    let executor;
    let toolsAvailable = [];
    try {
      executor = await getOrCreateExecutor(sessionId, isAdmin);
      // Capture tools for error reporting
      toolsAvailable = executor.tools.map(t => t.name);
    } catch (executorError) {
      console.error(`❌ Error creating executor: ${executorError}`);
      return NextResponse.json(
        { error: 'Failed to initialize chat backend', details: executorError instanceof Error ? executorError.message : String(executorError) },
        { status: 500 }
      );
    }
    
    // Use MCP context for the history and user info
    const userContext = mcpContext?.memory?.user_info || null;
    if (userContext) {
      console.log(`👤 Found user context from MCP context:`, userContext);
    }
    
    // Extract chat history from MCP context
    const chatHistory = mcpContext?.history 
      ? mcpContext.history.map((msg: { role: string; content: string }) => {
          if (msg.role === 'user') {
            return { role: 'user', content: msg.content };
          } else {
            return { role: 'assistant', content: msg.content };
          }
        })
      : [];
    
    // Prepare input with user context if available
    let inputToUse = message;
    if (userContext?.resourceName) {
      inputToUse = `${message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
      console.log('📝 Enhanced input with user context for session', sessionId);
      console.log('👤 User context applied:', JSON.stringify(userContext));
    } else {
      console.log('👤 No user context available for session', sessionId);
    }
    
    console.log(`🤖 Invoking executor for session ${sessionId}`);
    
    // Add MCP context information to the input if available
    let enrichedInput = inputToUse;
    if (mcpContext) {
      // Add preferences to the input if available
      const preferences = [];
      if (mcpContext.memory?.last_selected_service) {
        preferences.push(`Last service: ${mcpContext.memory.last_selected_service}`);
      }
      if (mcpContext.memory?.preferred_date) {
        preferences.push(`Preferred date: ${mcpContext.memory.preferred_date}`);
      }
      if (mcpContext.memory?.preferred_time) {
        preferences.push(`Preferred time: ${mcpContext.memory.preferred_time}`);
      }
      
      if (preferences.length > 0) {
        enrichedInput = `${enrichedInput} (Preferences: ${preferences.join(', ')})`;
      }
      
      console.log("🤖 [enhanceUserInput] Enhanced with MCP context:", JSON.stringify(enrichedInput));
    }
    
    // Invoke the executor with the enhanced input
    console.log("🧰 [API] About to invoke executor with input:", JSON.stringify(enrichedInput));
    
    try {
      const result = await executor.invoke({
        input: enrichedInput,
        chat_history: chatHistory,
      });
      console.log("✅ [API] Executor result:", JSON.stringify(result));
      
      // Extract response content
      let responseContent = '';
      if (typeof result === 'string') {
        responseContent = result;
      } else if (result.output) {
        responseContent = String(result.output);
      } else if (result.response) {
        responseContent = String(result.response);
      } else {
        const firstKey = Object.keys(result)[0];
        responseContent = firstKey ? String(result[firstKey]) : JSON.stringify(result);
      }
      
      console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? '...' : ''}"`);
      
      // Return response with session ID
      return NextResponse.json({
        response: responseContent,
        sessionId,
      });
    } catch (error) {
      console.error('❌ Error in executor:', error);
      
      // If the error is related to tool input, log more details
      if (error instanceof Error && error.message && error.message.includes('tool input')) {
        console.error('❌ Tool Input Error Details:', {
          error: error.message,
          trace: error.stack,
          executor: executor?.name || 'Unknown'
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to process chat message', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 