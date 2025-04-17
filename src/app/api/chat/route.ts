import { NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { LookupUserTool } from '@/tools/lookupUser';
import { getAvailableSlotsTool } from '@/tools/getAvailableSlots';
import { BookAppointmentTool } from '@/tools/bookAppointment';
import { getServicesTool } from '@/tools/getServices';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { systemPrompt } from '@/prompts/systemPrompt';
import { ToolResult } from '@/types/tools';

// Store executors and context in memory keyed by session ID
export const executors = new Map<string, AgentExecutor>();
export const toolResults = new Map<string, ToolResult[]>();
export const userContexts = new Map<string, any>();
export const chatHistories = new Map<string, Array<{ type: string; content: string }>>();

// Custom handler to capture tool results and update user context
class CaptureToolResultHandler {
  sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  name = "CaptureToolResultHandler";

  async handleToolEnd(output: string) {
    try {
      console.log(`🛠️ Tool output for session ${this.sessionId}:`, output);
      
      const parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
      
      // Get or initialize tool results for this session
      if (!toolResults.has(this.sessionId)) {
        toolResults.set(this.sessionId, []);
      }
      
      const sessionToolResults = toolResults.get(this.sessionId)!;
      sessionToolResults.push(parsedOutput);
      
      // Process user data from lookupUser tool results
      if (parsedOutput && parsedOutput.resourceName) {
        console.log('👤 Found user data in tool result for session', this.sessionId, ':', parsedOutput);
        
        // Save user data in memory for future tool calls
        const updatedContext = {
          resourceName: parsedOutput.resourceName,
          name: parsedOutput.name,
          mobile: parsedOutput.mobile,
          updatedAt: new Date().toISOString()
        };
        
        userContexts.set(this.sessionId, updatedContext);
        
        console.log('🔑 Stored user context for session', this.sessionId, ':', updatedContext);
      }
    } catch (e) {
      console.error('❌ Error processing tool output:', e);
    }
  }
}

async function getOrCreateExecutor(sessionId: string): Promise<AgentExecutor> {
  // Return existing executor if it exists
  if (executors.has(sessionId)) {
    return executors.get(sessionId)!;
  }
  
  console.log(`🔧 Creating new executor for session ${sessionId}`);
  
  // Create tools
  const lookupUser = new LookupUserTool();
  const bookAppointment = new BookAppointmentTool();
  
  const tools = [
    lookupUser,
    getServicesTool,
    getAvailableSlotsTool,
    bookAppointment,
  ];
  
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
  
  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    ["system", "{agent_scratchpad}"]
  ]);
  
  // Create agent
  const agent = await createToolCallingAgent({
    llm,
    tools,
    prompt,
  });
  
  // Create executor
  const executor = new AgentExecutor({
    agent,
    tools,
    returnIntermediateSteps: true,
  });
  
  // Store executor for future use
  executors.set(sessionId, executor);
  
  return executor;
}

export async function POST(request: Request) {
  try {
    // Generate a session ID from request headers or create a new one
    const sessionId = request.headers.get('x-session-id') || crypto.randomUUID();
    
    // Parse request
    const { message } = await request.json();
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: message is required and must be a string' },
        { status: 400 }
      );
    }
    
    console.log(`📨 Received message for session ${sessionId}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    
    // Get or create executor
    const executor = await getOrCreateExecutor(sessionId);
    
    // Get or create tool handler
    const toolHandler = new CaptureToolResultHandler(sessionId);
    
    // Get user context if it exists from memory
    const userContext = userContexts.get(sessionId);
    if (userContext) {
      console.log(`👤 Found existing user context for session ${sessionId}:`, userContext);
    }
    
    // Get existing chat history or initialize a new one
    if (!chatHistories.has(sessionId)) {
      chatHistories.set(sessionId, []);
      console.log(`📝 Created new chat history for session ${sessionId}`);
    }
    const history = chatHistories.get(sessionId)!;
    
    // Add user message to history
    history.push({ type: 'human', content: message });
    
    // Prepare input with user context if available
    let inputToUse = message;
    if (userContext?.resourceName) {
      inputToUse = `${message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
      console.log('📝 Enhanced input with user context for session', sessionId);
    }
    
    console.log(`🤖 Invoking executor for session ${sessionId}`);
    
    // Execute with the agent
    const response = await executor.invoke(
      { input: inputToUse, chat_history: history },
      { callbacks: [toolHandler] }
    );
    
    // Extract response content
    let responseContent = '';
    if (typeof response === 'string') {
      responseContent = response;
    } else if (response.output) {
      responseContent = String(response.output);
    } else if (response.response) {
      responseContent = String(response.response);
    } else {
      const firstKey = Object.keys(response)[0];
      responseContent = firstKey ? String(response[firstKey]) : JSON.stringify(response);
    }
    
    console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? '...' : ''}"`);
    
    // Add assistant response to history
    history.push({ type: 'assistant', content: responseContent });
    
    // Limit history length to prevent memory issues (optional)
    if (history.length > 50) {
      const removed = history.splice(0, history.length - 50);
      console.log(`📚 Trimmed chat history for session ${sessionId}, removed ${removed.length} oldest messages`);
    }
    
    // Return response with session ID
    return NextResponse.json({
      response: responseContent,
      sessionId,
    });
    
  } catch (error) {
    console.error('❌ Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 