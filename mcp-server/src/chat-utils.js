const { ChatOpenAI } = require('@langchain/openai');
const axios = require('axios');

// Import system prompts from the prompts directory
const { createAdminSystemPrompt, createCustomerSystemPrompt } = require('./prompts');

// Import the tool factories
const { createTools } = require('./tools');

// Store executors in memory keyed by session ID
const executors = new Map();
const adminExecutors = new Map(); // Separate store for admin executors
const toolResults = new Map();
const mcpContexts = new Map(); // Store MCP contexts by session ID

// Cache for public holidays
let publicHolidaysCache = null;
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
    const response = await axios.get('https://data.gov.sg/api/action/datastore_search?resource_id=d_3751791452397f1b1c80c451447e40b7');
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch public holidays: ${response.status}`);
    }
    
    const data = response.data;
    
    if (!data.success || !data.result || !data.result.records) {
      throw new Error('Invalid response format from data.gov.sg API');
    }
    
    // Transform the data to a simpler format
    const holidays = data.result.records.map((record) => ({
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
  const todayHoliday = publicHolidays.find((holiday) => holiday.date === todayYMD);
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

// Function to create a new MCP context
function createNewMCPContext(sessionId, isAdmin = false) {
  return {
    sessionId,
    memory: {
      tool_usage: {}
    },
    identity: {
      role: isAdmin ? "admin" : "customer",
      persona: isAdmin ? "admin" : "new_customer",
      user_id: null
    }
  };
}

// Function to get or create an executor for a session
async function getOrCreateExecutor(sessionId, isAdmin = false) {
  // Get the appropriate executor map
  const executorMap = isAdmin ? adminExecutors : executors;
  
  // Get or create context for this session
  if (!mcpContexts.has(sessionId)) {
    mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
  }
  
  const context = mcpContexts.get(sessionId);
  
  // Ensure sessionId is set in context
  context.sessionId = sessionId;
  
  // Set identity in context if needed
  if (!context.identity || !context.identity.role) {
    context.identity = {
      role: isAdmin ? "admin" : "customer",
      persona: isAdmin ? "admin" : "new_customer",
      user_id: null
    };
  }
  
  // Check if executor exists and is still valid
  if (executorMap.has(sessionId)) {
    const executor = executorMap.get(sessionId);
    return executor;
  }
  
  // Get the current date information
  const dateInfo = await getServerDate();
  console.log(`Getting date info for session ${sessionId}`, dateInfo);
  
  // Create the system prompt using the appropriate function
  const systemMessage = isAdmin 
    ? createAdminSystemPrompt(context, dateInfo)
    : createCustomerSystemPrompt(context, dateInfo);
  
  // Create context-aware tools
  const tools = createTools(context, sessionId);
  console.log(`Creating agent for session ${sessionId} with ${tools.length} tools`);
  
  // Create the LLM
  const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });
  
  // Create a simplified executor
  const executor = {
    async invoke({ input, chat_history = [] }) {
      console.log(`Executing agent for session ${sessionId} with input: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);
      
      try {
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
          tools: tools.map(tool => {
            // Ensure proper schema format for each tool
            let parameters = { type: 'object', properties: {}, required: [] };
            
            if (tool.name === 'lookupUser') {
              // Explicitly define the lookupUser schema
              parameters = {
                type: 'object',
                properties: {
                  phoneNumber: { type: 'string', description: 'Singapore mobile number to lookup' }
                },
                required: ['phoneNumber']
              };
            } 
            else if (tool.schema && tool.schema.shape) {
              // Handle Zod schema conversion
              parameters = { type: 'object', properties: {}, required: [] };
              
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
          }),
          tool_choice: "auto"
        }).invoke(messages);
        
        // Process the result
        if (!result.tool_calls || result.tool_calls.length === 0) {
          // No tool calls, just return the content
          return { output: result.content };
        }
        
        console.log(`LLM wants to call ${result.tool_calls.length} tools`);
        
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
          let args = {};
          try {
            if (toolCall.args) {
              if (typeof toolCall.args === 'string') {
                args = JSON.parse(toolCall.args);
              } else if (typeof toolCall.args === 'object') {
                args = toolCall.args;
              }
            }
            
            // Special handling for lookupUser tool
            if (toolName === 'lookupUser' && !args.phoneNumber) {
              // Try to extract phone number from raw args
              if (typeof toolCall.args === 'string') {
                const phoneMatch = toolCall.args.match(/(\d{8,})/);
                if (phoneMatch) {
                  args.phoneNumber = phoneMatch[1];
                  console.log(`Extracted phoneNumber ${args.phoneNumber} from string args`);
                }
              }
              
              // Check if phone number is in another property
              if (!args.phoneNumber) {
                for (const [key, value] of Object.entries(args)) {
                  if (typeof value === 'string' && /^\d{8,}$/.test(value.replace(/\D/g, ''))) {
                    args.phoneNumber = value;
                    console.log(`Using ${key}=${value} as phoneNumber`);
                    break;
                  }
                }
              }
            }
            
            console.log(`Calling tool ${toolName} with args:`, args);
          } catch (e) {
            console.warn(`Error parsing args for ${toolName}:`, e.message);
            args = {};
          }
          
          // Call the tool
          try {
            const toolResult = await tool._call(args);
            toolResponses.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });

            // Store appointments in context after lookupUser
            if (toolName === 'lookupUser' && !toolResult.includes('"error"')) {
              try {
                const lookupResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
                const resourceName = lookupResult.resourceName;
                const customerName = lookupResult.name;
                
                if (resourceName) {
                  console.log(`🔄 Fetching appointments for resourceName: ${resourceName}`);
                  
                  // Find the getCustomerAppointments tool
                  const appointmentsTool = tools.find(t => t.name === 'getCustomerAppointments');
                  
                  if (appointmentsTool) {
                    // Call the tool to get appointments, but don't add to toolResponses
                    const appointmentsResult = await appointmentsTool._call({ resourceName, limit: 5 });
                    
                    // Parse the appointments
                    const appointmentsData = typeof appointmentsResult === 'string' 
                      ? JSON.parse(appointmentsResult) 
                      : appointmentsResult;
                    
                    // Store the appointments in the context for future use
                    if (!context.memory) context.memory = {};
                    context.memory.customer_appointments = {
                      [resourceName]: {
                        retrievedAt: new Date().toISOString(),
                        appointments: appointmentsData.appointments || []
                      }
                    };
                    
                    // Modify the lookup tool result to include appointment info
                    const appointmentCount = appointmentsData.appointments?.length || 0;
                    const appointmentSummary = appointmentCount > 0 
                      ? `Found ${appointmentCount} previous appointments for ${customerName}.` 
                      : `No previous appointments found for ${customerName}.`;
                    
                    // Append appointment info to the existing lookup result
                    let enhancedResult = typeof toolResult === 'string' 
                      ? JSON.parse(toolResult) 
                      : {...toolResult};
                    
                    enhancedResult.appointmentInfo = appointmentSummary;
                    enhancedResult.hasAppointments = appointmentCount > 0;
                    
                    // Replace the original tool response
                    toolResponses[toolResponses.length - 1].content = JSON.stringify(enhancedResult);
                    
                    console.log(`✅ Enhanced lookupUser result with appointment info: ${appointmentSummary}`);
                  } else {
                    console.warn(`⚠️ getCustomerAppointments tool not found for auto-fetching`);
                  }
                }
              } catch (parseError) {
                console.error(`❌ Error enhancing lookupUser result:`, parseError);
              }
            }
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
        
        // Persist to DynamoDB using memoryService and global.mcpContexts for persistence
        if (global.mcpContexts && sessionId) {
          console.log(`🔍 DEBUG: Context structure before saving:`);
          console.log(`  - context.identity: ${JSON.stringify(context.identity, null, 2).substring(0, 100)}...`);
          console.log(`  - context.memory.user_info: ${context.memory?.user_info ? 'present' : 'null or undefined'}`);
          
          // Make sure we pull user_id from the right place
          let resourceName = null;
          
          // Check for resourceName in identity.user_id first
          if (context.identity?.user_id) {
            resourceName = context.identity.user_id;
            console.log(`📋 Using resourceName ${resourceName} from identity.user_id for memory persistence`);
          } 
          // If not found there, check memory.user_info
          else if (context.memory?.user_info?.resourceName) {
            resourceName = context.memory.user_info.resourceName;
            console.log(`📋 Using resourceName ${resourceName} from memory.user_info for memory persistence`);
            
            // Make sure identity.user_id is also set
            if (!context.identity) context.identity = {};
            context.identity.user_id = resourceName;
          } else {
            console.warn(`⚠️ No resourceName found in context identity, checking memory.user_info`);
          }
          
          // Add the session to the context for tracking
          context.sessionId = sessionId;
          
          // If we have a resourceName, use memory service to save properly
          if (resourceName) {
            try {
              const memoryService = require('./services/memoryService');
              
              // Ensure the session-to-resource mapping is updated
              memoryService.setSessionToResourceMapping(sessionId, resourceName);
              
              // Use the memory service to save the context
              const result = await memoryService.saveMemory(sessionId, context);
              
              if (result) {
                console.log(`💾 Persisted context memory for session ${sessionId}`);
              } else {
                console.warn(`⚠️ Failed to persist context memory for session ${sessionId}`);
                // Try a direct save with resourceName as fallback
                console.log(`🔄 Attempting direct save with resourceName: ${resourceName}`);
                try {
                  const directResult = await memoryService.saveMemoryByResourceName(sessionId, resourceName, context);
                  if (!directResult) {
                    console.warn(`❌ Direct save with resourceName also failed`);
                    // Last resort: just store in global memory without DynamoDB
                    global.mcpContexts.set(sessionId, context);
                  }
                } catch (directError) {
                  console.error(`❌ Error in direct save:`, directError);
                  // Last resort: just store in global memory without DynamoDB
                  global.mcpContexts.set(sessionId, context);
                }
              }
            } catch (error) {
              console.error(`❌ Error persisting context memory:`, error);
              
              // Fallback to just storing in global memory
              global.mcpContexts.set(sessionId, context);
            }
          } else {
            // Fallback to global.mcpContexts directly if no resourceName found
            global.mcpContexts.set(sessionId, context);
          }
        }
        
        // Get final response
        const finalResult = await llm.invoke(finalMessages);
        return { output: finalResult.content };
      } catch (error) {
        console.error(`Error in chat execution:`, error);
        return { 
          output: "I'm having trouble processing your request. Please try again." 
        };
      }
    },
    
    // Store context snapshot
    _lastContextSnapshot: JSON.parse(JSON.stringify(context))
  };
  
  // Store it in the map
  executorMap.set(sessionId, executor);
  
  return executor;
}

module.exports = {
  executors,
  adminExecutors,
  toolResults,
  mcpContexts,
  getOrCreateExecutor,
  createNewMCPContext
};