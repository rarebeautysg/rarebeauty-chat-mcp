const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// MCP structured context - following Model Context Protocol
// Each session has a structured context object
const mcpContexts = new Map();

// In-memory storage for user contexts and chat histories
const userContexts = new Map();
const chatHistories = new Map();
const sessionSockets = new Map();

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

// JWT token verification endpoint
app.post('/api/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ isValid: false, message: 'No token provided' });
    }
    
    // Get JWT secret from environment variables
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('❌ JWT_SECRET not set in environment variables');
      return res.status(500).json({ isValid: false, message: 'Server configuration error' });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, jwtSecret);
    
    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({ isValid: false, message: 'Token has expired' });
    }
    
    // Return the decoded data
    return res.json({ isValid: true, decoded });
  } catch (error) {
    console.error('❌ Error verifying token:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ isValid: false, message: 'Invalid token' });
    }
    
    return res.status(500).json({ isValid: false, message: 'Server error' });
  }
});

// AI Tools endpoint for external tools access
app.post('/api/tools', async (req, res) => {
  try {
    const { tool, params, sessionId } = req.body;
    
    if (!tool) {
      return res.status(400).json({ success: false, message: 'No tool specified' });
    }
    
    // Check if we have an API endpoint to forward to
    const toolsApiUrl = process.env.TOOLS_API_URL || 'http://localhost:3002/api/tools';
    
    // Forward the request to the tools API
    const toolResponse = await axios.post(toolsApiUrl, {
      tool,
      params,
      sessionId
    });
    
    // Return the response
    return res.status(200).json(toolResponse.data);
  } catch (error) {
    console.error('❌ Error calling tool:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error calling tool',
      error: error.message
    });
  }
});

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      // Allow all origins during development
      console.log(`🔄 Socket.IO CORS request from origin: ${origin}`);
      callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }
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
      ? ["lookupUser", "createContact", "getServices", "getAvailableSlots", "bookAppointment"] 
      : ["lookupUser", "getServices", "getAvailableSlots", "bookAppointment"],
    history: []
  };
}

// Helper function to update user info in MCP context
function updateUserInfo(sessionId, userInfo) {
  if (!mcpContexts.has(sessionId)) {
    return false;
  }
  
  const context = mcpContexts.get(sessionId);
  context.memory.user_info = userInfo;
  context.identity.user_id = userInfo.resourceName;
  
  // If this is a returning customer, update goals and instructions
  if (userInfo.name) {
    context.identity.persona = "returning_customer";
    context.instructions = `Assist ${userInfo.name} with booking appointments. Personalize the conversation and reference their history if available.`;
  }
  
  mcpContexts.set(sessionId, context);
  return true;
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
      const apiEndpoint = `${process.env.API_URL || 'http://localhost:3002'}/api/contacts?resourceName=${encodeURIComponent(data.resourceName)}`;
      
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
      
      // Return a generic welcome message on error
      const welcomeMessage = isAdmin 
        ? "I couldn't find that customer. Can I have their mobile number so I can look them up?"
        : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
      
      socket.emit('message', {
        role: 'assistant',
        content: welcomeMessage,
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
          ? ["lookupUser", "createContact", "getServices", "getAvailableSlots", "bookAppointment"] 
          : ["lookupUser", "getServices", "getAvailableSlots", "bookAppointment"];
      }
      
      // Add user message to history
      context.history.push({ role: 'human', content: data.message });
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
      
      // Prepare enriched input with MCP context
      const mcpContext = {
        identity: context.identity,
        goals: context.goals,
        instructions: context.instructions,
        memory: context.memory,
        tools: context.tools,
        history: context.history.slice(-10) // Include last 10 messages to avoid too much data
      };
      
      // Call AI service API endpoint with the chat and MCP context
      const aiServiceUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:3002/api/chat'}`;
      const aiResponse = await axios.post(aiServiceUrl, {
        message: data.message,
        sessionId: sessionId,
        mcpContext: mcpContext,
        isAdmin: data.isAdmin === true
      });
      
      // Get response from AI service
      let responseContent = aiResponse.data.response || 'Sorry, I could not generate a response';
      
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
      
      // Update MCP context with tool usage
      if (mcpContexts.has(sessionId)) {
        const context = mcpContexts.get(sessionId);
        
        // Track tool usage in memory
        if (!context.memory.tool_usage) {
          context.memory.tool_usage = {};
        }
        
        if (!context.memory.tool_usage[tool]) {
          context.memory.tool_usage[tool] = [];
        }
        
        // Store tool parameters and timestamp
        context.memory.tool_usage[tool].push({
          timestamp: new Date().toISOString(),
          params: params
        });
        
        // Update memory based on tool and parameters
        if (tool === 'lookupUser' && params.mobile) {
          context.memory.last_mobile_lookup = params.mobile;
        } else if (tool === 'getAvailableSlots' && params.date) {
          context.memory.preferred_date = params.date;
          if (params.serviceIds && params.serviceIds.length > 0) {
            context.memory.last_selected_service = params.serviceIds[0];
          }
        } else if (tool === 'bookAppointment') {
          if (params.serviceIds && params.serviceIds.length > 0) {
            context.memory.last_selected_service = params.serviceIds[0];
          }
          if (params.date) context.memory.preferred_date = params.date;
          if (params.time) context.memory.preferred_time = params.time;
        }
        
        mcpContexts.set(sessionId, context);
      }
      
      // Call tools API
      const toolsApiUrl = `${process.env.TOOLS_API_URL || 'http://localhost:3002/api/tools'}`;
      const toolResponse = await axios.post(toolsApiUrl, {
        tool,
        params,
        sessionId
      });
      
      // Send back the result
      socket.emit('toolResult', {
        success: true,
        tool,
        result: toolResponse.data.result
      });
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

// External API endpoints

// Get context for a session
app.get('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = userContexts.get(sessionId);
  
  if (!context) {
    return res.status(404).json({ success: false, message: 'Context not found' });
  }
  
  res.json({ success: true, context });
});

// Get history for a session
app.get('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = chatHistories.get(sessionId) || [];
  
  res.json({ success: true, history });
});

// Set context for a session
app.post('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { context } = req.body;
  
  if (!context) {
    return res.status(400).json({ success: false, message: 'No context provided' });
  }
  
  userContexts.set(sessionId, {
    ...context,
    updatedAt: new Date().toISOString()
  });
  
  res.json({ success: true });
});

// Start the server
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
}); 