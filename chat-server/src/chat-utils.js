const { ChatOpenAI } = require('@langchain/openai');
const { AgentExecutor, createToolCallingAgent } = require('langchain/agents');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const axios = require('axios');

// Import the tools
const { lookupUserTool, getServicesTool, getAvailableSlotsTool, bookAppointmentTool, createContactTool } = require('./tools');

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

// Create system prompts
function createAdminSystemPrompt(dateInfo) {
  return `You are a helpful assistant for Rare Beauty Professional salon employees. You help employees manage appointments, lookup customers, and add new contacts.

Today is ${dateInfo.formattedDate}. ${dateInfo.todayStatus}

Our salon specializes in eyelash extensions, facials, and waxing services. You can help with appointment bookings, checking availability, and providing information about our services.

When customers need to book an appointment:
1. Ask which service they're interested in
2. Use the getServices tool to show available services
3. Use the getAvailableSlots tool to check available time slots for the selected date
4. Use the bookAppointment tool to complete the booking

For looking up customer info, use the lookupUser tool with their mobile number.
For creating new customer records, use the createContact tool.

Be friendly, professional, and helpful. Your job is to make the receptionist's job easier.`;
}

function createCustomerSystemPrompt(dateInfo) {
  return `You are a helpful assistant for Rare Beauty Professional, a beauty salon in Singapore specializing in eyelash extensions, facials, and waxing services.

Today is ${dateInfo.formattedDate}. ${dateInfo.todayStatus}

You help customers by:
1. Providing information about our services (use getServices tool)
2. Checking appointment availability (use getAvailableSlots tool)
3. Booking appointments (use bookAppointment tool)
4. Finding existing customer records (use lookupUser tool with their mobile number)

When helping customers book appointments:
- Ask which service they're interested in
- Check availability for their preferred date
- Confirm all details before booking
- Be friendly, positive and helpful

Your goal is to make the booking process easy and pleasant for customers, providing all the information they need.`;
}

async function getOrCreateExecutor(sessionId, isAdmin = false) {
  // Use appropriate executor map based on role
  const executorMap = isAdmin ? adminExecutors : executors;
  
  // Return existing executor if it exists
  if (executorMap.has(sessionId)) {
    return executorMap.get(sessionId);
  }
  
  console.log(`🔧 Creating new ${isAdmin ? 'admin' : 'customer'} executor for session ${sessionId}`);
  
  // Set up tools - use imported instances
  const tools = [
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

module.exports = {
  executors,
  adminExecutors,
  toolResults,
  getOrCreateExecutor,
  escapeJsonForTemplate
}; 