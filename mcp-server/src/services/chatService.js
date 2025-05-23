const { createAdminSystemPrompt, createCustomerSystemPrompt } = require('../prompts');
const { ChatOpenAI } = require('@langchain/openai');
const MCPContext = require('../models/MCPContext');
const { createTools } = require('../tools');
const { wrapToolCall, wrapToolResult, validateToolCall, validateToolResult } = require('../schemas/stido');

/**
 * Service to handle chat interactions with the LLM
 */
class ChatService {
  constructor() {
    // Store executors in memory keyed by session ID
    this.executors = new Map();
    this.adminExecutors = new Map();
    // Create a single map to store all contexts
    this.contexts = new Map();
    // Flag to track if history was fixed during processing
    this.historyWasFixed = false;
  }

  /**
   * Get current date information for prompts
   */
  getDateInfo() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = now.toLocaleDateString('en-US', options);
    
    // Sunday is 0, Saturday is 6
    const isSunday = now.getDay() === 0;
    const isPublicHoliday = false; // Placeholder for holiday check
    const holidayName = "";
    
    let todayStatus = "The salon is open today.";
    if (isSunday || isPublicHoliday) {
      todayStatus = `The salon is CLOSED today${isPublicHoliday ? ` (${holidayName})` : ''}.`;
    }
    
