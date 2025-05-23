const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
dotenv.config();

// Server configuration
const app = express();
const server = http.createServer(app);

// Get MCP Server URL from environment
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';
console.log(`🔌 Using MCP Server at: ${MCP_SERVER_URL}`);

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

// ===== ROUTE PROXYING =====

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Detailed health check endpoint with environment variables
app.get('/health/detailed', (req, res) => {
  // Create a sanitized copy of environment variables
  const sanitizedEnv = {};
  Object.keys(process.env).sort().forEach(key => {
    // Redact sensitive values
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN') || key.includes('PASSWORD')) {
      sanitizedEnv[key] = '[REDACTED]';
    } else {
      sanitizedEnv[key] = process.env[key];
    }
  });
  
  // Build response with useful debugging information
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    server: {
      mcp_server_url: MCP_SERVER_URL,
      port: PORT || 3002,
      node_env: process.env.NODE_ENV || 'not set'
    },
    socket: {
      connected: io ? true : false,
      options: {
        transports: ['websocket', 'polling'],
        cors: 'enabled'
      }
    },
    environment: sanitizedEnv,
    connection_check: {
      mcp_reachable: null // Will be populated below
    }
  };
  
  // Test if MCP server is reachable
  axios.get(`${MCP_SERVER_URL}/health`, { timeout: 2000 })
    .then(() => {
      healthData.connection_check.mcp_reachable = true;
      res.status(200).json(healthData);
    })
    .catch(error => {
      healthData.connection_check.mcp_reachable = false;
      healthData.connection_check.error = error.message;
      res.status(200).json(healthData);
    });
});

// API proxy layer - Proxy all API requests to MCP server
app.use('/api', async (req, res) => {
  try {
    // Build the target URL by replacing our API path with the MCP server API path
    const targetUrl = `${MCP_SERVER_URL}${req.originalUrl}`;
    
    console.log(`🔄 Proxying ${req.method} request to: ${targetUrl}`);
    
    // Forward the request to the MCP server
    const mcpResponse = await axios({
      method: req.method,
      url: targetUrl,
      data: req.method !== 'GET' ? req.body : undefined,
      headers: {
        // Forward content type and other relevant headers
        'Content-Type': req.headers['content-type'] || 'application/json',
        // Add any additional headers needed
      },
    });
    
    // Return the MCP Server response
    return res.status(mcpResponse.status).json(mcpResponse.data);
  } catch (error) {
    console.error('❌ Error proxying to MCP Server:', error);
    return res.status(error.response?.status || 500).json({ 
      error: 'Failed to proxy request', 
      details: error.response?.data?.error || error.message 
    });
  }
});

// ===== WEBSOCKET PROXY LAYER =====

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: function(origin, callback) {
      console.log(`🔄 Socket.IO CORS request from origin: ${origin}`);
      callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  transports: ['websocket', 'polling'], // Explicitly enable both transport methods
  allowEIO3: true, // Enable compatibility with Socket.IO v2 clients
  pingTimeout: 60000, // Increase ping timeout to handle slow connections
  pingInterval: 25000 // Adjust ping interval
});

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  
  // Get or create session ID from query params
  let sessionId = socket.handshake.query.sessionId;
  if (sessionId) {
    console.log(`📝 Using existing session ID: ${sessionId}`);
  } else {
    console.log(`⚠️ No session ID provided in connection`);
  }
  
  // Event proxy function - Forward all events to MCP server
  const proxyEvent = async (event, data) => {
    try {
      console.log(`🔄 Proxying socket event "${event}" to MCP Server`);
      
      const response = await axios.post(`${MCP_SERVER_URL}/api/socket-event`, {
        event,
        data,
        sessionId
      });
      
      // Forward response back to client
      if (response.data.event) {
        socket.emit(response.data.event, response.data.data);
      }
      
      return response.data;
    } catch (error) {
      console.error(`❌ Error proxying socket event "${event}":`, error);
      socket.emit('error', { message: 'Failed to process your request' });
    }
  };
  
  // Forward session information
  socket.on('session', (data) => {
    console.log(`📝 Session data received:`, data);
    sessionId = data.sessionId;
    socket.emit('session', { sessionId });
  });
  
  // Forward welcome event
  socket.on('welcome', async (data) => {
    console.log(`🌟 Proxying welcome event for session ${sessionId || 'unknown'}`);
    await proxyEvent('welcome', data);
  });
  
  // Forward loadCustomer event
  socket.on('loadCustomer', async (data) => {
    console.log(`🔍 Proxying loadCustomer event for session ${sessionId || 'unknown'}: ${data.resourceName}`);
    await proxyEvent('loadCustomer', data);
  });
  
  // Forward chat message event
  socket.on('chat', async (data) => {
    console.log(`📨 Proxying chat message for session ${sessionId || 'unknown'}`);
    
    // Show typing indicator immediately (UX improvement)
    socket.emit('typing', true);
    
    await proxyEvent('chat', data);
  });
  
  // Forward clearContext event
  socket.on('clearContext', async () => {
    console.log(`🧹 Proxying clearContext event for session ${sessionId || 'unknown'}`);
    await proxyEvent('clearContext', {});
  });
  
  // Forward getContext event
  socket.on('getContext', async () => {
    console.log(`🧠 Proxying getContext event for session ${sessionId || 'unknown'}`);
    await proxyEvent('getContext', {});
  });
  
  // Forward getHistory event
  socket.on('getHistory', async () => {
    console.log(`📚 Proxying getHistory event for session ${sessionId || 'unknown'}`);
    await proxyEvent('getHistory', {});
  });
  
  // Forward useTool event
  socket.on('useTool', async (data) => {
    console.log(`🔧 Proxying useTool event for session ${sessionId || 'unknown'}: ${data.tool}`);
    await proxyEvent('useTool', data);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    
    // Notify MCP server about disconnection
    axios.post(`${MCP_SERVER_URL}/api/socket-event`, {
      event: 'disconnect',
      sessionId
    }).catch(error => {
      console.error('❌ Error notifying MCP server about disconnection:', error);
    });
  });
});

// Start the server
const PORT = process.env.PORT || 3002;

// Log all environment variables for debugging
console.log('🔧 Environment Variables at Chat Server Startup:');
Object.keys(process.env).sort().forEach(key => {
  console.log(`${key}: ${key.includes('SECRET') || key.includes('KEY') ? '[REDACTED]' : process.env[key]}`);
});

server.listen(PORT, () => {
  console.log(`🚀 Chat Gateway Server running on port ${PORT}`);
  console.log(`🔄 Proxying requests to MCP Server at ${MCP_SERVER_URL}`);
}); 