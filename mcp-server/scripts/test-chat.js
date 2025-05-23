/**
 * Simple test script for the chat service
 */
const ChatService = require('../src/services/chatService');
const MCPContext = require('../src/models/MCPContext');

async function runTest() {
  // Create a chat service instance
  const chatService = new ChatService();
  
  // Create a session ID
  const sessionId = 'test-session-' + Date.now();
  
  // Create a context
  const context = new MCPContext();
  
  console.log('Testing admin chat flow:');
  
  // Test admin mode
  const isAdmin = true;
  
  // Process a simple message
  try {
    console.log('Sending first message (mobile number)...');
    const response1 = await chatService.processMessage(
      sessionId,
      context,
      { content: '93663631' },
      isAdmin,
      (token) => {
        // Optional: Log tokens as they come in
        process.stdout.write(token);
      }
    );
    
    console.log('\nResponse received:', response1.response.content);
    
    console.log('\nSending second message...');
    const response2 = await chatService.processMessage(
      sessionId,
      context,
      { content: 'I want to book a facial' },
      isAdmin,
      (token) => {
        // Optional: Log tokens as they come in
        process.stdout.write(token);
      }
    );
    
    console.log('\nResponse received:', response2.response.content);
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
runTest().catch(console.error); 