    return {
      formattedDate,
      isSunday,
      isPublicHoliday,
      holidayName,
      todayStatus
    };
  }

  /**
   * Convert a tool to LLM function format
   * @param {Object} tool - Tool to convert
   * @returns {Object} Tool in LLM function format
   */
  convertToolToFunction(tool) {
    // Default empty parameters structure
    let parameters = { type: 'object', properties: {}, required: [] };
    
    // Check if the tool has its own parameter conversion method
    if (tool.getParametersSchema) {
      parameters = tool.getParametersSchema();
    }
    // Use schema if available (for Zod schemas)
    else if (tool.schema && tool.schema.shape) {
      try {
        // Convert schema.shape to JSON Schema properties
        for (const [key, value] of Object.entries(tool.schema.shape)) {
          parameters.properties[key] = {
            type: value._def.typeName === 'ZodNumber' ? 'number' : 
                  value._def.typeName === 'ZodBoolean' ? 'boolean' : 'string',
            description: value.description || `Parameter ${key}`
          };
          
          // Add to required list if not optional
          if (!value.isOptional()) {
            parameters.required.push(key);
          }
        }
      } catch (e) {
        console.warn(`Error converting schema for ${tool.name}:`, e.message);
      }
    }
    
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters
      }
    };
  }

  /**
   * Parse tool arguments from various formats
   * @param {string|Object} rawArgs - Raw arguments from the LLM
   * @returns {Object} Parsed arguments 
   */
  parseToolArguments(rawArgs) {
    if (!rawArgs) return {};
    
    try {
      if (typeof rawArgs === 'string') {
        return JSON.parse(rawArgs);
      } else if (typeof rawArgs === 'object') {
        return rawArgs;
      }
      return {};
    } catch (error) {
      console.warn(`Error parsing tool arguments: ${error.message}`);
      return {};
    }
  }

  /**
   * Normalize tool call format
   * @param {Object} toolCall - Tool call from LLM
   * @returns {Object} Normalized tool call
   */
  normalizeToolCall(toolCall) {
    // If it's already in the correct format, return it
    if (toolCall.function && toolCall.function.name) {
      return {
        id: toolCall.id,
        function: {
          name: toolCall.function.name,
          arguments: typeof toolCall.function.arguments === 'string'
            ? toolCall.function.arguments
            : JSON.stringify(toolCall.function.arguments || {})
        }
      };
    }

    // If it's in the legacy format (name and args directly on object)
    if (toolCall.name) {
      return {
        id: toolCall.id,
        function: {
          name: toolCall.name,
          arguments: typeof toolCall.args === 'string'
            ? toolCall.args
            : JSON.stringify(toolCall.args || {})
        }
      };
    }

    // If it's invalid, return null
    return null;
  }

  /**
   * Get or create an executor for a session
   * @param {string} sessionId - Session ID
   * @param {MCPContext} context - The context for this session
   * @param {boolean} isAdmin - Whether this is an admin session
   * @returns {Object} Executor for handling LLM requests
   */
  async getExecutor(sessionId, context, isAdmin = false) {
    // Get the appropriate executor map
    const executorMap = isAdmin ? this.adminExecutors : this.executors;
    
    // Log session information
    console.log(`🔄 Getting executor for session ${sessionId}`);
    
    // First check if this executor already exists
    if (executorMap.has(sessionId)) {
      console.log(`🔄 Reusing existing executor for session ${sessionId}`);
      // Do a simple check to make sure the executor has an invoke method
      const existingExecutor = executorMap.get(sessionId);
      if (typeof existingExecutor.invoke === 'function') {
        return existingExecutor;
      } else {
        console.log(`⚠️ Existing executor doesn't have invoke method, creating a new one`);
        // Continue to create a new executor
      }
    }
    
    // Store the context for future reference
    this.contexts.set(sessionId, context);
    
    // Get date info for prompt generation
    const dateInfo = this.getDateInfo();
    
    // Create the system prompt using the appropriate function - now handling async
    const isContextAdmin = context.memory?.admin_mode === true;
    const systemPromptFunction = isContextAdmin ? 
      require('../prompts/systemPrompt-admin').createSystemPrompt : 
      require('../prompts/systemPrompt-customer').createSystemPrompt;
    
    // Generate the system prompt without intent parameter
    const systemMessage = await systemPromptFunction(context.toJSON(), dateInfo);
    
    // Create context-aware tools
    const tools = createTools(context.toJSON(), sessionId, isContextAdmin);
    console.log(`Creating agent for session ${sessionId} with ${tools.length} tools`);
    
    // Create the LLM with streaming disabled
    const llm = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
      streaming: false
    });
    
    // Store reference to this ChatService instance
    const chatService = this;
    
    // Create a simplified executor
    const executor = {
      async invoke({ input }) {
        try {
          console.log(`Executing agent for session ${sessionId} with input: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);
          console.log(`Context admin_mode: ${context.memory.admin_mode === true ? 'true' : 'false'}`);
          
          // Reset the history fix flag
          chatService.historyWasFixed = false;
          
          // Prepare messages
          const messages = [
            {
              role: "system",
              content: systemMessage + "\n\nContext Memory: " + JSON.stringify(context.memory || {}, null, 2)
            }
          ];
          
          // Add conversation history from the context (up to last 20 messages to avoid token limits)
          if (context.history && Array.isArray(context.history) && context.history.length > 0) {
            const recentHistory = context.history.slice(-20);
            console.log(`Adding ${recentHistory.length} messages from history to provide conversation context`);
            
            // Filter and validate the conversation history
            const validatedHistory = chatService.validateConversationHistory(recentHistory);
            console.log(`Validated history contains ${validatedHistory.length} messages after filtering`);
            
            messages.push(...validatedHistory);
          }
          
          // Add the current user input
          messages.push({
            role: "user",
            content: input
          });
          
          // Debug available tools
          console.log(`🔧 Available tools for LLM: ${tools.map(t => t.name).join(', ')}`);
          
          // Bind tools to the LLM
          const llmWithTools = llm.bind({
            tools: tools.map(tool => chatService.convertToolToFunction(tool)),
            tool_choice: "auto"
          });
          
          // Get response from LLM
          console.log('Making LLM call with tools');
          const llmResponse = await llmWithTools.invoke(messages);
          console.log(`Received LLM response (${llmResponse.content ? llmResponse.content.length : 0} chars)`);
          
          // Get content from response (with fallback)
          let responseContent = llmResponse.content || "I am processing your request...";
          
          // Check for tool calls
          if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            console.log(`Raw tool calls from LLM:`, JSON.stringify(llmResponse.tool_calls));
            
            // Normalize tool calls to ensure they're in the correct format
            const normalizedToolCalls = llmResponse.tool_calls
              .map(tc => chatService.normalizeToolCall(tc))
              .filter(tc => tc !== null);
            
            if (normalizedToolCalls.length === 0) {
              console.log('⚠️ No valid tool calls after normalization');
              return { output: responseContent };
            }
            
            // Log normalized tool calls
            console.log(`Normalized tool calls:`, JSON.stringify(normalizedToolCalls));
            
            // Instead of creating simplified messages, restore the original approach
            // with better validation
            const finalMessages = [...messages];
            
            // Add assistant message with tool calls
            if (normalizedToolCalls.length > 0) {
              // Add the assistant message with tool calls to history
              const assistantMessageWithTools = {
                role: "assistant",
                content: responseContent,
                tool_calls: normalizedToolCalls.map(tc => ({
                  id: tc.id,
                  function: {
                    name: tc.function.name,
                    arguments: typeof tc.function.arguments === 'string' 
                      ? tc.function.arguments 
                      : JSON.stringify(tc.function.arguments || {})
                  }
                }))
              };
              
              // Validation check before adding to messages
              const toolCallsValid = assistantMessageWithTools.tool_calls.every(tc => 
                tc && tc.id && tc.function && tc.function.name && tc.function.arguments
              );
              
              if (toolCallsValid) {
                finalMessages.push(assistantMessageWithTools);
                
                // Add tool responses
                const toolResponses = [];
                for (const toolCall of normalizedToolCalls) {
                  const toolName = toolCall.function.name;
                  const tool = tools.find(t => t.name === toolName);
                  
                  if (!tool) {
                    console.warn(`Tool ${toolName} not found`);
                    const toolResponse = {
                      tool_call_id: toolCall.id,
                      role: "tool",
                      name: toolName,
                      content: JSON.stringify({ error: `Tool ${toolName} not found` })
                    };
                    toolResponses.push(toolResponse);
                    
                    // Add tool response to context
                    try {
                      context.addMessage(toolResponse);
                    } catch (error) {
                      console.error(`Error adding tool response to context: ${error.message}`);
                    }
                    
                    continue;
                  }
                  
                  // Parse tool arguments
                  const args = chatService.parseToolArguments(toolCall.function.arguments);
                  console.log(`Calling tool ${toolName} with args:`, args);
                  
                  // Call the tool
                  try {
                    const toolResult = await tool._call(args);
                    
                    // Update context if the tool returned context updates
                    if (toolResult && toolResult.contextUpdates) {
                      context.update(toolResult.contextUpdates);
                      delete toolResult.contextUpdates; // Remove from response
                    }
                    
                    const toolContent = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
                    const toolResponse = {
                      tool_call_id: toolCall.id,
                      role: "tool",
                      name: toolName,
                      content: toolContent
                    };
                    
                    toolResponses.push(toolResponse);
                    
                    // Add tool response to context
                    try {
                      context.addMessage(toolResponse);
                    } catch (error) {
                      console.error(`Error adding tool response to context: ${error.message}`);
                    }
                  } catch (error) {
                    console.error(`Error executing tool ${toolName}:`, error);
                    const toolResponse = {
                      tool_call_id: toolCall.id,
                      role: "tool",
                      name: toolName,
                      content: JSON.stringify({ error: error.message || 'Unknown error' })
                    };
                    
                    toolResponses.push(toolResponse);
                    
                    // Add tool response to context
                    try {
                      context.addMessage(toolResponse);
                    } catch (error) {
                      console.error(`Error adding tool response to context: ${error.message}`);
                    }
                  }
                }
                
                // Add tool responses
                toolResponses.forEach(response => {
                  if (response.tool_call_id && response.name) {
                    finalMessages.push(response);
                  }
                });
              } else {
                console.error("❌ Invalid tool calls format detected - using simplified approach");
                // Clean up the history but preserve the latest user input
                const cleanedMessages = [
                  // Always keep the system message
                  {
                    role: "system",
                    content: systemMessage + "\n\nContext Memory: " + JSON.stringify(context.memory || {}, null, 2)
                  },
                  // Add the latest user input
                  {
                    role: "user",
                    content: input
                  }
                ];
                
                console.log(`Created clean history with ${cleanedMessages.length} messages`);
                
                try {
                  // Try with a clean slate
                  const cleanResponse = await llm.invoke(cleanedMessages);
                  
                  // Add the assistant response to context
                  try {
                    context.addMessage({
                      role: "assistant",
                      content: cleanResponse.content || responseContent
                    });
                  } catch (error) {
                    console.error(`Error adding final assistant response to context: ${error.message}`);
                  }
                  
                  return { output: cleanResponse.content || responseContent };
                } catch (cleanError) {
                  console.error('Error even with clean history:', cleanError);
                  return { output: "I'm sorry, I encountered an issue while processing your request. Please try again." };
                }
              }
            }
            
            // Debug print the messages - moved this to after final response is added
            // console.log('Final messages:', JSON.stringify(finalMessages.slice(-5), null, 2));
            
            // Get final response using normal LLM
            console.log('Getting final response after tool calls');
            
            try {
              // Use LangChain properly to avoid tool format issues
              const langChainMessages = finalMessages.map(msg => {
                // Convert each message to LangChain format
                if (msg.role === 'assistant' && msg.tool_calls) {
                  // Make sure tool_calls are in the correct format
                  const formattedToolCalls = msg.tool_calls.map(tc => {
                    return {
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments
                      }
                    };
                  });
                  
                  return {
                    role: 'assistant',
                    content: msg.content || '',
                    tool_calls: formattedToolCalls
                  };
                } else if (msg.role === 'tool') {
                  // Make sure tool messages have the right format
                  return {
                    role: 'tool',
                    tool_call_id: msg.tool_call_id,
                    name: msg.name,
                    content: msg.content || ''
                  };
                } else {
                  // User or system messages
                  return {
                    role: msg.role,
                    content: msg.content || ''
                  };
                }
              });
              
              const finalResponse = await llm.invoke(langChainMessages);
              responseContent = finalResponse.content || responseContent;
              
              // Ensure we add the final assistant response to the context
              context.addMessage({
                role: "assistant",
                content: responseContent
              });
              console.log(`Added final assistant response to context: "${responseContent.substring(0, 50)}${responseContent.length > 50 ? '...' : ''}"`);
              
              // Debug print the complete conversation history after all responses are added
              console.log('Final conversation history:', JSON.stringify(context.history?.slice(-7) || [], null, 2));
            } catch (error) {
              console.error('Error getting final response:', error);
              
              // If the error is related to message sequence, try to fix the history
              if (error.message && (
                  error.message.includes('tool_calls') ||
                  error.message.includes('tool must be a response')
              )) {
                console.log('Detected tool sequence issue, fixing history...');
                // Clean up the conversation history
                const cleanedMessages = [
                  // Always keep the system message
                  finalMessages[0]
                ];
                
                // Add only user messages to preserve the conversation flow
                const userMessages = finalMessages.filter(m => m.role === 'user');
                cleanedMessages.push(...userMessages);
                
                console.log(`Cleaned history to ${cleanedMessages.length} messages`);
                
                try {
                  // Try again with the cleaned history
                  const cleanResponse = await llm.invoke(cleanedMessages);
                  responseContent = cleanResponse.content || responseContent;
                  console.log('Successfully got response with cleaned history');
                  
                  // Add the clean response to context
                  context.addMessage({
                    role: "assistant",
                    content: responseContent
                  });
                  console.log(`Added cleaned assistant response to context: "${responseContent.substring(0, 50)}${responseContent.length > 50 ? '...' : ''}"`);
                  
                  // Debug print the complete conversation history after cleaned response
                  console.log('Final conversation history (cleaned):', JSON.stringify(context.history?.slice(-7) || [], null, 2));
                } catch (cleanError) {
                  console.error('Error even with cleaned history:', cleanError);
                  responseContent = "I'm sorry, I encountered an issue while processing your request. Please try again.";
                  
                  // Add error response to context
                  context.addMessage({
                    role: "assistant",
                    content: responseContent
                  });
                  
                  // Debug print the complete conversation history after error response
                  console.log('Final conversation history (error):', JSON.stringify(context.history?.slice(-7) || [], null, 2));
                }
              } else {
                // For other errors, use a default response
                responseContent = "I'm sorry, I encountered an issue while processing your request. Please try again.";
                
                // Add error response to context
                context.addMessage({
                  role: "assistant",
                  content: responseContent
                });
                
                // Debug print the complete conversation history after error response
                console.log('Final conversation history (general error):', JSON.stringify(context.history?.slice(-7) || [], null, 2));
              }
            }
          } else {
            // No tool calls, just add the assistant response to context
            try {
              context.addMessage({
                role: "assistant",
                content: responseContent
              });
              console.log(`Added assistant response to context (no tools): "${responseContent.substring(0, 50)}${responseContent.length > 50 ? '...' : ''}"`);
              
              // Debug print the complete conversation history for no-tool responses
              console.log('Final conversation history (no tools):', JSON.stringify(context.history?.slice(-7) || [], null, 2));
            } catch (error) {
              console.error(`Error adding assistant response to context: ${error.message}`);
            }
          }
          
          return { output: responseContent };
        } catch (error) {
          console.error(`Error in executor for session ${sessionId}:`, error);
          return { output: `I'm sorry, there was an error processing your request. ${error.message}` };
        }
      }
    };
    
    // Store the executor
    executorMap.set(sessionId, executor);
    return executor;
  }

  /**
   * Process a message from the user
   * @param {string} sessionId - The session ID
   * @param {MCPContext} mcpContext - The context for this session
   * @param {Object} message - The message to process
   * @param {boolean} isAdmin - Whether this is an admin session
   * @returns {Promise<Object>} The response and updated context
   */
  async processMessage(sessionId, mcpContext, message, isAdmin = false) {    
    // Ensure we have a valid context
    const context = mcpContext || new MCPContext();
    
    // Reset history fix flag
    this.historyWasFixed = false;
    
    // Extract message content
    const messageContent = typeof message === 'string' ? message : (message.content || '');
    
    // Check if this exact message was already added recently to prevent duplicates
    const isDuplicateMessage = this.isRecentDuplicateMessage(context, messageContent);
    
    if (!isDuplicateMessage) {
      // Add the message to the context only if it's not a duplicate
      try {
        context.addMessage({ role: 'user', content: messageContent });
        console.log(`✅ Added new user message to context: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`);
      } catch (error) {
        console.error(`Error adding user message to context: ${error.message}`);
      }
    } else {
      console.log(`🔄 Skipping duplicate user message: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`);
    }
    
    // Store context for this session
    this.contexts.set(sessionId, context);
    
    // Get the executor for this session
    const isContextAdmin = context.memory?.admin_mode === true;
    const executor = await this.getExecutor(sessionId, context, isContextAdmin);
    
    // Process the message
    let response;
    try {
      response = await executor.invoke({
        input: messageContent
      });
    } catch (error) {
      console.error(`Error invoking executor for session ${sessionId}:`, error);
      throw error;
    }
    
    // Store the updated context
    this.contexts.set(sessionId, context);
    
    // If we fixed history, persist the changes to DynamoDB
    if (this.historyWasFixed) {
      console.log('History was fixed during processing - persisting changes to storage');
      try {
        const memoryService = require('./memoryService');
        const resourceName = context.memory?.identity?.user_id || 
                          context.memory?.user_info?.resourceName ||
                          memoryService.extractResourceName(context.memory);
        
        if (resourceName) {
          await memoryService.saveMemoryByResourceName(sessionId, resourceName, context.toJSON());
          console.log(`✅ Successfully persisted fixed history to storage for ${resourceName}`);
        }
      } catch (error) {
        console.error(`Error persisting fixed history to storage: ${error.message}`);
      }
    }
    
    // Return the response and updated context
    return {
      response: { content: response.output },
      updatedContext: context.toJSON()
    };
  }

  /**
   * Check if a user message is a recent duplicate in the context
   * @param {MCPContext} context - The conversation context
   * @param {string} messageContent - The message content to check
   * @returns {boolean} - True if the message is a recent duplicate
   */
  isRecentDuplicateMessage(context, messageContent) {
    if (!context || !context.history || !Array.isArray(context.history) || context.history.length === 0) {
      return false;
    }
    
    // Check the last few messages (last 3) to see if this exact user message exists
    const recentMessages = context.history.slice(-3);
    
    for (const msg of recentMessages) {
      if (msg.role === 'user' && msg.content === messageContent) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a user message is a duplicate of the last user message in the context
   * @param {MCPContext} context - The conversation context
   * @param {string} messageContent - The message content to check
   * @returns {boolean} - True if the message is a duplicate
   */
  isDuplicateUserMessage(context, messageContent) {
    if (!context || !context.history || !Array.isArray(context.history) || context.history.length === 0) {
      return false;
    }
    
    // Find the last user message in the history
    for (let i = context.history.length - 1; i >= 0; i--) {
      const msg = context.history[i];
      if (msg.role === 'user') {
        // Compare with current message content
        return msg.content === messageContent;
      }
    }
    
    return false;
  }

  /**
   * Handles direct tool calls and updates context
   * This is a simple passthrough to tools without LLM involvement
   * @param {string} sessionId - The unique session ID
   * @param {Object|MCPContext} mcpContext - The current MCP context
   * @param {Array} toolCalls - The tool calls
   * @returns {Promise<Object>} - Results of the tool calls and updated context
   */
  async handleToolCalls(sessionId, mcpContext, toolCalls) {
    try {
      // Ensure we have an MCPContext instance
      const context = mcpContext instanceof MCPContext 
        ? mcpContext 
        : new MCPContext(mcpContext);
      
      // Create tool instances
      const tools = createTools(context.toJSON(), sessionId);
      
      const results = [];

      // Process each tool call directly
      for (const toolCall of toolCalls) {
        // Wrap and validate the tool call
        const wrappedToolCall = wrapToolCall(toolCall);
        validateToolCall(wrappedToolCall);
        
        const { name, arguments: args } = wrappedToolCall;
        
        // Find the tool
        const tool = tools.find(t => t.name === name);
        if (!tool) {
          const errorResult = wrapToolResult({
            name,
            content: { error: `Tool ${name} not found` }
          }, wrappedToolCall.id);
          results.push(errorResult);
          continue;
        }
        
        try {
          // Call the tool directly
          const result = await tool._call(args);
          
          // Update context if the tool returned context updates
          if (result && result.contextUpdates) {
            context.update(result.contextUpdates);
            delete result.contextUpdates; // Remove from response
          }
          
          // Wrap and validate the tool result
          const wrappedResult = wrapToolResult({
            name,
            content: result
          }, wrappedToolCall.id);
          validateToolResult(wrappedResult);
          
          results.push(wrappedResult);
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          const errorResult = wrapToolResult({
            name,
            content: { error: error.message || 'Unknown error' }
          }, wrappedToolCall.id);
          results.push(errorResult);
        }
      }

      return {
        toolResults: results,
        updatedContext: context
      };
    } catch (error) {
      console.error('Error handling tool calls:', error);
      throw error;
    }
  }

  /**
   * Clear conversation history for a session
   * @param {string} sessionId - The session ID
   * @param {boolean} isAdmin - Whether this is an admin session (parameter kept for backward compatibility)
   * @returns {Promise<boolean>} - Success indicator
   */
  async clearHistory(sessionId, isAdmin = false) {
    try {
      // Get the context for this session
      const context = this.contexts.get(sessionId);
      
      if (!context) {
        console.warn(`No context found for session ${sessionId}`);
        return false;
      }
      
      // Clear just the history array but keep all memory and other properties
      context.history = [];
      
      // Update the last updated timestamp
      context.lastUpdated = new Date().toISOString();
      
      // Store the updated context
      this.contexts.set(sessionId, context);
      
      // Persist to DynamoDB if available
      const memoryService = require('./memoryService');
      try {
        // Extract the resourceName from the context memory if available
        const resourceName = context.memory?.identity?.user_id || 
                             context.memory?.user_info?.resourceName ||
                             memoryService.extractResourceName(context.memory);
        
        if (resourceName) {
          console.log(`Persisting cleared history for resource ${resourceName} to storage`);
          // Create a copy of the context to ensure it has the right structure for persistence
          const contextToSave = {
            ...context.toJSON(),
            // Ensure empty history array is included
            history: []
          };
          await memoryService.saveMemoryByResourceName(sessionId, resourceName, contextToSave);
          console.log(`✅ Successfully persisted cleared history to storage for ${resourceName}`);
        } else {
          console.log(`⚠️ No resourceName found in context, history cleared but not persisted to storage`);
        }
      } catch (error) {
        console.error(`Error persisting cleared history to storage: ${error.message}`);
        // We still return true since the history was cleared in memory
      }
      
      console.log(`✅ Successfully cleared history for session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error clearing history for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Validate conversation history to ensure proper message sequence
   * @param {Array} history - The conversation history
   * @returns {Array} - Validated conversation history
   */
  validateConversationHistory(history) {
    if (!history || !Array.isArray(history)) return [];
    
    // Store a reference to this for method calls
    const self = this;
    
    console.log('Starting history validation...');
    
    // If the history is potentially corrupted, take a more aggressive approach
    const hasToolMessages = history.some(msg => msg.role === 'tool');
    
    if (hasToolMessages) {
      console.log('History contains tool messages - performing strict validation');
      
      // Track assistant messages with tool calls
      const assistantToolCalls = new Map();
      const validatedHistory = [];
      
      // First pass: collect all assistant messages with tool calls
      history.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          msg.tool_calls.forEach(tc => {
            if (tc && tc.id) {
              assistantToolCalls.set(tc.id, index);
            }
          });
        }
      });
      
      // If we find no valid assistant tool calls but have tool messages,
      // the history is likely corrupted - take a more aggressive approach
      if (assistantToolCalls.size === 0 && hasToolMessages) {
        console.log('Corrupted history detected - no valid assistant tool calls found. Resetting to basic messages only.');
        
        // Return only system and user messages to preserve context without tools
        const cleanedHistory = history
          .filter(msg => ['system', 'user'].includes(msg.role))
          .map(msg => self.sanitizeMessage(msg));
          
        // Flag history as fixed for DynamoDB update
        this.historyWasFixed = true;
        
        return cleanedHistory;
      }
      
      // Second pass: include only valid messages
      for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        
        // System and user messages are always valid
        if (['system', 'user'].includes(msg.role)) {
          validatedHistory.push(self.sanitizeMessage(msg));
          continue;
        }
        
        // For assistant messages with tool calls, ensure they have valid tool_calls
        if (msg.role === 'assistant') {
          if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            const sanitizedMsg = self.sanitizeMessage(msg);
            // Only include if it has at least one valid tool call
            if (sanitizedMsg.tool_calls && sanitizedMsg.tool_calls.length > 0) {
              validatedHistory.push(sanitizedMsg);
            } else {
              // If tool_calls are invalid, add the message without tool_calls
              validatedHistory.push({
                role: 'assistant',
                content: sanitizedMsg.content || ''
              });
              // Flag that we fixed something
              this.historyWasFixed = true;
            }
          } else {
            // Assistant messages without tool calls
            validatedHistory.push(self.sanitizeMessage(msg));
          }
          continue;
        }
        
        // For tool messages, ensure they correspond to a valid tool call
        if (msg.role === 'tool' && msg.tool_call_id) {
          if (assistantToolCalls.has(msg.tool_call_id)) {
            // Ensure it comes after the corresponding assistant message
            const assistantIndex = assistantToolCalls.get(msg.tool_call_id);
            if (i > assistantIndex) {
              validatedHistory.push(self.sanitizeMessage(msg));
            } else {
              console.warn(`Skipping tool message that appears before its assistant message`);
              this.historyWasFixed = true;
            }
          } else {
            console.warn(`Skipping tool message with no corresponding assistant tool call: ${msg.tool_call_id}`);
            this.historyWasFixed = true;
          }
        }
      }
      
      // Check if we dropped any messages during validation
      if (validatedHistory.length < history.length) {
        this.historyWasFixed = true;
      }
      
      console.log(`Validation complete: ${validatedHistory.length} of ${history.length} messages kept`);
      return validatedHistory;
    } else {
      // If no tool messages exist, just sanitize each message
      console.log('No tool messages in history - performing basic validation');
      return history.map(msg => self.sanitizeMessage(msg));
    }
  }
  
  /**
   * Sanitize a message to ensure it has the correct format
   * @param {Object} msg - The message to sanitize
   * @returns {Object} - Sanitized message
   */
  sanitizeMessage(msg) {
    const sanitized = {
      role: msg.role,
      content: msg.content || ''
    };
    
    // Handle tool calls for assistant messages
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      sanitized.tool_calls = msg.tool_calls
        .filter(tc => tc && tc.id && tc.function && tc.function.name)
        .map(tc => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string' 
              ? tc.function.arguments 
              : JSON.stringify(tc.function.arguments || {})
          }
        }));
    }
    
    // Handle tool messages
    if (msg.role === 'tool') {
      sanitized.tool_call_id = msg.tool_call_id;
      sanitized.name = msg.name || 'unknown_tool';
    }
    
    return sanitized;
  }
}

module.exports = ChatService; 