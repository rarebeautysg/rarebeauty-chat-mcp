const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ChatService = require('./services/chatService');
const AIClient = require('./services/aiClient');
const MCPContext = require('./models/MCPContext');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { wrapToolCall, wrapToolResult, validateToolCall, validateToolResult } = require('./schemas/stido');
const extensionRegistry = require('./extensions/ExtensionRegistry');
const intentDetection = require('./extensions/intentDetection');
const serviceRemoval = require('./extensions/serviceRemoval');
const intentExtraction = require('./extensions/intentExtraction');

// Register extensions
extensionRegistry.register('intentDetection', intentDetection);
extensionRegistry.register('serviceRemoval', serviceRemoval);
extensionRegistry.register('intentExtraction', intentExtraction);

// Initialize the app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict to your domain
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for session contexts
// In a production app, this would be Redis or another persistent store
const sessionContexts = new Map();

// Initialize services
const aiClient = new AIClient();
const chatService = new ChatService(aiClient);

// Load environment variables from .env file
console.log(`🔧 Loading environment from .env`);
dotenv.config();

// Output token for debugging
console.log(`🔑 Auth token loaded:`, process.env.SOHO_AUTH_TOKEN ? 'Yes' : 'No');

// Helper function to generate unique message IDs
function generateMessageId() {
  return crypto.randomUUID();
}

