const { ChatOpenAI } = require('@langchain/openai');
const { AgentExecutor, createToolCallingAgent } = require('langchain/agents');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const axios = require('axios');

// Import system prompts from the prompts directory
const { createAdminSystemPrompt, createCustomerSystemPrompt } = require('./prompts');

// Import the tool factories
const { createTools } = require('./tools');

// Store executors in memory keyed by session ID
const executors = new Map();
const adminExecutors = new Map(); // Separate store for admin executors
const toolResults = new Map();

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

// Add a utility function to escape JSON strings in tool outputs
function escapeJsonForTemplate(jsonStr) {
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

// Function to create a chat prompt with memory
function createChatPrompt(systemMessage, context) {
  return ChatPromptTemplate.fromMessages(
    [
      ["system", systemMessage],
      new MessagesPlaceholder("chat_history"),
      ["user", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ],
    {
      // Define partial variables to inject memory values
      partialVariables: {
        // Include memory information as serialized JSON for LLM to reference
        memory: context.memory ? JSON.stringify(context.memory) : "{}"
      }
    }
  );
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
  
  // Set identity in context if needed
  if (!context.identity || !context.identity.role) {
    context.identity = {
      role: isAdmin ? "admin" : "customer",
      persona: isAdmin ? "admin" : "new_customer",
      user_id: null
    };
  }
  
  // Track if executor needs to be rebuilt due to context changes
  let needsRebuild = false;
  
  // If the executor exists, check if significant context has changed
  if (executorMap.has(sessionId)) {
    const executor = executorMap.get(sessionId);
    
    // Check for significant context changes that would require rebuilding
    if (executor._lastContextSnapshot) {
      const lastMemory = executor._lastContextSnapshot.memory || {};
      const currentMemory = context.memory || {};
      
      // Check for changes in key memory fields
      if (
        JSON.stringify(lastMemory.user_info) !== JSON.stringify(currentMemory.user_info) ||
        lastMemory.last_selected_service !== currentMemory.last_selected_service ||
        lastMemory.preferred_date !== currentMemory.preferred_date ||
        lastMemory.preferred_time !== currentMemory.preferred_time
      ) {
        console.log(`🔄 Context changed significantly for session ${sessionId}, rebuilding executor`);
        needsRebuild = true;
      }
    } else {
      // No snapshot exists, so create one
      executor._lastContextSnapshot = JSON.parse(JSON.stringify(context));
    }
    
    // If no rebuild needed, return the existing executor
    if (!needsRebuild) {
      return executor;
    }
    
    // Otherwise continue to rebuild below
  }
  
  // Get the current date information
  const dateInfo = await getServerDate();
  console.log(`Getting date info for session ${sessionId}`, dateInfo);
  
  // Create the system prompt using the appropriate function
  const systemMessage = isAdmin 
    ? createAdminSystemPrompt(context, dateInfo)
    : createCustomerSystemPrompt(context, dateInfo);
  
  // Use the function to create the prompt
  const prompt = createChatPrompt(systemMessage, context);
  
  // Create context-aware tools
  const tools = createTools(context, sessionId);
  
  // Create the agent
  const agent = await createToolCallingAgent({
    llm: new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    }),
    tools,
    prompt,
  });
  
  // Create the executor
  const executor = new AgentExecutor({
    agent,
    tools,
    returnIntermediateSteps: false,
    maxIterations: 10,
    handleParsingErrors: true,
  });
  
  // Store context snapshot to track changes
  executor._lastContextSnapshot = JSON.parse(JSON.stringify(context));
  
  // Store it in the map
  executorMap.set(sessionId, executor);
  
  return executor;
}

module.exports = {
  executors,
  adminExecutors,
  toolResults,
  getOrCreateExecutor,
  escapeJsonForTemplate
};