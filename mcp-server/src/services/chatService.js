const { createAdminSystemPrompt, createCustomerSystemPrompt } = require('../prompts');
const { ChatOpenAI } = require('@langchain/openai');
const MCPContext = require('../models/MCPContext');
const { createTools } = require('../tools');

/**
 * Service to handle chat interactions with the LLM
 */
class ChatService {
  constructor() {
    // Store executors in memory keyed by session ID
    this.executors = new Map();
    this.adminExecutors = new Map();
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
   * Get or create an executor for a session
   * @param {string} sessionId - Session ID
   * @param {MCPContext} context - The context for this session
   * @param {boolean} isAdmin - Whether this is an admin session
   * @param {string} intent - Optional intent detected from message
   * @returns {Object} Executor for handling LLM requests
   */
  async getExecutor(sessionId, context, isAdmin = false, intent = null) {
    // Get the appropriate executor map
    const executorMap = isAdmin ? this.adminExecutors : this.executors;
    
    // Log the intent information
    console.log(`🔄 Getting executor for session ${sessionId} with intent=${intent || 'none'}, hasAppointmentId=${!!context.memory?.current_appointment_id}`);
    
    // Check if executor exists, but recreate it if intent changes to "update"
    const existingIntent = context.memory?.intent_last_used_for_executor || null;
    if (executorMap.has(sessionId) && (intent !== 'update' || existingIntent === 'update')) {
      console.log(`🔄 Reusing existing executor with intent=${existingIntent || 'none'}`);
      return executorMap.get(sessionId);
    }
    
    // Store the intent used to create this executor
    if (context.memory) {
      context.memory.intent_last_used_for_executor = intent;
    }
    
    // Get date info for prompt generation
    const dateInfo = this.getDateInfo();
    
    // Create the system prompt using the appropriate function
    const systemPromptFunction = isAdmin ? require('../prompts/systemPrompt-admin').createSystemPrompt : require('../prompts/systemPrompt-customer').createSystemPrompt;
    
    // Use the intent if specified
    const systemMessage = systemPromptFunction(context.toJSON(), dateInfo, intent);
    
    // Log which prompt is being used
    if (intent === 'update' || context.memory?.intent === 'update' || context.memory?.current_appointment_id) {
      console.log(`\n======================================`);
      console.log(`🔄 UPDATE APPOINTMENT PROMPT IS ACTIVE`);
      console.log(`======================================\n`);
    }
    
    // Create context-aware tools
    const tools = createTools(context.toJSON(), sessionId);
    console.log(`Creating agent for session ${sessionId} with ${tools.length} tools`);
    
    // Create the LLM
    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    });
    
    // Store reference to this ChatService instance
    const chatService = this;
    
