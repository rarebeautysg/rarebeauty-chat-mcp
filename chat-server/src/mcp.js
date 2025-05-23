const { MCPClient } = require('@modelcontextprotocol/sdk');

// Initialize MCP client
const mcpClient = new MCPClient({
  // Add your MCP configuration here
  // You'll need to provide these values from your environment variables
  apiKey: process.env.MCP_API_KEY,
  endpoint: process.env.MCP_ENDPOINT || 'https://api.modelcontextprotocol.com',
});

// Helper function to create a new session
async function createSession(sessionId, isAdmin = false) {
  try {
    const session = await mcpClient.createSession({
      sessionId,
      metadata: {
        isAdmin,
        timestamp: new Date().toISOString(),
      },
    });
    return session;
  } catch (error) {
    console.error('❌ Error creating MCP session:', error);
    throw error;
  }
}

// Helper function to send a message to MCP
async function sendMessage(sessionId, message) {
  try {
    const response = await mcpClient.sendMessage(sessionId, {
      content: message,
      timestamp: new Date().toISOString(),
    });
    return response;
  } catch (error) {
    console.error('❌ Error sending message to MCP:', error);
    throw error;
  }
}

// Helper function to get session context
async function getContext(sessionId) {
  try {
    const context = await mcpClient.getContext(sessionId);
    return context;
  } catch (error) {
    console.error('❌ Error getting MCP context:', error);
    throw error;
  }
}

// Helper function to clear session context
async function clearContext(sessionId) {
  try {
    await mcpClient.clearContext(sessionId);
  } catch (error) {
    console.error('❌ Error clearing MCP context:', error);
    throw error;
  }
}

module.exports = {
  mcpClient,
  createSession,
  sendMessage,
  getContext,
  clearContext,
}; 