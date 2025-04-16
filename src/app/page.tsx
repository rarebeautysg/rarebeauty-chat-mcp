'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useMemo } from 'react';
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
  // Add user context state
  const [userContext, setUserContext] = useState<{ resourceName?: string; name?: string; mobile?: string } | null>(null);
  const [currentInput, setCurrentInput] = useState<string>('');

  // Add a ref to persist userContext across re-renders
  const userContextRef = useRef<{ resourceName?: string; name?: string; mobile?: string } | null>(null);
  
  // Add debugger function that logs all important state
  const debugState = () => {
    console.log('🔍 DEBUG STATE:');
    console.log('📱 User Context State:', userContext);
    console.log('📱 User Context Ref:', userContextRef.current);
    console.log('💬 Messages:', messages.length);
    console.log('🛠️ Executor Ready:', !!executor);
  };
  
  // Helper function to get the most recent user context
  const getCurrentUserContext = () => {
    // Prefer the ref value as it's always up-to-date
    return userContextRef.current || userContext;
  };
  
  // Update ref whenever state changes
  useEffect(() => {
    userContextRef.current = userContext;
    if (userContext) {
      console.log('🔑 USER CONTEXT UPDATED AND SAVED TO REF:', userContext);
      console.log(`📌 PERSISTENT REFERENCE: resourceName = "${userContext.resourceName}"`);
    }
  }, [userContext]);

  // This effect will run on mount - detect any tools that have already run from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mobile = urlParams.get('mobile');
    const name = urlParams.get('name');
    const resourceName = urlParams.get('resourceName');
    
    // If we have data in URL, use it to populate context
    if (resourceName && name && mobile) {
      console.log('📱 Found user data in URL parameters:', { resourceName, name, mobile });
      const newUserContext = { resourceName, name, mobile };
      setUserContext(newUserContext);
      userContextRef.current = newUserContext;
      console.log('🔒 Saved URL user data to context:', newUserContext);
    }
    
    // Debug state on load
    debugState();
  }, []);

  // Add periodic check to log if context is still available
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const context = getCurrentUserContext();
      if (context?.resourceName) {
        console.log('👤 User context is active:', context);
      }
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(checkInterval);
  }, []);
  
  // Function to persist user data to localStorage when found
  const persistUserData = (userData: { resourceName: string; name: string; mobile: string }) => {
    try {
      localStorage.setItem('rareBeautyUserData', JSON.stringify(userData));
      console.log('💾 User data saved to localStorage');
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  };
  
  // Load persisted user data on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('rareBeautyUserData');
      if (savedData) {
        const userData = JSON.parse(savedData);
        if (userData.resourceName) {
          console.log('📤 Loaded user data from localStorage:', userData);
          setUserContext(userData);
          userContextRef.current = userData;
        }
      }
    } catch (e) {
      console.error('Error loading from localStorage:', e);
    }
  }, []);

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

  // Log when userContext changes
  useEffect(() => {
    if (userContext) {
      console.log('🔑 USER CONTEXT UPDATED:', userContext);
      console.log(`📌 IMPORTANT: Current resourceName = "${userContext.resourceName}"`);
      console.log(`👤 User name: ${userContext.name}`);
      console.log(`📱 User mobile: ${userContext.mobile}`);
    }
  }, [userContext]);

  // Function to extract service name from input and conversation history
  const extractServiceFromHistory = (): string | null => {
    // Just return null and let OpenAI handle service extraction
    return null;
  };

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
        
        console.log("📝 Executing with contextual input:", contextualInput);
        console.log(`🔑 Current user context before execution:`, getCurrentUserContext());

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out after 90 seconds')), 90000);
        });
        
        // Race against timeout
        const result = await Promise.race([
          executor.invoke({ input: contextualInput }),
          timeoutPromise
        ]) as any;
        
        console.log('Execution result:', result);
        
        // Process tool calls to extract and share data between tools
        if (result.intermediateSteps && result.intermediateSteps.length > 0) {
          console.log(`🔄 Processing ${result.intermediateSteps.length} tool steps`);
          
          // First pass: Extract user data from lookupUser
          for (const step of result.intermediateSteps) {
            if (step.action?.tool === 'lookupUser' && step.observation) {
              console.log('🔎 Found lookupUser step:', {
                tool: step.action.tool,
                input: step.action.toolInput
              });
              
              try {
                const userData = JSON.parse(step.observation);
                if (userData && userData.resourceName) {
                  console.log('👤 User data found:', userData);
                  
                  // Store in context for other tools to use
                  const newUserContext = {
                    resourceName: userData.resourceName,
                    name: userData.name,
                    mobile: userData.mobile
                  };
                  
                  setUserContext(newUserContext);
                  userContextRef.current = newUserContext;
                  persistUserData(newUserContext);
                  
                  console.log('💾 User context saved and persisted');
                }
              } catch (e) {
                console.error('Error parsing lookupUser result:', e);
              }
            }
          }
          
          // Second pass: Inject user data into booking steps
          const currentUserContext = getCurrentUserContext();
          if (currentUserContext?.resourceName) {
            console.log('🔑 User context available for booking:', currentUserContext);
            
            for (const step of result.intermediateSteps) {
              if (step.action?.tool === 'bookAppointment' && step.action?.toolInput) {
                // Check if we need to inject user data
                if (!step.action.toolInput.resourceName || 
                    step.action.toolInput.resourceName === 'default_resource') {
                     
                  console.log('🔄 Injecting user data into booking');
                  
                  // Create complete booking input with all user data
                  const completeBookingInput = {
                    ...step.action.toolInput,
                    resourceName: currentUserContext.resourceName,
                    name: currentUserContext.name,
                    mobile: currentUserContext.mobile
                  };
                  
                  // Execute the booking with complete data
                  try {
                    const bookingTool = executor.tools.find((tool: any) => tool.name === 'bookAppointment');
                    if (bookingTool) {
                      console.log('🚀 Executing booking with user data');
                      const bookingResult = await bookingTool.call(completeBookingInput);
                      
                      // Update the step with the actual result
                      step.observation = bookingResult;
                      
                      try {
                        const parsedBookingResult = JSON.parse(bookingResult);
                        if (parsedBookingResult.success) {
                          // Remove any warning in the output about no actual booking
                          result.output = result.output.replace(
                            /⚠️ NOTE: No actual booking was made.[\s\S]+?complete a booking. ⚠️\n\n/g, 
                            ''
                          );
                          console.log('✅ Booking successful');
                        }
                      } catch (e) {
                        console.error('Error parsing booking result:', e);
                      }
                    }
                  } catch (e) {
                    console.error('Error executing booking:', e);
                  }
                }
              }
            }
          } else {
            console.log('⚠️ No user context available for booking');
          }
        }
        
        // Extract tool calls from the result if available
        const toolCalls = result.intermediateSteps?.map((step: any) => {
          return `${step.action?.tool || 'unknown'}: ${JSON.stringify(step.action?.toolInput || {})}`;
        }) || [];
        
        // Check for booking tool calls specifically
        let hasBookingCall = result.intermediateSteps?.some((step: any) => 
          (step.action?.tool === 'bookAppointment' && step.observation && 
           step.observation.includes('"success":true'))
        ) || false;
        
        // Add only the assistant response to the messages state
        const botMessage = { 
          role: 'bot', 
          content: result.output,
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
      // Debug state after processing
      debugState();
    }
  };

  // Add direct user authentication function
  const authenticateUser = async (mobileNumber: string) => {
    if (!executor) return false;
    
    try {
      console.log('🔑 Attempting to authenticate user with mobile:', mobileNumber);
      
      // Find the lookupUser tool
      const lookupTool = executor.tools.find((tool: any) => tool.name === 'lookupUser');
      if (!lookupTool) {
        console.error('❌ lookupUser tool not found');
        return false;
      }
      
      // Call the tool directly
      const result = await lookupTool.call({ mobile: mobileNumber });
      console.log('📱 lookupUser direct result:', result);
      
      try {
        const userData = JSON.parse(result);
        if (userData && userData.resourceName) {
          console.log('👤 User authenticated successfully:', userData);
          
          // Update context
          const newUserContext = {
            resourceName: userData.resourceName,
            name: userData.name,
            mobile: userData.mobile
          };
          
          setUserContext(newUserContext);
          userContextRef.current = newUserContext;
          
          // Persist data
          persistUserData(newUserContext);
          
          return true;
        }
      } catch (e) {
        console.error('Error parsing authentication result:', e);
      }
      
      return false;
    } catch (e) {
      console.error('Error in direct authentication:', e);
      return false;
    }
  };

  // Expose authentication method to window for direct use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).authenticateUser = authenticateUser;
      (window as any).getCurrentUserContext = getCurrentUserContext;
      (window as any).debugUserContext = debugState;
      
      console.log('🌍 Exposed helper functions to window object');
    }
  }, [executor]);

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
