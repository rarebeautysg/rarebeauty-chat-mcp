const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const path = require('path');

// Load environment variables from .env file
console.log(`🔧 Loading environment from .env`);
dotenv.config();

// Output token for debugging
console.log(`🔑 Auth token loaded:`, process.env.SOHO_AUTH_TOKEN ? 'Yes' : 'No');

// Import LLM integration
const { executors, adminExecutors, toolResults, getOrCreateExecutor } = require('./src/chat-utils');

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
function createNewMCPContext(sessionId, isAdmin = false) {
  return {
    identity: {
      session_id: sessionId,
      persona: isAdmin ? "admin" : "customer",
      is_admin: isAdmin
    },
    goals: [],
    instructions: isAdmin 
      ? "Help admin manage customer appointments, lookup customers, and add new contacts."
      : "Help customer book appointments and learn about services.",
    memory: {
      user_info: null,
      last_selected_service: null,
      preferred_date: null,
      preferred_time: null
    },
    tools: isAdmin
      ? ["lookupUser", "createContact", "getServices", "getAvailableSlots", "bookAppointment", "storeUser"] 
      : ["lookupUser", "getServices", "getAvailableSlots", "bookAppointment", "storeUser"],
    history: []
  };
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
  
  // Initialize MCP context if it doesn't exist
  if (!mcpContexts.has(sessionId)) {
    mcpContexts.set(sessionId, createNewMCPContext(sessionId));
    console.log(`🧠 Created new MCP context for session ${sessionId}`);
  }
  
  // Store the socket by session ID
  sessionSockets.set(sessionId, socket);
  
  // Join a room with the session ID
  socket.join(sessionId);
  
  // Handle welcome message request
  socket.on('welcome', async (data) => {
    console.log(`🌟 Welcome message requested for session ${sessionId}`);
    const isAdmin = data.isAdmin === true;
    
    // Update MCP context if admin status changed
    if (mcpContexts.has(sessionId)) {
      const context = mcpContexts.get(sessionId);
      if (context.identity.is_admin !== isAdmin) {
        mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
        console.log(`🧠 Reset MCP context for session ${sessionId} with admin=${isAdmin}`);
      }
    } else {
      mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
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
    
    // Ensure MCP context exists with correct admin status
    if (!mcpContexts.has(sessionId) || mcpContexts.get(sessionId).identity.is_admin !== isAdmin) {
      mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
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
      console.log(`📨 Received message for session ${sessionId}: "${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}" (Admin: ${data.isAdmin})`);
      
      // Show typing indicator
      socket.emit('typing', true);
      
      // Get MCP context or create if it doesn't exist
      if (!mcpContexts.has(sessionId)) {
        mcpContexts.set(sessionId, createNewMCPContext(sessionId, data.isAdmin));
      }
      
      const context = mcpContexts.get(sessionId);
      
      // Update admin status if it changed
      if (context.identity.is_admin !== data.isAdmin) {
        context.identity.is_admin = data.isAdmin;
        context.identity.persona = data.isAdmin ? "admin" : "customer";
        context.tools = data.isAdmin
          ? ["lookupUser", "createContact", "getServices", "getAvailableSlots", "bookAppointment", "storeUser"] 
          : ["lookupUser", "getServices", "getAvailableSlots", "bookAppointment", "storeUser"];
      }
      
      // Add user message to history
      context.history.push({ role: 'user', content: data.message });
      mcpContexts.set(sessionId, context);
      
      // Infer goals from message content (simple heuristics)
      if (data.message.toLowerCase().includes('book') || data.message.toLowerCase().includes('appointment')) {
        if (!context.goals.includes('book_appointment')) {
          context.goals.push('book_appointment');
        }
      }
      
      if (data.message.toLowerCase().includes('service') || data.message.toLowerCase().includes('price')) {
        if (!context.goals.includes('provide_service_information')) {
          context.goals.push('provide_service_information');
        }
      }
      
      try {
        // Get or create executor for this session
        const executor = await getOrCreateExecutor(sessionId, data.isAdmin);

        // Get user context from MCP memory
        const userInfo = context.memory.user_info;
        
        // Prepare input with user context if available
        let inputToUse = data.message;
        if (userInfo?.resourceName) {
          inputToUse = `[REMINDER: This customer's ResourceName is "${userInfo.resourceName}"]
          
${data.message}`;
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
        
        console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? '...' : ''}"`);
        
        // Add assistant response to history
        context.history.push({ role: 'assistant', content: responseContent });
        
        // Check for service or appointment preferences in the conversation and update memory
        if (responseContent.toLowerCase().includes('service') && responseContent.match(/['"](.*?)['"]/) !== null) {
          const serviceMatch = responseContent.match(/['"]([^'"]*lashes[^'"]*)['"]/i) || 
                          responseContent.match(/['"]([^'"]*facial[^'"]*)['"]/i) ||
                          responseContent.match(/['"]([^'"]*waxing[^'"]*)['"]/i);
          if (serviceMatch) {
            context.memory.last_selected_service = serviceMatch[1];
          }
        }
        
        if (responseContent.toLowerCase().includes('appointment') || responseContent.toLowerCase().includes('book')) {
          const dateMatch = responseContent.match(/(\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+ \d{4}|\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            context.memory.preferred_date = dateMatch[1];
          }
          
          const timeMatch = responseContent.match(/(\d{1,2}(?::\d{2})? ?(?:am|pm))/i);
          if (timeMatch) {
            context.memory.preferred_time = timeMatch[1];
          }
        }
        
        // Update MCP context
        mcpContexts.set(sessionId, context);
        
        // Stop typing indicator
        socket.emit('typing', false);
        
        // Send the response back to the client
        socket.emit('message', {
          role: 'assistant',
          content: responseContent,
          id: uuidv4()
        });
      } catch (error) {
        console.error('❌ Error in chat processing:', error);
        
        // Stop typing indicator
        socket.emit('typing', false);
        
        // Send error message
        socket.emit('message', {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          id: uuidv4()
        });
      }
    } catch (error) {
      console.error('❌ Error in chat processing:', error);
      
      // Stop typing indicator
      socket.emit('typing', false);
      
      // Send error message
      socket.emit('message', {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        id: uuidv4()
      });
    }
  });
  
  // Handle clear context request
  socket.on('clearContext', async () => {
    try {
      console.log(`🧹 Clearing context for session ${sessionId}`);
      
      // Save admin status before clearing
      const isAdmin = mcpContexts.has(sessionId) ? mcpContexts.get(sessionId).identity.is_admin : false;
      
      // Reset MCP context
      mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
      
      socket.emit('contextCleared', { success: true });
    } catch (error) {
      console.error('❌ Error clearing context:', error);
      socket.emit('contextCleared', { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // API to get MCP context
  socket.on('getContext', () => {
    const context = mcpContexts.has(sessionId) ? mcpContexts.get(sessionId) : createNewMCPContext(sessionId);
    socket.emit('context', { context });
  });
  
  // API to get chat history
  socket.on('getHistory', () => {
    const history = mcpContexts.has(sessionId) ? mcpContexts.get(sessionId).history : [];
    socket.emit('history', { history });
  });
  
  // Handle tool usage request
  socket.on('useTool', async (data) => {
    try {
      const { tool, params } = data;
      
      console.log(`🔧 Tool request for session ${sessionId}: ${tool}`);
      
      // Get the MCP context for this session
      if (!mcpContexts.has(sessionId)) {
        mcpContexts.set(sessionId, createNewMCPContext(sessionId));
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
        console.log(`🔄 Context may have changed for session ${sessionId}, executor will rebuild if needed`);
      }
    } catch (error) {
      console.error('❌ Error using tool:', error);
      socket.emit('toolResult', {
        success: false,
        tool: data.tool,
        error: error.message
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    sessionSockets.delete(sessionId);
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
    console.log(`🔧 Tool parameters:`, params);
    
    // Execute the tool directly since we have tools integrated in this server
    try {
      // Get or create context for this session
      if (!mcpContexts.has(sessionId)) {
        const isAdmin = req.body.isAdmin === true;
        mcpContexts.set(sessionId, createNewMCPContext(sessionId, isAdmin));
      }
      
      const context = mcpContexts.get(sessionId);
      const isAdmin = context.identity.is_admin;
      
      // Create context-aware tools for this request
      const { createTools } = require('./src/tools');
      const tools = createTools(context, sessionId);
      
      // Find the requested tool
      const requestedTool = tools.find(t => t.name === tool);
      
      if (!requestedTool) {
        return res.status(404).json({
          success: false,
          message: `Tool '${tool}' not found`
        });
      }
      
      // Call the tool with the provided parameters
      const result = await requestedTool._call(params);
      
      // Store the result for this session and tool (redundant but kept for backward compatibility)
      if (!toolResults.has(sessionId)) {
        toolResults.set(sessionId, new Map());
      }
      toolResults.get(sessionId).set(tool, result);
      
      return res.status(200).json({
        success: true,
        result
      });
    } catch (toolError) {
      console.error(`❌ Error executing tool ${tool}:`, toolError);
      return res.status(500).json({
        success: false,
        message: `Error executing tool ${tool}`,
        error: toolError.message
      });
    }
  } catch (error) {
    console.error('❌ Error in tools API:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error calling tool',
      error: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3003;

// Log all environment variables for debugging
console.log('🔧 Environment Variables at Startup:');
Object.keys(process.env).sort().forEach(key => {
  console.log(`${key}: ${key.includes('SECRET') || key.includes('KEY') ? '[REDACTED]' : process.env[key]}`);
});

server.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
}); 