    // Create a simplified executor
    const executor = {
      async invoke({ input, chat_history = [] }) {
        try {
          console.log(`Executing agent for session ${sessionId} with input: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);
          
          // Prepare messages
          const messages = [
            {
              role: "system",
              content: systemMessage + "\n\nContext Memory: " + JSON.stringify(context.memory || {}, null, 2)
            }
          ];
          
          // Add chat history if available
          if (chat_history && chat_history.length > 0) {
            const history = chat_history.slice(-6); // Limit to last 6 messages
            history.forEach(msg => {
              messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
              });
            });
          }
          
          // Add the current user input
          messages.push({
            role: "user",
            content: input
          });
          
          // Call the LLM with tools configuration
          const result = await llm.bind({
            tools: tools.map(tool => chatService.convertToolToFunction(tool)),
            tool_choice: "auto"
          }).invoke(messages);
          
          // Process the result
          if (!result.tool_calls || result.tool_calls.length === 0) {
            // No tool calls, just return the content
            return { output: result.content };
          }
          
          console.log(`LLM wants to call ${result.tool_calls.length} tools: ${result.tool_calls.map(call => call.name).join(', ')}`);
          
          // Execute tool calls
          const toolResponses = [];
          for (const toolCall of result.tool_calls) {
            const toolName = toolCall.name;
            const tool = tools.find(t => t.name === toolName);
            
            if (!tool) {
              console.warn(`Tool ${toolName} not found`);
              toolResponses.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolName,
                content: JSON.stringify({ error: `Tool ${toolName} not found` })
              });
              continue;
            }
            
            // Parse tool arguments
            const args = chatService.parseToolArguments(toolCall.args);
            console.log(`Calling tool ${toolName} with args:`, args);
            
            // Call the tool
            try {
              const toolResult = await tool._call(args);
              
              // Update context if the tool returned context updates
              if (toolResult && toolResult.contextUpdates) {
                context.update(toolResult.contextUpdates);
                delete toolResult.contextUpdates; // Remove from response
              }
              
              toolResponses.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolName,
                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
              });
            } catch (error) {
              console.error(`Error executing tool ${toolName}:`, error);
              toolResponses.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolName,
                content: JSON.stringify({ error: error.message || 'Unknown error' })
              });
            }
          }
          
          // Add tool responses to messages
          const finalMessages = [...messages, result, ...toolResponses];
          
          // Get final response
          const finalResult = await llm.invoke(finalMessages);
          return { output: finalResult.content };
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
   * Processes a chat message and generates a response
   * @param {string} sessionId - The unique session ID
   * @param {Object|MCPContext} mcpContext - The current MCP context for this session
   * @param {Object} message - The incoming message object
   * @param {boolean} isAdmin - Whether the chat is in admin mode
   * @param {string} intent - Optional intent detected from message
   * @returns {Promise<Object>} - The LLM response and updated context
   */
  async processMessage(sessionId, mcpContext, message, isAdmin = false, intent = null) {
    try {
      // Ensure we have an MCPContext instance
      const context = mcpContext instanceof MCPContext 
        ? mcpContext 
        : new MCPContext(mcpContext);
      
      // Set admin mode if specified
      if (isAdmin) {
        context.memory.admin_mode = true;
      }
      
      // Store intent in context if provided
      if (intent) {
        console.log(`🔄 Setting intent in context: ${intent}`);
        context.memory.intent = intent;
        
        // If intent is update, ensure it's reflected in executor selection
        if (intent === 'update' && context.memory.appointments && context.memory.appointments.length > 0) {
          const latestAppointment = context.memory.appointments[0];
          if (latestAppointment && latestAppointment.id) {
            context.memory.current_appointment_id = latestAppointment.id;
            console.log(`🔄 Set current_appointment_id=${latestAppointment.id} from intent detection`);
          }
        }
      } else if (context.memory.intent) {
        // Log if we're using an existing intent from memory
        console.log(`🔄 Using existing intent from memory: ${context.memory.intent}`);
        intent = context.memory.intent;
      }
      
      // Get the executor
      const executor = await this.getExecutor(sessionId, context, isAdmin, intent);
      
      // Get chat history from context
      const chatHistory = context.history || [];
      
      // Use executor to get response
      const result = await executor.invoke({
        input: message.content,
        chat_history: chatHistory
      });
      
      // Add mode indicator to the response
      let finalOutput = result.output;
      
      // Add a clear mode indicator if we're using update mode
      if (intent === 'update' || context.memory?.intent === 'update') {
        // Check if we should inject a mode indicator
        const lowerOutput = finalOutput.toLowerCase();
        
        // Only add indicator if it's not already present to avoid duplication
        if (!lowerOutput.includes("update mode") && !lowerOutput.includes("appointment update")) {
          console.log(`🔄 Adding update mode indicator to response`);
          
          // Get appointment ID if available
          const appointmentId = context.memory?.current_appointment_id || 'unknown';
          
          // Add mode indicator at the beginning
          finalOutput = `[UPDATE MODE - Appointment ID: ${appointmentId}]\n\n${finalOutput}`;
        }
      }
      
      // Add messages to history
      context.addMessage({ role: 'user', content: message.content });
      context.addMessage({ role: 'assistant', content: finalOutput });
      
      return {
        response: {
          role: 'assistant',
          content: finalOutput
        },
        updatedContext: context
      };
    } catch (error) {
      console.error('Error processing chat message:', error);
      throw error;
    }
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
      const isAdmin = context.memory?.admin_mode === true;
      const tools = createTools(context.toJSON(), sessionId);
      
      const results = [];

      // Process each tool call directly
      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall;
        
        // Find the tool
        const tool = tools.find(t => t.name === name);
        if (!tool) {
          results.push({ 
            toolName: name, 
            result: { error: `Tool ${name} not found` } 
          });
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
          
          results.push({ toolName: name, result });
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          results.push({ 
            toolName: name, 
            result: { error: error.message || 'Unknown error' } 
          });
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
}

module.exports = ChatService; 