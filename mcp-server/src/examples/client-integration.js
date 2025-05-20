/**
 * Example client integration with the MCP server
 * This demonstrates how to use the WebSocket API to maintain context
 */
const { io } = require('socket.io-client');

// Connect to MCP server
const socket = io('http://localhost:3003');

// Generate a session ID - in a real app, this would be unique per user session
const sessionId = 'user_' + Date.now();
const isAdmin = true; // Set to true for admin mode

// Track the current context
let currentContext = {
  admin_mode: isAdmin,
  history: []
};

// Connection established handler
socket.on('connect', () => {
  console.log('Connected to MCP server');
  
  // Register with a session ID
  socket.emit('register', { sessionId, isAdmin });
});

// Context update handler
socket.on('context_update', (context) => {
  console.log('Context updated:', context);
  currentContext = context;
  
  // This is where you'd update your UI with the new context
  // For example, showing selected services, appointment details, etc.
});

// Chat response handler
socket.on('chat_response', (response) => {
  console.log('Received response:', response.content);
  
  // This is where you'd display the assistant's message in your UI
});

// Tool results handler
socket.on('tool_results', (results) => {
  console.log('Tool execution results:', results);
  
  // This is where you'd handle tool results, e.g., showing a confirmation
  // message after appointment creation
});

// Error handler
socket.on('error', (error) => {
  console.error('Error from MCP server:', error.message);
});

// Simulated user interaction
function simulateUserMessage(message) {
  console.log(`User: ${message}`);
  
  // Send the message to the MCP server
  socket.emit('chat_message', { content: message });
}

// Simulated tool call
function simulateToolCall(toolName, args) {
  console.log(`Calling tool: ${toolName}`, args);
  
  // Send the tool call to the MCP server
  socket.emit('tool_call', {
    sessionId,
    toolCalls: [
      {
        name: toolName,
        arguments: args
      }
    ]
  });
}

// Example conversation flow
setTimeout(() => simulateUserMessage("I'd like to book an appointment"), 1000);

// After receiving first response, simulate customer providing name
setTimeout(() => simulateUserMessage("My name is Alice Tan and my mobile is +6591234567"), 3000);

// After getting service options, select a service
setTimeout(() => {
  // Instead of user typing this, we could programmatically call a tool
  simulateToolCall('selectServices', {
    serviceNames: ['lashes_full_set_dense']
  });
  
  // Then respond to confirm
  setTimeout(() => simulateUserMessage("I want the full set dense lashes"), 500);
}, 5000);

// Provide date
setTimeout(() => simulateUserMessage("I'd like to come in on 2025-05-21"), 7000);

// Provide time
setTimeout(() => simulateUserMessage("10:00 AM works for me"), 9000);

// Confirm booking
setTimeout(() => {
  // Here the user confirms, which would trigger appointment creation
  simulateUserMessage("Yes, please confirm");
  
  // We could directly call createAppointment tool as well
  setTimeout(() => {
    // In a real implementation, these values would come from the context
    simulateToolCall('createAppointment', {
      customer: { name: "Alice Tan", mobile: "+6591234567" },
      services: ['lashes_full_set_dense'],
      date: '2025-05-21',
      time: '10:00'
    });
  }, 500);
}, 11000);

// Disconnect after the demo
setTimeout(() => {
  console.log('Demo completed, disconnecting...');
  socket.disconnect();
}, 15000); 