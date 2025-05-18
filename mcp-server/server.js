const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const path = require('path');
const { transcribeAudio } = require('./src/services/audioTranscription');
const memoryService = require('./src/services/memoryService');

// Load environment variables from .env file
console.log(`🔧 Loading environment from .env`);
dotenv.config();

// Output token for debugging
console.log(`🔑 Auth token loaded:`, process.env.SOHO_AUTH_TOKEN ? 'Yes' : 'No');

// Import LLM integration
const { executors, adminExecutors, toolResults } = require('./src/chat-utils');

// Store shared tool instances
const sharedTools = new Map();

const app = express();
const server = http.createServer(app);

// MCP structured context - following Model Context Protocol
// Each session has a structured context object
const mcpContexts = new Map();
// Make mcpContexts globally accessible for tools
global.mcpContexts = mcpContexts;

// In-memory storage for user contexts and chat histories
const userContexts = new Map();
const chatHistories = new Map();
const sessionSockets = new Map();

// Add this at the top of the file near other module imports
const globalCustomerCache = new Map(); // For storing customer info across sessions

// Configure CORS
app.use(cors({
  origin: function(origin, callback) {
    // Allow all origins during development
    console.log(`🔄 CORS request from origin: ${origin}`);
    callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Parse JSON requests
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins during development
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  transports: ['websocket', 'polling'], // Explicitly enable both transport methods
  allowEIO3: true, // Enable compatibility with Socket.IO v2 clients
  pingTimeout: 60000, // Increase ping timeout to handle slow connections
  pingInterval: 25000 // Adjust ping interval
});

// Helper function to initialize a new MCP context
async function createNewMCPContext(sessionId, isAdmin = false) {
  // Get any existing memory from persistent storage
  const existingMemory = await memoryService.getMemory(sessionId);
  
  const newContext = {
    identity: {
      session_id: sessionId,
      persona: isAdmin ? "admin" : "customer",
      is_admin: isAdmin
    },
    goals: [],
    instructions: isAdmin 
      ? "Help admin manage customer appointments, lookup customers, show services and add new contacts."
      : "Help customer book appointments and learn about services.",
    memory: existingMemory.memory || {
      user_info: null,
      last_selected_services: [],
      preferred_date: null,
      preferred_time: null,
      highlightedServices: [], // Services mentioned by the user in conversation
      assistantMentionedServices: [] // Services mentioned by the assistant
    },
    tools: isAdmin
      ? ["lookupUser", "createContact", "listServices", "getServiceInfo", "getAvailableSlots", "bookAppointment", "storeUser", "selectServices"] 
      : ["lookupUser", "listServices", "getServiceInfo", "getAvailableSlots", "bookAppointment", "storeUser", "selectServices"],
    history: [],
    detectedServiceIds: [] // Store service IDs detected in the conversation
  };
  
  // If we have identity info in the existing memory, preserve it
  if (existingMemory.identity) {
    newContext.identity = {
      ...newContext.identity,
      ...existingMemory.identity,
      is_admin: isAdmin // Always respect the current admin status
    };
  }
  
  return newContext;
}

// Helper function to get or create a shared tool instance
function getSharedTool(toolName, context, sessionId) {
  const key = `${sessionId}:${toolName}`;
  
  if (!sharedTools.has(key)) {
    console.log(`🔧 Creating new shared tool instance: ${toolName} for session ${sessionId}`);
    
    try {
      if (toolName === 'selectServices') {
        const { createSelectServicesTool } = require('./src/tools/selectServices');
        sharedTools.set(key, createSelectServicesTool(context, sessionId));
      } else if (toolName === 'listServices') {
        const { ListServicesTool } = require('./src/tools/listServices');
        sharedTools.set(key, new ListServicesTool(context, sessionId));
      }
      // Add other tool types as needed
    } catch (error) {
      console.error(`❌ Error creating shared tool ${toolName}:`, error);
      return null;
    }
  }
  
  // Initialize services cache if this is a service-related tool
  if ((toolName === 'listServices' || toolName === 'selectServices') && sharedTools.has(key)) {
    try {
      // Try to ensure the services cache is initialized
      const { initializeServicesCache } = require('./src/tools/listServices');
      initializeServicesCache().catch(err => console.error('Failed to initialize services cache:', err));
    } catch (error) {
      console.error('❌ Error initializing services cache:', error);
    }
  }
  
  return sharedTools.get(key);
}

// Helper: Extract service names from a confirmation message
function extractServiceNamesFromConfirmation(message) {
  // Simple regex to extract bullet points or lines like '• Service Name' or '- Service Name'
  const lines = message.split('\n');
  const serviceNames = [];
  for (const line of lines) {
    const match = line.match(/^\s*[•\-]\s*(.+)$/);
    if (match) {
      serviceNames.push(match[1].trim());
    }
  }
  return serviceNames;
}

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  
  let sessionId = socket.handshake.query.sessionId;
  
  // If no session ID provided, create a new one
  if (!sessionId) {
    sessionId = uuidv4();
    socket.emit('session', { sessionId });
    console.log(`📝 Generated new session ID: ${sessionId}`);
  }
  
  // Initialize MCP context if it doesn't exist (async function)
  (async () => {
    if (!mcpContexts.has(sessionId)) {
      const newContext = await createNewMCPContext(sessionId);
      mcpContexts.set(sessionId, newContext);
      console.log(`🧠 Created new MCP context for session ${sessionId}`);
    }
  })();
  
  // Store the socket by session ID
  sessionSockets.set(sessionId, socket);
  
  // Join a room with the session ID
  socket.join(sessionId);
  
  // Handle welcome message request
  socket.on('welcome', async (data) => {
    console.log(`🌟 Welcome message requested for session ${sessionId}`);
    const isAdmin = data.isAdmin === true;
    
    // Update MCP context if admin status changed (async)
    if (mcpContexts.has(sessionId)) {
      const context = mcpContexts.get(sessionId);
      if (context.identity.is_admin !== isAdmin) {
        const newContext = await createNewMCPContext(sessionId, isAdmin);
        mcpContexts.set(sessionId, newContext);
        console.log(`🧠 Reset MCP context for session ${sessionId} with admin=${isAdmin}`);
      }
    } else {
      const newContext = await createNewMCPContext(sessionId, isAdmin);
      mcpContexts.set(sessionId, newContext);
    }
    
    // Update goals for this session
    const context = mcpContexts.get(sessionId);
    context.goals = ["initiate_conversation"];
    mcpContexts.set(sessionId, context);
    
    const welcomeMessage = isAdmin 
      ? "Welcome, Admin. Can I have the customer's mobile number so I can better help you?"
      : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
    
    socket.emit('message', {
      role: 'assistant',
      content: welcomeMessage,
      id: uuidv4()
    });
  });
  
  // Handle load customer request
  socket.on('loadCustomer', async (data) => {
    console.log(`🔍 Loading customer for session ${sessionId}: ${data.resourceName}`);
    const isAdmin = data.isAdmin === true;
    
    // Check if we already have a session for this resourceName
    const existingSessionId = memoryService.getSessionIdByResourceName(data.resourceName);
    
    if (existingSessionId && existingSessionId !== sessionId) {
      console.log(`🔄 Found existing session ${existingSessionId} for resourceName ${data.resourceName}, transferring memory`);
      
      // Get the memory from the existing session
      const existingMemory = await memoryService.getMemory(existingSessionId);
      
      // Create a copy of the memory with the new session ID
      if (existingMemory && Object.keys(existingMemory).length > 0) {
        // Store the memory in the new session
        await memoryService.saveMemory(sessionId, existingMemory);
        console.log(`💾 Transferred memory from session ${existingSessionId} to ${sessionId}`);
      }
    }
    
    // Ensure MCP context exists with correct admin status
    if (!mcpContexts.has(sessionId) || mcpContexts.get(sessionId).identity.is_admin !== isAdmin) {
      const newContext = await createNewMCPContext(sessionId, isAdmin);
      mcpContexts.set(sessionId, newContext);
    }
    
    try {
      // Call contacts API to get customer data
      const apiEndpoint = `${process.env.API_URL}/api/contacts?resourceName=${encodeURIComponent(data.resourceName)}`;
      
      const contactsResponse = await axios.get(apiEndpoint);
      const contactData = contactsResponse.data;
      
      if (!contactData.success || !contactData.contact) {
        throw new Error('Customer not found');
      }
      
      const customer = contactData.contact;
      
      // Update MCP context with customer information
      const context = mcpContexts.get(sessionId);
      context.memory.user_info = {
        resourceName: customer.resourceName,
        name: customer.name,
        mobile: customer.mobile,
        updatedAt: new Date().toISOString()
      };
      context.identity.user_id = customer.resourceName;
      context.identity.persona = "returning_customer";
      context.goals = ["provide_service_information", "book_appointment"];
      context.instructions = `Assist ${customer.name} with booking appointments. Personalize the conversation and reference their history if available.`;
      
      mcpContexts.set(sessionId, context);
      console.log('✅ Updated MCP context with customer data for session', sessionId);
      
      // Remove existing executor to force recreation with updated customer context
      if (executors.has(sessionId)) {
        executors.delete(sessionId);
        console.log('🔄 Removed existing executor to recreate with updated customer context');
      }
      if (adminExecutors.has(sessionId)) {
        adminExecutors.delete(sessionId);
        console.log('🔄 Removed existing admin executor to recreate with updated customer context');
      }
      
      // Return personalized welcome message
      const welcomeMessage = isAdmin 
        ? `Welcome, Admin. I've loaded the customer profile for ${customer.name} (${customer.mobile}). How can I assist you with this customer today?`
        : `Hello ${customer.name}! Welcome back to Rare Beauty. How can I assist you today?`;
      
      socket.emit('message', {
        role: 'assistant',
        content: welcomeMessage,
        id: uuidv4()
      });
    } catch (error) {
      console.error('❌ Error loading customer:', error);
      
      socket.emit('message', {
        role: 'assistant',
        content: 'Sorry, I couldn\'t load the customer profile. Please try again.',
        id: uuidv4()
      });
    }
  });
  
  // Handle chat messages
  socket.on('chat', async (data) => {
    try {
      const { message, isAdmin = false } = data;
      const messageId = uuidv4();
      const messageContent = message.trim();
      
      console.log(`💬 Chat message from session ${sessionId}: ${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}`);
      
      // Show typing indicator to client
      socket.emit('typing', true);
      
      // Initialize context if needed
      if (!mcpContexts.has(sessionId)) {
        const newContext = await createNewMCPContext(sessionId, isAdmin);
        mcpContexts.set(sessionId, newContext);
        console.log(`🧠 Created new MCP context for session ${sessionId}`);
      }
      
      const context = mcpContexts.get(sessionId);
      
      // Update context with user message
      const userMessage = {
        role: 'user',
        content: messageContent,
        id: messageId
      };
      
      // Add to context history
      if (!context.history) {
        context.history = [];
      }
      
      context.history.push(userMessage);
      
      // Don't emit receipt of message back to client - the client already shows the message
      // This prevents duplication of user inputs
      // socket.emit('message', userMessage);
      
      // STEP 1: Check for important keywords to set goals
      if (messageContent.toLowerCase().includes('appointment') || messageContent.toLowerCase().includes('book')) {
        if (!context.goals.includes('book_appointment')) {
          context.goals.push('book_appointment');
        }
      }
      
      if (messageContent.toLowerCase().includes('service') || messageContent.toLowerCase().includes('price')) {
        if (!context.goals.includes('provide_service_information')) {
          context.goals.push('provide_service_information');
        }
      }
      
      try {
        // Get or create executor for this session
        const { getOrCreateExecutor } = require('./src/chat-utils');
        const executor = await getOrCreateExecutor(sessionId, isAdmin);

        // Get user context from MCP memory
        const userInfo = context.memory.user_info;
        
        // Prepare input with user context if available
        let inputToUse = messageContent;
        if (userInfo?.resourceName) {
          inputToUse = `[REMINDER: This customer's ResourceName is "${userInfo.resourceName}"]
          
${messageContent}`;
          console.log('📝 Enhanced input with user context for session', sessionId);
        }
        
        // Convert history to the format expected by the executor
        const formattedHistory = context.history.map(msg => {
          return {
            role: msg.role,
            content: msg.content
          };
        }).slice(-10); // Only include the last 10 messages
        
        // Invoke the LLM directly using Langchain executor
        console.log(`🤖 Invoking LLM for session ${sessionId}`);
        const result = await executor.invoke({
          input: inputToUse,
          chat_history: formattedHistory
        });
        
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
        
        // Create the assistant message
        const assistantMessage = {
          role: 'assistant',
          content: responseContent,
          id: uuidv4()
        };
        
        // Store in context
        context.history.push(assistantMessage);
        mcpContexts.set(sessionId, context);
        
        // After assistant message is generated and before emitting:
        // If the assistant message is a confirmation of selected services, auto-call selectServices
        if (assistantMessage.role === 'assistant' && /added|selected|following services|recap|appointment details/i.test(assistantMessage.content)) {
          const serviceNames = extractServiceNamesFromConfirmation(assistantMessage.content);
          if (serviceNames.length > 0) {
            const selectTool = getSharedTool('selectServices', context, sessionId);
            if (selectTool) {
              await selectTool._call({ serviceNames });
              console.log(`✅ Backend safeguard: called selectServices with confirmed service names:`, serviceNames);
            }
          }
        }
        
        // Emit back to client
        socket.emit('message', assistantMessage);
        
        // Stop typing indicator
        socket.emit('typing', false);
        
        // Persist context memory to DynamoDB if enabled
        try {
          // Get the latest context from global store to ensure we have the latest updates
          const latestContext = mcpContexts.get(sessionId) || context;
          
          // Detailed debug logging
          console.log('🔍 DEBUG: Context structure before saving:');
          console.log(`  - context.identity: ${JSON.stringify(latestContext.identity, null, 2).substring(0, 200)}...`);
          if (latestContext.memory?.user_info) {
            console.log(`  - context.memory.user_info: ${JSON.stringify(latestContext.memory.user_info, null, 2).substring(0, 200)}...`);
          } else {
            console.log(`  - context.memory.user_info: null or undefined`);
          }
          
          // Prepare memory object with all necessary data
          const memoryToSave = { 
            memory: latestContext.memory,
            identity: latestContext.identity,
            history: latestContext.history?.slice(-20) || [] // Only store the last 20 messages
          };
          
          // Log resourceName information for debugging
          const resourceName = latestContext.identity?.user_id;
          if (resourceName) {
            console.log(`📋 Using resourceName ${resourceName} for memory persistence`);
            // Ensure resourceName is explicitly set in the identity for memoryService to find
            if (!memoryToSave.identity) {
              memoryToSave.identity = {};
            }
            memoryToSave.identity.user_id = resourceName;
          } else {
            console.log(`⚠️ No resourceName found in context identity, checking memory.user_info`);
            if (latestContext.memory?.user_info?.resourceName) {
              const resourceFromMemory = latestContext.memory.user_info.resourceName;
              console.log(`📋 Found resourceName ${resourceFromMemory} in memory.user_info`);
              if (!memoryToSave.identity) {
                memoryToSave.identity = {};
              }
              memoryToSave.identity.user_id = resourceFromMemory;
            }
          }
          
          // If we have user info but no resourceName, we can't save
          if (!memoryToSave.identity?.user_id && context.memory?.user_info) {
            console.warn(`⚠️ Have user_info but no resourceName, possible data structure issue`);
            console.log('📊 Memory structure:', JSON.stringify(context.memory.user_info, null, 2));
          }
          
          // Look at the prepared memory object before saving
          console.log('🔍 DEBUG: Memory object to save:');
          console.log(`  - memoryToSave.identity: ${JSON.stringify(memoryToSave.identity, null, 2).substring(0, 200)}...`);
          if (memoryToSave.memory?.user_info) {
            console.log(`  - memoryToSave.memory.user_info: ${JSON.stringify(memoryToSave.memory.user_info, null, 2)}...`);
          }
          
          // Add resourceName at the top level too for maximum compatibility
          memoryToSave.resourceName = memoryToSave.identity?.user_id || 
                                      context.memory?.user_info?.resourceName;
          
          // Try to save with sessionId as fallback
          const success = await memoryService.saveMemory(sessionId, memoryToSave);
          
          if (success) {
            console.log(`💾 Persisted context memory for session ${sessionId}`);
          } else {
            console.warn(`⚠️ Failed to persist context memory for session ${sessionId}`);
            // If save failed, try direct approach with resourceName
            const directResourceName = context.identity?.user_id || context.memory?.user_info?.resourceName;
            
            if (directResourceName) {
              console.log(`🔄 Attempting direct save with resourceName: ${directResourceName}`);
              const directSave = await memoryService.saveMemoryByResourceName(
                sessionId,
                directResourceName,
                memoryToSave
              );
              if (directSave) {
                console.log(`✅ Direct save with resourceName successful`);
              } else {
                console.error(`❌ Direct save with resourceName also failed`);
              }
            }
          }
        } catch (persistError) {
          console.error(`❌ Error persisting context memory for session ${sessionId}:`, persistError);
        }
        
        console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 50)}${responseContent.length > 50 ? '...' : ''}"`);
        
      } catch (llmError) {
        console.error(`❌ Error processing message with LLM:`, llmError);
        
        // Stop typing indicator
        socket.emit('typing', false);
        
        // Send error message back to client
        socket.emit('message', {
          role: 'assistant',
          content: "I'm sorry, I encountered an error processing your message. Please try again.",
          id: uuidv4(),
          error: true
        });
      }
      
    } catch (chatError) {
      console.error('❌ Error handling chat message:', chatError);
      
      // Stop typing indicator
      socket.emit('typing', false);
      
      // Send error message back to client
      socket.emit('message', {
        role: 'assistant',
        content: "I'm sorry, there was an error processing your message. Please try again.",
        id: uuidv4(),
        error: true
      });
    }
  });
  
  // Handle tool usage request
  socket.on('useTool', async (data) => {
    try {
      const { tool, params } = data;
      
      console.log(`🔧 Tool request for session ${sessionId}: ${tool}`);
      
      // Get the MCP context for this session
      if (!mcpContexts.has(sessionId)) {
        const newContext = await createNewMCPContext(sessionId);
        mcpContexts.set(sessionId, newContext);
      }
      const context = mcpContexts.get(sessionId);
      
      // Log the tool request for this session
      if (!context.memory.tool_usage) {
        context.memory.tool_usage = {};
      }
      
      // Initialize tool usage array if it doesn't exist
      if (!context.memory.tool_usage[tool]) {
        context.memory.tool_usage[tool] = [];
      }
      
      // Record this usage with timestamp and parameters
      context.memory.tool_usage[tool].push({
        timestamp: new Date().toISOString(),
        params
      });
      
      // Call tools API
      const toolsApiUrl = `${process.env.API_URL}/api/tools`;
      const toolResponse = await axios.post(toolsApiUrl, {
        tool,
        params,
        sessionId
      });
      
      const resultData = toolResponse.data.result;
      
      // For lookupUser tool, update the user context if a customer is found
      if (tool === 'lookupUser' && resultData && resultData.resourceName) {
        // Update identity
        context.identity.user_id = resultData.resourceName;
        context.identity.persona = "returning_customer";
        
        // Update user info in memory if not already there
        if (!context.memory.user_info) {
          context.memory.user_info = {
            resourceName: resultData.resourceName,
            name: resultData.name,
            mobile: resultData.mobile,
            updatedAt: new Date().toISOString()
          };
        }
        
        // Store the result in the last tool usage entry
        const lastToolUsage = context.memory.tool_usage[tool][context.memory.tool_usage[tool].length - 1];
        if (lastToolUsage && !lastToolUsage.result) {
          lastToolUsage.result = {
            resourceName: resultData.resourceName,
            name: resultData.name,
            mobile: resultData.mobile
          };
        }
      }
      
      // Update MCP context
      mcpContexts.set(sessionId, context);
      
      // Persist context memory to DynamoDB if enabled
      try {
        await memoryService.saveMemory(sessionId, { 
          memory: context.memory,
          identity: context.identity
        });
        console.log(`💾 Persisted context memory for session ${sessionId} after tool usage`);
      } catch (persistError) {
        console.error(`❌ Error persisting context memory for session ${sessionId}:`, persistError);
      }
      
      // Send back the result to the client
      socket.emit('toolResult', {
        success: true,
        tool,
        result: resultData
      });
      
      // Force recreation of executor on next use to pick up context changes
      if (executors.has(sessionId)) {
        // We don't delete the executor, but on next getOrCreateExecutor call,
        // it will check if context has changed significantly and rebuild if needed
        console.log(`🔄 Removed existing executor to recreate with updated customer context`);
      }
    } catch (error) {
      console.error('❌ Error handling tool usage:', error);
      
      // Stop typing indicator
      socket.emit('typing', false);
      
      // Send error message back to client
      socket.emit('message', {
        role: 'assistant',
        content: "I'm sorry, there was an error processing your tool usage. Please try again later.",
        id: uuidv4(),
        error: true
      });
    }
  });
});

