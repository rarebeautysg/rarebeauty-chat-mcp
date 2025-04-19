import { NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { lookupUserTool, getAvailableSlotsTool, getServicesTool, bookAppointmentTool } from '@/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { systemPrompt } from '@/prompts/systemPrompt';
import { ToolResult } from '@/types/tools';

// Store executors and context in memory keyed by session ID
export const executors = new Map<string, AgentExecutor>();
export const toolResults = new Map<string, ToolResult[]>();
export const userContexts = new Map<string, any>();
export const chatHistories = new Map<string, Array<{ type: string; content: string }>>();

async function getOrCreateExecutor(sessionId: string): Promise<AgentExecutor> {
  // Return existing executor if it exists
  if (executors.has(sessionId)) {
    return executors.get(sessionId)!;
  }
  
  console.log(`🔧 Creating new executor for session ${sessionId}`);
  
  // Set up tools - use imported instances
  const tools = [
    lookupUserTool,
    getServicesTool,
    getAvailableSlotsTool,
    bookAppointmentTool,
  ];
  
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
  
  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
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
  
  // Create executor
  const executor = new AgentExecutor({
    agent,
    tools,
    returnIntermediateSteps: true,
    // verbose: process.env.NODE_ENV !== 'production', // Enable verbose mode in non-production
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
    
    // Handle special welcome message request
    if (message === "__WELCOME__") {
      console.log(`🌟 Sending welcome message for new session ${sessionId}`);
      return NextResponse.json({
        response: "Hello there! How are you doing today? Can I have your mobile number so I can better help you?",
        sessionId
      });
    }
    
    console.log(`📨 Received message for session ${sessionId}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    
    // Get or create executor
    let executor;
    let toolsAvailable = [];
    try {
      executor = await getOrCreateExecutor(sessionId);
      // Capture tools for error reporting
      toolsAvailable = executor.tools.map(t => t.name);
    } catch (executorError) {
      console.error(`❌ Error creating executor: ${executorError}`);
      return NextResponse.json(
        { error: 'Failed to initialize chat backend', details: executorError instanceof Error ? executorError.message : String(executorError) },
        { status: 500 }
      );
    }
    
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
    
    // Invoke the executor with the enhanced input
    console.log("🤖 [enhanceUserInput] Enhanced input:", JSON.stringify(inputToUse));
    
    try {
      console.log("🧰 [API] About to invoke executor with input:", JSON.stringify(inputToUse));
      
      const result = await executor.invoke({
        input: inputToUse,
        chat_history: history.map(msg => {
          if (msg.type === 'human') {
            return { role: 'human', content: msg.content };
          } else {
            return { role: 'assistant', content: msg.content };
          }
        }),
      });
      console.log("✅ [API] Executor result:", JSON.stringify(result));
      
      // Manually extract and process tool results from intermediateSteps
      if (result.intermediateSteps) {
        console.log("🔍 Found intermediate steps:", result.intermediateSteps.length);
        for (const step of result.intermediateSteps) {
          if (step.action?.tool && step.observation) {
            console.log(`🔄 Processing tool result manually - Tool: ${step.action.tool}`);
            try {
              let observation = step.observation;
              // Extract tool results
              let parsedObservation;
              if (typeof observation === 'string') {
                try {
                  parsedObservation = JSON.parse(observation);
                } catch (e) {
                  parsedObservation = { rawOutput: observation };
                }
              } else {
                parsedObservation = observation;
              }
              
              // Store all tool results
              if (!toolResults.has(sessionId)) {
                toolResults.set(sessionId, []);
              }
              const sessionToolResults = toolResults.get(sessionId)!;
              sessionToolResults.push(parsedObservation);
              
              // Process user data from lookupUser tool
              if (step.action.tool === 'lookupUser' && parsedObservation && parsedObservation.resourceName) {
                console.log('👤 Manually found user data:', parsedObservation);
                
                // Save user data in memory for future tool calls
                const updatedContext = {
                  resourceName: parsedObservation.resourceName,
                  name: parsedObservation.name,
                  mobile: parsedObservation.mobile,
                  updatedAt: new Date().toISOString()
                };
                
                userContexts.set(sessionId, updatedContext);
                
                console.log('🔑 Manually stored user context for session', sessionId, ':', updatedContext);
              }
            } catch (e) {
              console.error('❌ Error manually processing step:', e);
            }
          }
        }
      }
      
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