const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

// Load environment variables
dotenv.config();

// Import langchain and executor functions
const { executors, adminExecutors, toolResults, getOrCreateExecutor } = require('./chat-utils');

// In-memory storage for user contexts and chat histories
const userContexts = new Map();
const chatHistories = new Map();
const sessionSockets = new Map();

// Create Express app
const app = express();
const server = http.createServer(app);

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

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, isAdmin = false, sessionId = uuidv4() } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.json({ error: 'Invalid request: message is required and must be a string' }, { status: 400 });
    }
    
    // Handle special welcome message request
    if (message === "__WELCOME__") {
      console.log(`🌟 Sending welcome message for new session ${sessionId}`);
      const welcomeMessage = isAdmin 
        ? "Welcome, Admin. Can I have the customer's mobile number so I can better help you?"
        : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
      
      return res.json({
        response: welcomeMessage,
        sessionId
      });
    } else if (message.indexOf("__LOAD_CUSTOMER__") !== -1) {
      console.log(`🔍 Loading customer for session ${sessionId}`);
      const resourceName = message.replace("__LOAD_CUSTOMER__", "");
      console.log(`🔍 Resource name: ${resourceName}`);
      
      // Load customer from database using the resource name
      try {
        // Call our contacts API to get customer data
        const apiEndpoint = `${process.env.API_URL || 'http://localhost:3002'}/api/contacts?resourceName=${encodeURIComponent(resourceName)}`;
        console.log(`🌐 Calling contacts API endpoint: ${apiEndpoint}`);
        
        const contactsResponse = await axios.get(apiEndpoint);
        
        if (!contactsResponse.status === 200) {
          const errorText = await contactsResponse.statusText;
          console.error(`❌ Contacts API error: ${contactsResponse.status}`, errorText);
          throw new Error(`Failed to load customer: ${contactsResponse.status} - ${errorText.substring(0, 100)}`);
        }
        
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
        
        return res.json({
          response: welcomeMessage,
          sessionId
        });
      } catch (error) {
        console.error('❌ Error loading customer:', error);
        
        // Return a generic welcome message on error
        const welcomeMessage = isAdmin 
          ? "I couldn't find that customer. Can I have their mobile number so I can look them up?"
          : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
        
        return res.json({
          response: welcomeMessage,
          sessionId
        });
      }
    }
    
    console.log(`📨 Received message for session ${sessionId}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}" (Admin: ${isAdmin})`);
    
    // Get or create executor
    let executor;
    let toolsAvailable = [];
    try {
      executor = await getOrCreateExecutor(sessionId, isAdmin);
      // Capture tools for error reporting
      toolsAvailable = executor.tools.map(t => t.name);
    } catch (executorError) {
      console.error(`❌ Error creating executor: ${executorError}`);
      return res.json(
        { error: 'Failed to initialize chat backend', details: executorError instanceof Error ? executorError.message : String(executorError) },
        { status: 500 }
      );
    }
    
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
    history.push({ type: 'human', content: message });
    
    // Prepare input with user context if available
    let inputToUse = message;
    if (userContext?.resourceName) {
      inputToUse = `${message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
      console.log('📝 Enhanced input with user context for session', sessionId);
      console.log('👤 User context applied:', JSON.stringify(userContext));
    } else {
      console.log('👤 No user context available for session', sessionId);
    }
    
    console.log(`🤖 Invoking executor for session ${sessionId}`);
    
    // Invoke the executor with the enhanced input
    console.log("🤖 Enhanced input:", JSON.stringify(inputToUse));
    
    try {
      const chatHistoryFormatted = history.map(msg => {
        if (msg.type === 'human') {
          return { role: 'human', content: msg.content };
        } else {
          return { role: 'assistant', content: msg.content };
        }
      });
      
      const result = await executor.invoke({
        input: inputToUse,
        chat_history: chatHistoryFormatted
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
      history.push({ type: 'assistant', content: responseContent });
      
      // Limit history length to prevent memory issues (optional)
      if (history.length > 50) {
        const removed = history.splice(0, history.length - 50);
        console.log(`📚 Trimmed chat history for session ${sessionId}, removed ${removed.length} oldest messages`);
      }
      
      // Return response with session ID
      return res.json({
        response: responseContent,
        sessionId,
      });
    } catch (error) {
      console.error('❌ Error in executor:', error);
      
      return res.json(
        { error: 'Failed to process chat message', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Error in chat API:', error);
    return res.json(
      { error: 'Failed to process chat message', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
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

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  
  // Get or create session ID from query params
  let sessionId = socket.handshake.query.sessionId;
  if (!sessionId) {
    sessionId = uuidv4();
    socket.emit('session', { sessionId });
    console.log(`📝 Generated new session ID: ${sessionId}`);
  }
  
  // Store socket by session ID
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
      
      // Get or create executor
      const executor = await getOrCreateExecutor(sessionId, data.isAdmin);
      
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
      history.push({ type: 'human', content: data.message });
      
      // Prepare input with user context if available
      let inputToUse = data.message;
      if (userContext?.resourceName) {
        inputToUse = `${data.message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
        console.log('📝 Enhanced input with user context for session', sessionId);
      }
      
      // Invoke the executor with the enhanced input
      console.log("🤖 Invoking executor with input:", JSON.stringify(inputToUse));
      
      try {
        const chatHistoryFormatted = history.map(msg => {
          if (msg.type === 'human') {
            return { role: 'human', content: msg.content };
          } else {
            return { role: 'assistant', content: msg.content };
          }
        });
        
        const result = await executor.invoke({
          input: inputToUse,
          chat_history: chatHistoryFormatted
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
        history.push({ type: 'assistant', content: responseContent });
        
        // Limit history length to prevent memory issues (optional)
        if (history.length > 50) {
          const removed = history.splice(0, history.length - 50);
          console.log(`📚 Trimmed chat history for session ${sessionId}, removed ${removed.length} oldest messages`);
        }
        
        // Stop typing indicator
        socket.emit('typing', false);
        
        // Send the response back to the client
        socket.emit('message', {
          role: 'assistant',
          content: responseContent,
          id: uuidv4()
        });
      } catch (error) {
        console.error('❌ Error in executor:', error);
        
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
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    sessionSockets.delete(sessionId);
  });
});

// API routes to get/set session data

// Get user context for a session
app.get('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = userContexts.get(sessionId);
  
  if (!context) {
    return res.status(404).json({ success: false, message: 'Context not found' });
  }
  
  res.json({ success: true, context });
});

// Get chat history for a session
app.get('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = chatHistories.get(sessionId) || [];
  
  res.json({ success: true, history });
});

// Clear context for a session
app.delete('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Clear data for this session
  let cleared = 0;
  
  if (executors.has(sessionId)) {
    executors.delete(sessionId);
    cleared++;
  }
  
  if (adminExecutors.has(sessionId)) {
    adminExecutors.delete(sessionId);
    cleared++;
  }
  
  if (userContexts.has(sessionId)) {
    userContexts.delete(sessionId);
    cleared++;
  }
  
  if (chatHistories.has(sessionId)) {
    chatHistories.delete(sessionId);
    cleared++;
  }
  
  if (toolResults.has(sessionId)) {
    toolResults.delete(sessionId);
    cleared++;
  }
  
  res.json({ 
    success: true, 
    message: `Context cleared for session ${sessionId}`,
    itemsCleared: cleared
  });
});

// Start server
const PORT = process.env.PORT || 3004;
server.listen(PORT, () => {
  console.log(`🚀 Chat Server running on port ${PORT}`);
}); 