// AI Tools endpoint for external tools access
app.post('/api/tools', async (req, res) => {
  try {
    const { tool, params, sessionId } = req.body;
    
    if (!tool) {
      return res.status(400).json({ success: false, message: 'No tool specified' });
    }
    
    console.log(`🔧 Tool request: ${tool} for session ${sessionId}`);
    // ... rest of existing code ...
  } catch (error) {
    console.error('❌ Error in tools API:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error calling tool',
      error: error.message
    });
  }
});

// Add an endpoint to get session by resourceName
app.get('/api/session/byResource/:resourceName', async (req, res) => {
  try {
    const { resourceName } = req.params;
    // Get the session ID from the resource name
    const sessionId = memoryService.getSessionIdByResourceName(resourceName);
    
    if (!sessionId) {
      return res.status(404).json({ 
        success: false, 
        error: `No session found for resourceName: ${resourceName}` 
      });
    }
    
    // Get the memory for this session
    const memory = await memoryService.getMemory(sessionId);
    
    res.json({ 
      success: true, 
      resourceName,
      sessionId,
      memory
    });
  } catch (error) {
    console.error(`Error getting session by resourceName ${req.params.resourceName}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve session by resourceName' 
    });
  }
});

// Add an endpoint to list all resource mappings
app.get('/api/resources/mappings', async (req, res) => {
  try {
    const mappings = memoryService.listResourceNameMappings();
    res.json({ success: true, mappings });
  } catch (error) {
    console.error('Error listing resource mappings:', error);
    res.status(500).json({ success: false, error: 'Failed to list resource mappings' });
  }
});

// Add an endpoint to store memory by resourceName
app.post('/api/memory/resource/:resourceName', async (req, res) => {
  try {
    const { resourceName } = req.params;
    const { memory } = req.body;
    
    if (!resourceName) {
      return res.status(400).json({ 
        success: false, 
        error: 'ResourceName is required'
      });
    }
    
    if (!memory) {
      return res.status(400).json({ 
        success: false, 
        error: 'Memory object is required'
      });
    }
    
    // Determine the current session ID if available
    const sessionId = req.body.sessionId || 'api-direct';
    
    // Add sessionId to the memory
    const memoryWithSession = {
      ...memory,
      lastSessionId: sessionId
    };
    
    console.log(`📋 API: Storing memory for resourceName: ${resourceName}`);
    
    // Prepare memory object with explicit resourceName
    const memoryToSave = {
      identity: { 
        user_id: resourceName 
      },
      memory: memoryWithSession,
      // Add resourceName as a top-level property as well for redundant lookup
      resourceName
    };
    
    // Store memory directly by resourceName
    const success = await memoryService.saveMemoryByResourceName(
      sessionId, 
      resourceName, 
      memoryToSave
    );
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Memory stored for resource: ${resourceName}`
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to store memory'
      });
    }
  } catch (error) {
    console.error(`Error storing memory for resource ${req.params.resourceName}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error'
    });
  }
});

// Add an endpoint to get memory by resourceName
app.get('/api/memory/resource/:resourceName', async (req, res) => {
  try {
    const { resourceName } = req.params;
    
    if (!resourceName) {
      return res.status(400).json({ 
        success: false, 
        error: 'ResourceName is required'
      });
    }
    
    // Get memory directly by resourceName
    const memory = await memoryService.getMemoryByResourceName(resourceName);
    
    res.json({
      success: true,
      resourceName,
      memory
    });
  } catch (error) {
    console.error(`Error getting memory for resource ${req.params.resourceName}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve memory'
    });
  }
});

// Add an endpoint to delete memory by resourceName
app.delete('/api/memory/resource/:resourceName', async (req, res) => {
  try {
    const { resourceName } = req.params;
    
    if (!resourceName) {
      return res.status(400).json({ 
        success: false, 
        error: 'ResourceName is required'
      });
    }
    
    // Delete memory directly by resourceName
    const success = await memoryService.deleteMemory(resourceName, true);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Memory deleted for resource: ${resourceName}`
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete memory'
      });
    }
  } catch (error) {
    console.error(`Error deleting memory for resource ${req.params.resourceName}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error'
    });
  }
});

server.listen(process.env.PORT || 3004, () => {
  console.log(`🚀 Server is running on port ${process.env.PORT || 3004}`);
});