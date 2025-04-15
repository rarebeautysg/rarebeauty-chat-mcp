'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { lookupUserTool } from '@/tools/lookupUser';
import { getAvailableSlotsTool } from '@/tools/getAvailableSlots';
import { bookAppointmentTool } from '@/tools/bookAppointment';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getServicesTool } from '@/tools/getServices';
import ReactMarkdown from 'react-markdown';
import { systemPrompt } from '@/prompts/systemPrompt';

export default function Home() {

  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [executor, setExecutor] = useState<AgentExecutor | null>(null);

  // Define input and messages state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; toolCalls?: string[] }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  // Initialize executor properly
  useEffect(() => {
    const initializeExecutor = async () => {
      try {
        // 1. Create tools
        const tools = [
          lookupUserTool,
          getAvailableSlotsTool,
          bookAppointmentTool,
          getServicesTool,
        ];

        // 2. Setup LLM
        const llm = new ChatOpenAI({
          temperature: 0,
          modelName: 'gpt-4o',
          
          apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        });

        // Add debug logging for API key
        console.log("API Key available:", !!process.env.NEXT_PUBLIC_OPENAI_API_KEY);

        // 3. Create the agent with tool-calling support
        const prompt = ChatPromptTemplate.fromMessages([
          ["system", systemPrompt],
          ["human", "{input}"],
          ["system", "{agent_scratchpad}"]
        ]);

        const agent = await createToolCallingAgent({
          llm,
          tools,
          prompt: prompt,
        });

        // 4. Create the executor
        const executorInstance = new AgentExecutor({
          agent,
          tools,
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
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting message:', input);
    
    // Skip if input is empty
    if (!input.trim()) return;
    
    // Create user message
    const userMessage = { role: 'user', content: input };
    
    // Immediately display user message
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Save input and clear the input field
    const currentInput = input;
    setInput('');
    
    // Now start loading and process the AI response
    setIsLoading(true);
    try {
      if (executor) {
        console.log("Executing with input:", currentInput);
        
        // Create message history string for context
        const messageHistory = messages.map(msg => 
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        ).join('\n');
        
        // Combine history with current input to maintain context
        const contextualInput = messageHistory ? 
          `${messageHistory}\nUser: ${currentInput}` : 
          currentInput;
        
        console.log("Executing with contextual input including history");
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out after 90 seconds')), 90000);
        });
        
        // Add debug messages for tool calls
        const executorWithLogging = {
          ...executor,
          invoke: async (input: any) => {
            console.log('Starting executor.invoke with input:', input);
            try {
              const result = await executor.invoke(input);
              console.log('Executor returned result:', result);
              return result;
            } catch (error) {
              console.error('Executor error:', error);
              throw error;
            }
          }
        };
        
        // Race against timeout
        const result = await Promise.race([
          executorWithLogging.invoke({ input: contextualInput }),
          timeoutPromise
        ]) as any;
        
        console.log('Execution result:', result);
        
        // Verify the output exists
        if (!result || !result.output) {
          throw new Error('The assistant returned an empty response');
        }
        
        // Extract tool calls from the result if available
        const toolCalls = result.intermediateSteps?.map((step: any) => {
          console.log('Tool step:', step);
          return `${step.action?.tool || 'unknown'}: ${JSON.stringify(step.action?.toolInput || {})}`;
        }) || [];
        
        // Check for booking tool calls specifically
        const hasBookingCall = toolCalls.some((call: string) => call.startsWith('bookAppointment:'));
        
        // If the response mentions booking but didn't call the tool, add a warning
        const responseText = result.output;
        const mentionsBooking = responseText.toLowerCase().includes('book') && 
                                (responseText.toLowerCase().includes('appointment') || 
                                 responseText.toLowerCase().includes('confirmed'));
        
        let finalResponse = responseText;
        
        if (mentionsBooking && !hasBookingCall) {
          finalResponse = `⚠️ NOTE: No actual booking was made. The assistant needs more information to complete a booking. ⚠️\n\n${responseText}`;
        }
        
        // Add only the assistant response to the messages state
        const botMessage = { 
          role: 'bot', 
          content: finalResponse,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined 
        };
        setMessages(prevMessages => [...prevMessages, botMessage]);
        
        // Reset active tool
        setActiveTool(null);
      } else {
        console.error("Executor not initialized yet");
        setError({ message: "Chat system is still initializing. Please try again in a moment." });
      }
    } catch (err) {
      console.error('Error executing message:', err);
      if (err instanceof Error) {
        // Display a user-friendly error message
        const errorMessage = { 
          role: 'bot', 
          content: `I'm sorry, I encountered an error while processing your request: ${err.message}. Please try again.` 
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        setError({ message: err.message || 'An error occurred' });
      } else {
        setError({ message: 'An unknown error occurred' });
      }
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
                      <div className="text-sm font-normal markdown-content whitespace-pre-wrap [&_p]:my-0.5">
                        <ReactMarkdown
                          components={{
                            p: ({node, ...props}) => <p className="my-0.5" {...props} />,
                            h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-3 mb-1" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-3 mb-1" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-md font-bold mt-2 mb-0.5" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-none pl-0 my-0.5" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-0.5" {...props} />,
                            li: ({node, ...props}) => <li className="my-0.5" {...props} />,
                            pre: ({node, ...props}) => <pre className="bg-gray-100 p-2 rounded my-1 overflow-x-auto" {...props} />,
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
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
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
