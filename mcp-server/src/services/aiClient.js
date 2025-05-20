/**
 * Client for interacting with AI services
 * This is a thin wrapper around ChatService
 */
const ChatService = require('./chatService');

class AIClient {
  constructor(config = {}) {
    this.config = {
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4o',
      ...config
    };
    
    // Create a ChatService instance
    this.chatService = new ChatService();
  }

  /**
   * Generate a chat response from the LLM with proper tool integration
   * @param {Object} params - Parameters for the chat request
   * @param {Array} params.messages - Array of message objects with role and content
   * @param {Object} params.context - The current conversation context
   * @param {string} params.sessionId - The session ID for this conversation
   * @returns {Promise<Object>} - The AI response and any context updates
   */
  async generateChatResponse({ messages, context, sessionId }) {
    try {
      console.log(`AIClient generating response for session ${sessionId}`);
      
      // Extract the user message from the messages array
      const userMessages = messages.filter(msg => msg.role === 'user');
      const lastUserMessage = userMessages[userMessages.length - 1];
      
      if (!lastUserMessage) {
        throw new Error('No user message found in the messages array');
      }
      
      // Determine if this is an admin session
      const isAdmin = context.memory?.admin_mode === true;
      
      // Use ChatService's executor to get the response
      const executor = await this.chatService.getExecutor(sessionId, context, isAdmin);
      
      // Get chat history for the executor
      const chatHistory = messages.filter(msg => 
        msg.role !== 'system' && (msg.role === 'user' || msg.role === 'assistant')
      );
      
      // Call the executor with the user message and chat history
      const result = await executor.invoke({
        input: lastUserMessage.content,
        chat_history: chatHistory
      });
      
      // Return the response
      return {
        content: result.output || "I'm sorry, I couldn't generate a response.",
        updatedContext: {}
      };
    } catch (error) {
      console.error('Error generating chat response:', error);
      // Return a fallback response in case of error
      return {
        content: "I apologize, but I encountered an error processing your request. Please try again.",
        updatedContext: {}
      };
    }
  }
}

module.exports = AIClient; 