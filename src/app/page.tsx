'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LookupUserTool } from '@/tools/lookupUser';
import { getAvailableSlotsTool as getAvailableSlots } from '@/tools/getAvailableSlots';
import { BookAppointmentTool } from '@/tools/bookAppointment';
import { ChatPromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getServicesTool as getServices } from '@/tools/getServices';
import ReactMarkdown from 'react-markdown';
import { systemPrompt } from '@/prompts/systemPrompt';
import { BufferMemory } from "langchain/memory";

export default function Home() {

  

  const memory = useMemo(() => new BufferMemory({
    returnMessages: true,
    memoryKey: "chat_history",
    inputKey: "input",
    outputKey: "output"
  }), []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [executor, setExecutor] = useState<AgentExecutor | null>(null);

  // Define input and messages state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; toolCalls?: string[] }[]>([
    {
      role: 'assistant',
      content: 'Hello! How are you! Can I have your mobile number please? 😊'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  // Add user context state
  const [userContext, setUserContext] = useState<{ resourceName?: string; name?: string; mobile?: string } | null>(null);
  const [currentInput, setCurrentInput] = useState<string>('');

  // Add a ref to persist userContext across re-renders
  const userContextRef = useRef<{ resourceName?: string; name?: string; mobile?: string } | null>(null);
  
  const toolResults: any[] = [];

  class CaptureToolResultHandler extends BaseCallbackHandler {
    name = "CaptureToolResultHandler";
   
    
    handleToolEnd(output: string, runId?: string, parentRunId?: string, tags?: string[]): Promise<void> | void {
      try {
        console.log(`🛠️ Tool output:`, output);
        const parsedOutput = typeof output === 'string' ? JSON.parse(output) : output;
        toolResults.push(parsedOutput);
        
        // Process user data from lookupUser tool results
        try {
          // Store the user info when lookupUser returns valid data
          if (parsedOutput && parsedOutput.resourceName) {
            console.log('👤 Found user data in tool result:', parsedOutput);
            
            // Save user data for future tool calls
            const userInfo = {
              resourceName: parsedOutput.resourceName,
              name: parsedOutput.name,
              mobile: parsedOutput.mobile,
            };
            
            console.log('🔒 Stored user data for future tool calls:', userInfo);
            
            // Also update the React state
            setUserContext(userInfo);
            userContextRef.current = userInfo;
            
            // Log to debug any issues with resourceName
            console.log('🔑 resourceName set to:', parsedOutput.resourceName);
          }
        } catch (e) {
          // If parsing fails or data doesn't have resourceName, ignore
          console.error('❌ Error processing tool output:', e);
        }
      } catch (e) {
        // If not JSON or doesn't have resourceName, ignore
        console.log(`⚠️ Could not parse tool output as JSON:`, e);
        toolResults.push(output);
      }
    }
  }
  
  // Create a persistent instance of the handler
  const toolHandler = new CaptureToolResultHandler();
  
  // Add debugger function that logs all important state
  const debugState = () => {
    console.log('🔍 DEBUG STATE:');
    console.log('📱 User Context State:', userContext);
    console.log('💬 Messages:', messages.length);
    console.log('🛠️ Executor Ready:', !!executor);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  // Initialize executor properly
  useEffect(() => {
    const initializeExecutor = async () => {
      try {
        // Create the tools properly - the problem is here
        const lookupUser = new LookupUserTool();
        console.log("🔧 Initialized LookupUserTool with name:", lookupUser.name);
        
        const bookAppointment = new BookAppointmentTool();
        const tools = [
          lookupUser,
          getServices,
          getAvailableSlots,
          bookAppointment,          
        ];

        // Log all tool names to debug
        console.log("🧰 Tool names:", tools.map(tool => tool.name));

        // 2. Setup LLM
        const llm = new ChatOpenAI({
          temperature: 0,
          modelName: 'gpt-4o',
          apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        });

        // Add debug logging for API key
        console.log("API Key available:", !!process.env.NEXT_PUBLIC_OPENAI_API_KEY);

        const prompt = ChatPromptTemplate.fromMessages([
          ["system", systemPrompt],
          new MessagesPlaceholder("chat_history"),        // 🧠 Enables memory
          ["human", "{input}"],
          ["system", "{agent_scratchpad}"]   // 🛠️ Enables tool output trace
        ]);

        const agent = await createToolCallingAgent({
          llm,
          tools,
          prompt,
        });

        // Define executor instance without memory to test
        const executorInstance = new AgentExecutor({
          agent,
          tools,          
          returnIntermediateSteps: true,
          memory  // Comment out memory to test if it's causing the input values issue
        });
        
        setExecutor(executorInstance);
      } catch (err) {
        console.error('Error initializing executor:', err);
      }
    };
    initializeExecutor();
  }, []);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Log when messages change
  useEffect(() => {
    console.log('Messages updated:', messages);
  }, [messages]);

  // Update handleFormSubmit with better tool handling
  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (!executor) {
      console.error("Executor not initialized");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // Create user message
    const userMessage = {
      role: 'user',
      content: input,
    };

    // Add user message to the messages array
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Save the current input before clearing it
    const currentInput = input;
    setInput('');
    
    try {
      console.log("🔍 Submitting message:", currentInput);
      
      // Get the current user context
      const currentUserContext = userContextRef.current;
      console.log("👤 Current user context:", currentUserContext);
      
      if (!executor) {
        throw new Error("Executor not initialized");
      }
      
      // Explicitly log the current resourceName for debugging
      let inputToUse = currentInput;
      if (currentUserContext && currentUserContext.resourceName) {
        console.log("📌 Using resourceName:", currentUserContext.resourceName);
        // Ensure it's in the message to help the agent use the right value
        inputToUse = `${currentInput} (User context: ResourceName=${currentUserContext.resourceName}, Name=${currentUserContext.name})`;
        console.log("📝 Enhanced input:", inputToUse);
      }

      // Execute with the input (regular or enhanced with context)
      const response = await executor.invoke(
        { input: inputToUse },
        { callbacks: [toolHandler] }
      );
      
      // Log all the important state after execution
      console.log("✅ Execution result:", response);
      // console.log("💬 Memory content:", memory);
      console.log("🔍 Final userContextRef:", userContextRef.current);
      
      // Extract a string response, handling different result formats
      let responseContent = "";
      if (typeof response === 'string') {
        responseContent = response;
      } else if (response.output) {
        responseContent = String(response.output);
      } else if (response.response) {
        responseContent = String(response.response);
      } else {
        // For complex objects, stringify the first available property
        const firstKey = Object.keys(response)[0];
        responseContent = firstKey ? String(response[firstKey]) : JSON.stringify(response);
      }
      
      // Add bot message to the messages array
      const botMessage = { 
        role: 'assistant', 
        content: responseContent
      };
      
      setMessages(prevMessages => [...prevMessages, botMessage]);
    } catch (error) {
      console.error("❌ Error during execution:", error);
      const errorMessage = { 
        role: 'assistant', 
        content: `I'm sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.` 
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      setError({ message: error instanceof Error ? error.message : 'An unknown error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Chat container */}
      <div className="flex-1 p-4 container mx-auto max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
          {/* Chat header */}
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Rare Beauty Chat</h2>
          </div>

          {/* Chat messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex items-start gap-2.5 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div className={`relative w-8 h-8 overflow-hidden ${
                  message.role === 'user' ? 'bg-blue-100' : 'bg-white'
                } rounded-full flex items-center justify-center`}>
                  {message.role === 'user' ? (
                    <span className="text-blue-600 text-sm font-semibold">U</span>
                  ) : (
                    <Image
                      src="/rb-logo.png"
                      alt="Rare Beauty logo"
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                  )}
                </div>
                <div className={`flex flex-col w-full max-w-[320px] leading-1.5 ${
                  message.role === 'user' ? 'items-end' : ''
                }`}>
                  <div className={`p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white rounded-s-xl rounded-ee-xl'
                      : 'bg-gray-100 text-gray-900 rounded-e-xl rounded-es-xl'
                  }`}>
                    {message.role === 'user' ? (
                      <p className="text-sm font-normal">{message.content}</p>
                    ) : (
                      <div className="text-sm font-normal markdown-content">
                        <ReactMarkdown
                          components={{
                            p: ({node, ...props}) => {
                              // Check if this paragraph contains a category header (like "Lashes" or "Facial")
                              const content = String(props.children || '');
                              // Check for standalone category headers that might be bolded in markdown
                              const isCategoryHeader = /^(\*\*)?(?:Lashes|Facial|Threading|Waxing|Skin)(\*\*)?$/.test(content.trim());
                              return <p className={isCategoryHeader ? "font-bold text-lg mt-4 mb-2" : "my-0"} {...props} />;
                            },
                            h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-3 mb-1" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-1" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-md font-bold mt-2 mb-0.5" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-none pl-0 my-0" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-0" {...props} />,
                            li: ({node, ...props}) => <li className="my-0" {...props} />,
                            pre: ({node, ...props}) => <pre className="bg-gray-100 p-2 rounded my-1 overflow-x-auto" {...props} />,
                            strong: ({node, children, ...props}) => {
                              const content = String(children || '');
                              const isCategoryHeader = /^(?:Lashes|Facial|Threading|Waxing|Skin)$/.test(content.trim());
                              return isCategoryHeader ? 
                                <strong className="block text-lg mt-4 mb-2" {...props}>{children}</strong> : 
                                <strong {...props}>{children}</strong>;
                            }
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 mt-1">
                    {message.role === 'user' ? 'You' : 'Bot'} • Just now
                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <span className="ml-2 text-xs text-blue-500">
                        {message.toolCalls.length} tool{message.toolCalls.length > 1 ? 's' : ''} used
                      </span>
                    )}
                  </span>
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded-md">
                      <details>
                        <summary className="cursor-pointer text-blue-500">Tool calls</summary>
                        <ul className="mt-1 list-disc pl-4">
                          {message.toolCalls.map((call, idx) => (
                            <li key={idx} className="text-xs break-all">{call}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
            
            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 text-red-500 rounded-lg">
                Error: {error.message}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div className="p-4 border-t">
            <form onSubmit={handleMessageSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type your message..."
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`px-4 py-2 bg-blue-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLoading 
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-blue-600'
                }`}
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
