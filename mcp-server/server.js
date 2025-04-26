const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// In-memory storage for user contexts and chat histories
const userContexts = new Map();
const chatHistories = new Map();
const sessionSockets = new Map();

// Configure CORS
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

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
  
  // Store the socket by session ID
  sessionSockets.set(sessionId, socket);
  
  // Join a room with the session ID
  socket.join(sessionId);
  
  // Handle welcome message request
  socket.on('welcome', async (data) => {
    console.log(`🌟 Welcome message requested for session ${sessionId}`);
    const isAdmin = data.isAdmin === true;
    
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
    
    try {
      // Call contacts API to get customer data
      const apiEndpoint = `${process.env.API_URL || 'http://localhost:3002'}/api/contacts?resourceName=${encodeURIComponent(data.resourceName)}`;
      
      const contactsResponse = await axios.get(apiEndpoint);
      const contactData = contactsResponse.data;
      
      if (!contactData.success || !contactData.contact) {
        throw new Error('Customer not found');
      }
      
      const customer = contactData.contact;
      
      // Add customer to user context for this session
      const updatedContext = {
        resourceName: customer.resourceName,
        name: customer.name,
        mobile: customer.mobile,
        updatedAt: new Date().toISOString()
      };
      
      userContexts.set(sessionId, updatedContext);
      console.log('✅ Stored customer context for session', sessionId, ':', updatedContext);
      
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
      
      // Get user context if it exists from memory
      const userContext = userContexts.get(sessionId);
      if (userContext) {
        console.log(`👤 Found existing user context for session ${sessionId}:`, userContext);
      }
      
      // Get existing chat history or initialize a new one
      if (!chatHistories.has(sessionId)) {
        chatHistories.set(sessionId, []);
        console.log(`📝 Created new chat history for session ${sessionId}`);
      }
      const history = chatHistories.get(sessionId);
      
      // Add user message to history
      history.push({ role: 'human', content: data.message });
      
      // Prepare input with user context if available
      let inputToUse = data.message;
      if (userContext?.resourceName) {
        inputToUse = `${data.message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
        console.log('📝 Enhanced input with user context for session', sessionId);
      }
      
      // Call AI service API endpoint with the chat
      const aiServiceUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:3002/api/chat'}`;
      const aiResponse = await axios.post(aiServiceUrl, {
        message: inputToUse,
        sessionId: sessionId,
        history: history,
        isAdmin: data.isAdmin === true
      });
      
      // Get response from AI service
      let responseContent = aiResponse.data.response || 'Sorry, I could not generate a response';
      
      console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? '...' : ''}"`);
      
      // Add assistant response to history
      history.push({ role: 'assistant', content: responseContent });
      
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
      
      // Remove user context
      userContexts.delete(sessionId);
      
      // Clear chat history
      if (chatHistories.has(sessionId)) {
        chatHistories.delete(sessionId);
      }
      
      socket.emit('contextCleared', { success: true });
    } catch (error) {
      console.error('❌ Error clearing context:', error);
      socket.emit('contextCleared', { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // API to get user context
  socket.on('getContext', () => {
    const context = userContexts.get(sessionId) || null;
    socket.emit('context', { context });
  });
  
  // API to get chat history
  socket.on('getHistory', () => {
    const history = chatHistories.get(sessionId) || [];
    socket.emit('history', { history });
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
app.post('/api/context/:sessionId', express.json(), (req, res) => {
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