const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ChatService = require('./services/chatService');
const AIClient = require('./services/aiClient');
const MCPContext = require('./models/MCPContext');
const crypto = require('crypto');
const dotenv = require('dotenv');

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
    const newContext = new MCPContext({ admin_mode: isAdmin });
    sessionContexts.set(sessionId, newContext);
    return newContext;
  }
  
  // Return existing context
  return sessionContexts.get(sessionId);
}

// Helper function to detect service removal in messages
function detectServiceRemoval(message) {
  const lowerMessage = message.toLowerCase();
  
  // Check for removal keywords
  const isRemoval = lowerMessage.includes('remove') || 
                   lowerMessage.includes('delete') || 
                   lowerMessage.includes('cancel') ||
                   lowerMessage.includes('take off') ||
                   lowerMessage.includes('without');
  
  if (!isRemoval) return { isRemoval: false };
  
  // Extract service names after removal keywords
  let serviceName = '';
  const removalMatch = lowerMessage.match(/(remove|delete|cancel|take off|without)\s+(.+?)($|\s+and|\s+,|\s+from)/i);
  
  if (removalMatch && removalMatch[2]) {
    serviceName = removalMatch[2].trim();
    console.log(`🔍 Detected service removal: "${serviceName}"`);
    return { isRemoval: true, serviceName };
  }
  
  return { isRemoval: true };  // General removal detected but no specific service identified
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// API endpoint to get context for a session
app.get('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getContextBySessionId(sessionId);
  res.json(context.toJSON());
});

// API endpoint to get chat history for a session
app.get('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const context = getContextBySessionId(sessionId);
  res.json({ history: context.history || [] });
});