// Helper function to get context by session ID
function getContextBySessionId(sessionId, isAdmin = false) {
  if (!sessionContexts.has(sessionId)) {
    // Create new context if it doesn't exist
    const newContext = new MCPContext({ memory: { admin_mode: isAdmin } });
    sessionContexts.set(sessionId, newContext);
    console.log(`🆕 Created new context for session ${sessionId}, admin: ${isAdmin}`);
    return newContext;
  }
  
  // Return existing context but ensure admin mode is set correctly
  const context = sessionContexts.get(sessionId);
  
  // Ensure admin mode is set correctly
  if (isAdmin && !context.memory.admin_mode) {
    context.memory.admin_mode = true;
    console.log(`🔑 Updated admin_mode to true for existing context ${sessionId}`);
  }
  
  console.log(`🔄 Retrieved existing context for session ${sessionId}, history length: ${context.history?.length || 0}`);
  return context;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Add error handling for all socket events
  const safeSocketHandler = (eventHandler) => {
    return async (...args) => {
      try {
        await eventHandler(...args);
      } catch (error) {
        console.error(`Socket event handler error:`, error);
        // Send a friendly error message to the client
        socket.emit('error', { 
          message: 'An error occurred processing your request',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
        // Don't disconnect the socket, just log the error
      }
    };
  };
  
  // Track which session this socket belongs to
  let currentSessionId = socket.id;
  
  // Handle session registration
  socket.on('session', safeSocketHandler(({ sessionId }) => {
    if (sessionId) {
      currentSessionId = sessionId;
      console.log(`Socket ${socket.id} registered with existing sessionId ${sessionId}`);
    } else {
      currentSessionId = `session_${Date.now()}_${socket.id}`;
      console.log(`Socket ${socket.id} assigned new sessionId ${currentSessionId}`);
    }
    
    socket.join(currentSessionId);
    socket.emit('session', { sessionId: currentSessionId });
  }));
  
  // Handle welcome message
  socket.on('welcome', safeSocketHandler(async (data) => {
    const { isAdmin = false } = data || {};
    console.log(`Received welcome from ${socket.id}, isAdmin: ${isAdmin}`);
    
    const context = getContextBySessionId(currentSessionId, isAdmin);
    
    // Ensure admin mode is correctly set in memory
    if (isAdmin) {
      console.log('🔑 Setting admin_mode to true in context memory');
      context.memory.admin_mode = true;
    }
    
    let welcomeMsg = "Hello! How can I help you today?";
    if (isAdmin) {
      const { getAdminWelcomeMessage } = require('./prompts/systemPrompt-admin');
      const dateInfo = {
        formattedDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long', 
          day: 'numeric'
        }),
        todayStatus: new Date().getDay() === 0 ? "Today is Sunday and we are CLOSED." : "We are OPEN today."
      };
      welcomeMsg = getAdminWelcomeMessage(context, dateInfo);
    } else {
      const { getCustomerWelcomeMessage } = require('./prompts/systemPrompt-customer');
      const dateInfo = {
        formattedDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long', 
          day: 'numeric'
        }),
        todayStatus: new Date().getDay() === 0 ? "Today is Sunday and we are CLOSED." : "We are OPEN today."
      };
      welcomeMsg = getCustomerWelcomeMessage(context, dateInfo);
    }
    
    socket.emit('message', { 
      role: 'assistant',
      content: welcomeMsg,
      timestamp: new Date().toISOString(),
      id: generateMessageId()
    });
    
    context.addMessage({ role: 'assistant', content: welcomeMsg });
    sessionContexts.set(currentSessionId, context);
    
    socket.emit('context', context.toJSON());
  }));
  
  // Handle chat messages (use only 'chat' event for clarity)
  socket.on('chat', safeSocketHandler(async (data) => {
    // Extract message content or use default structure
    let messageContent = '';
    
    if (typeof data === 'string') {
      messageContent = data;
    } else if (typeof data === 'object') {
      if (data.message && typeof data.message === 'string') {
        messageContent = data.message;
      } else if (data.content && typeof data.content === 'string') {
        messageContent = data.content;
      }
    }
    
    if (!messageContent) {
      console.error('Invalid message format received:', data);
      socket.emit('error', { message: 'Invalid message format' });
      return;
    }
    
    const isAdmin = data.isAdmin === true;
    console.log(`📨 Received message (chat): "${messageContent}"`);

    // Get context from session instead of expecting it from client
    const context = getContextBySessionId(currentSessionId, isAdmin);
    
    // Ensure admin mode is correctly set in memory
    if (isAdmin && !context.memory.admin_mode) {
      console.log('🔑 Setting admin_mode to true in context memory');
      context.memory.admin_mode = true;
    }

    // Process message through all extensions
    extensionRegistry.processMessage(messageContent, context.memory);

    // Show typing indicator
    socket.emit('typing', true);

    try {
      // Get response from chat service with streaming
      const response = await chatService.processMessage(
        currentSessionId,
        context,
        // Create a properly formatted message object
        { content: messageContent },
        isAdmin,
        (token) => {
          // Emit each token as it arrives
          socket.emit('token', { token });
        }
      );
      console.log(`💬 Chat response complete (chat)`);

      // Log all event emissions for debugging
      console.log(`🔄 Emitting response events: message="${response.response.content.substring(0, 50)}..."`);
      
      // Send final response back to client with multiple event types for compatibility
      // 1. chat_response - our standard format with context
      socket.emit('chat_response', {
        message: response.response.content,
        context: response.updatedContext
      });
      console.log(`✅ Emitted 'chat_response' event`);

      // 2. message - simpler format used by many clients
      socket.emit('message', {
        role: 'assistant',
        content: response.response.content,
        timestamp: new Date().toISOString(),
        id: generateMessageId()
      });
      console.log(`✅ Emitted 'message' event`);
      
      // 3. chat - Some clients might listen for this
      socket.emit('chat', {
        message: response.response.content,
        isFromBot: true
      });
      console.log(`✅ Emitted 'chat' event`);
    } catch (error) {
      console.error('Error processing chat message (chat):', error);
      socket.emit('error', { 
        message: 'Failed to process message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      // Always stop typing indicator even if an error occurred
      socket.emit('typing', false);
    }
  }));
  
  // Handle tool calls with safe wrapper
  socket.on('useTool', safeSocketHandler(async (data) => {
    console.log(`Received tool call from ${socket.id}:`, data);
    const { tool, args, isAdmin = false } = data || {};
    
    if (!tool) {
      socket.emit('error', { message: 'No tool specified' });
      return;
    }
    
    const context = getContextBySessionId(currentSessionId, isAdmin);
    
    socket.emit('typing', true);
    
    const toolCall = wrapToolCall({
      name: tool,
      arguments: args || {}
    });
    
    const { toolResults, updatedContext } = await chatService.handleToolCalls(
      currentSessionId,
      context,
      [toolCall]
    );
    
    sessionContexts.set(currentSessionId, updatedContext);
    
    for (const result of toolResults) {
      socket.emit('toolResult', result);
    }
    
    socket.emit('context', updatedContext.toJSON());
    socket.emit('typing', false);
  }));
  
  // Handle clearContext request
  socket.on('clearContext', safeSocketHandler(() => {
    console.log(`Clearing context for ${socket.id}`);
    const context = getContextBySessionId(currentSessionId);
    context.reset();
    sessionContexts.set(currentSessionId, context);
    socket.emit('context', context.toJSON());
    socket.emit('message', {
      role: 'assistant',
      content: 'Context cleared. How can I help you?',
      timestamp: new Date().toISOString(),
      id: generateMessageId()
    });
  }));

  // Handle clearHistory request
  socket.on('clearHistory', safeSocketHandler(async () => {
    console.log(`Clearing history for ${socket.id}`);
    const context = getContextBySessionId(currentSessionId);
    await chatService.clearHistory(currentSessionId, context?.memory?.admin_mode === true);
    socket.emit('message', {
      role: 'assistant',
      content: 'Chat history has been cleared. Memory and customer information is preserved.',
      timestamp: new Date().toISOString(),
      id: generateMessageId()
    });
    // Send updated context
    socket.emit('context', context.toJSON());
  }));
  
  socket.on('getContext', safeSocketHandler(() => {
    console.log(`Getting context for ${socket.id}`);
    const context = getContextBySessionId(currentSessionId);
    socket.emit('context', context.toJSON());
  }));
  
  socket.on('getHistory', safeSocketHandler(() => {
    console.log(`Getting history for ${socket.id}`);
    const context = getContextBySessionId(currentSessionId);
    socket.emit('history', { history: context.history || [] });
  }));
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`Socket.IO server listening for connections`);
}); 