// API endpoint to update context for a session
app.post('/api/context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const updates = req.body;
  
  // Get or create context
  const context = getContextBySessionId(sessionId);
  
  // Update context with new values
  context.update(updates);
  
  // Return updated context
  res.json(context.toJSON());
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Track which session this socket belongs to
  let currentSessionId = socket.id;
  
  // Handle session registration - compatibility with existing code
  socket.on('session', ({ sessionId }) => {
    if (sessionId) {
      currentSessionId = sessionId;
      console.log(`Socket ${socket.id} registered with existing sessionId ${sessionId}`);
    } else {
      // Generate a session ID if not provided
      currentSessionId = `session_${Date.now()}_${socket.id}`;
      console.log(`Socket ${socket.id} assigned new sessionId ${currentSessionId}`);
    }
    
    // Join a room for this session
    socket.join(currentSessionId);
    
    // Send the session ID back to the client
    socket.emit('session', { sessionId: currentSessionId });
  });
  
  // Handle welcome message (initial connection from client)
  socket.on('welcome', async (data) => {
    try {
      const { isAdmin = false } = data || {};
      console.log(`Received welcome from ${socket.id}, isAdmin: ${isAdmin}`);
      
      // Create or get context with admin mode if specified
      const context = getContextBySessionId(currentSessionId, isAdmin);
      
      // Custom welcome message based on admin mode
      let welcomeMsg = "Hello! How can I help you today?";
      
      // Use admin-specific greeting if in admin mode
      if (isAdmin) {
        welcomeMsg = "Hi Admin, can I have your customer's mobile number to begin?";
      }
      
      socket.emit('message', { 
        role: 'assistant',
        content: welcomeMsg,
        timestamp: new Date().toISOString(),
        id: generateMessageId()
      });
      
      // Update the context
      context.addMessage({ role: 'assistant', content: welcomeMsg });
      sessionContexts.set(currentSessionId, context);
      
      // Send updated context
      socket.emit('context', context.toJSON());
      
    } catch (error) {
      console.error('Error handling welcome:', error);
      socket.emit('error', { message: 'Failed to process welcome' });
    }
  });
  
  // Handle chat messages
  socket.on('chat', async (data) => {
    try {
      console.log(`Received chat message from ${socket.id}:`, data);
      const { message, isAdmin = false } = data || {};
      
      if (!message) {
        socket.emit('error', { message: 'No message content provided' });
        return;
      }
      
      const context = getContextBySessionId(currentSessionId, isAdmin);
      
      // Detect intent from message content
      let intent = null;
      const lowerMessage = message.toLowerCase();
      
      // Check for update intents with common typo support
      if ((lowerMessage.includes('update') || lowerMessage.includes('udate') || lowerMessage.includes('change')) && 
          (lowerMessage.includes('appointment') || lowerMessage.includes('booking') || lowerMessage.includes('appt') || 
           lowerMessage.includes('apt') || lowerMessage.includes('that'))) {
        console.log(`🔄 Detected update appointment intent from message: "${message}"`);
        intent = 'update';
      }
      
      // Additional check for appointment ID references (like "update #123456")
      if (!intent && (lowerMessage.includes('update') || lowerMessage.includes('change'))) {
        // Check if we have an appointment ID in context or if appointment ID is mentioned
        if (context.memory?.current_appointment_id || /\b(appt|appointment|id|#):?[-\s]?([a-zA-Z0-9]{6,})\b/i.test(lowerMessage)) {
          console.log(`🔄 Detected update intent with contextual appointment reference: "${message}"`);
          intent = 'update';
        }
      }
      
      // Check if we have an appointment ID in context and set intent to update
      if (!intent && context.memory && context.memory.appointments && context.memory.appointments.length > 0) {
        const latestAppointment = context.memory.appointments[0];
        if (latestAppointment && latestAppointment.id) {
          context.memory.current_appointment_id = latestAppointment.id;
          console.log(`🔄 Setting current_appointment_id to ${latestAppointment.id} from recent appointments`);
          
          if (lowerMessage.length < 10) {
            // Short messages are likely just answers to prompts, preserve update intent
            const hasUpdateIntent = context.memory.intent === 'update';
            if (hasUpdateIntent) {
              console.log(`🔄 Preserving update intent for short response: "${message}"`);
              intent = 'update';
            }
          }
        }
      }
      
      // Detect service removal
      const serviceRemoval = detectServiceRemoval(message);
      if (serviceRemoval.isRemoval) {
        console.log(`🔄 Detected service removal in message: "${message}"`);
        
        // Add a hint in the context to help the LLM handle this correctly
        if (!context.memory.actionHints) {
          context.memory.actionHints = [];
        }
        
        const hint = {
          type: 'serviceRemoval',
          timestamp: new Date().toISOString(),
          serviceName: serviceRemoval.serviceName || ''
        };
        
        context.memory.actionHints.push(hint);
        console.log(`💡 Added service removal hint to context: ${JSON.stringify(hint)}`);
        
        // Set intent to update if not already set
        if (!intent) {
          intent = 'update';
          console.log(`🔄 Setting intent to 'update' due to service removal`);
        }
      }
      
      // Show typing indicator to client
      socket.emit('typing', true);
      
      // Process the message with the chat service
      const { response, updatedContext } = await chatService.processMessage(
        currentSessionId,
        context,
        { content: message },
        isAdmin,
        intent
      );
      
      // Store the updated context
      sessionContexts.set(currentSessionId, updatedContext);
      
      // Send the response
      socket.emit('message', {
        ...response,
        timestamp: new Date().toISOString(),
        id: generateMessageId()
      });
      
      // Send updated context
      socket.emit('context', updatedContext.toJSON());
      
      // Stop typing indicator
      socket.emit('typing', false);
      
    } catch (error) {
      console.error('Error processing chat message:', error);
      socket.emit('error', { message: 'Failed to process message' });
      
      // Make sure to stop typing indicator on error too
      socket.emit('typing', false);
    }
  });
  
  // Handle tool calls with useTool event
  socket.on('useTool', async (data) => {
    try {
      console.log(`Received tool call from ${socket.id}:`, data);
      const { tool, args, isAdmin = false } = data || {};
      
      if (!tool) {
        socket.emit('error', { message: 'No tool specified' });
        return;
      }
      
      const context = getContextBySessionId(currentSessionId, isAdmin);
      
      // Show typing indicator while processing
      socket.emit('typing', true);
      
      // Format the tool call in the format our service expects
      const toolCalls = [{
        name: tool,
        arguments: args || {}
      }];
      
      // Process the tool calls
      const { toolResults, updatedContext } = await chatService.handleToolCalls(
        currentSessionId,
        context,
        toolCalls
      );
      
      // Store the updated context
      sessionContexts.set(currentSessionId, updatedContext);
      
      // Send the results
      socket.emit('toolResult', {
        tool,
        result: toolResults[0]?.result || {},
        timestamp: new Date().toISOString()
      });
      
      // Send updated context
      socket.emit('context', updatedContext.toJSON());
      
      // Stop typing indicator
      socket.emit('typing', false);
      
    } catch (error) {
      console.error('Error processing tool call:', error);
      socket.emit('error', { message: 'Failed to process tool call' });
      
      // Make sure to stop typing indicator on error
      socket.emit('typing', false);
    }
  });
  
  // Handle clearContext
  socket.on('clearContext', () => {
    try {
      console.log(`Clearing context for ${socket.id}`);
      const context = getContextBySessionId(currentSessionId);
      
      // Reset the context (this preserves admin mode)
      context.reset();
      
      // Store the updated context
      sessionContexts.set(currentSessionId, context);
      
      // Send updated context
      socket.emit('context', context.toJSON());
      socket.emit('message', {
        role: 'assistant',
        content: 'Context cleared. How can I help you?',
        timestamp: new Date().toISOString(),
        id: generateMessageId()
      });
      
    } catch (error) {
      console.error('Error clearing context:', error);
      socket.emit('error', { message: 'Failed to clear context' });
    }
  });
  
  // Handle getContext
  socket.on('getContext', () => {
    try {
      console.log(`Getting context for ${socket.id}`);
      const context = getContextBySessionId(currentSessionId);
      socket.emit('context', context.toJSON());
    } catch (error) {
      console.error('Error getting context:', error);
      socket.emit('error', { message: 'Failed to get context' });
    }
  });
  
  // Handle getHistory
  socket.on('getHistory', () => {
    try {
      console.log(`Getting history for ${socket.id}`);
      const context = getContextBySessionId(currentSessionId);
      socket.emit('history', { history: context.history || [] });
    } catch (error) {
      console.error('Error getting history:', error);
      socket.emit('error', { message: 'Failed to get history' });
    }
  });
  
  // Handle loadCustomer - special handler for loading customer profile
  socket.on('loadCustomer', async (data) => {
    try {
      console.log(`Loading customer for ${socket.id}:`, data);
      const { resourceName, isAdmin = false } = data || {};
      
      if (!resourceName) {
        socket.emit('error', { message: 'No resource name provided' });
        return;
      }
      
      const context = getContextBySessionId(currentSessionId, isAdmin);
      
      // For demonstration, we'll create a mock customer based on the resource name
      const customer = {
        name: resourceName,
        mobile: `+659${Math.floor(1000000 + Math.random() * 9000000)}`
      };
      
      // Update the context with the customer
      context.setCustomer(customer);
      sessionContexts.set(currentSessionId, context);
      
      // Send confirmation
      socket.emit('message', {
        role: 'assistant',
        content: `Customer ${customer.name} loaded. How can I help with this customer?`,
        timestamp: new Date().toISOString(),
        id: generateMessageId()
      });
      
      // Send updated context
      socket.emit('context', context.toJSON());
      
    } catch (error) {
      console.error('Error loading customer:', error);
      socket.emit('error', { message: 'Failed to load customer' });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    // No need to clean up contexts as they should persist between reconnections
  });
});

// Start the server
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`Socket.IO server listening for connections`);
}); 