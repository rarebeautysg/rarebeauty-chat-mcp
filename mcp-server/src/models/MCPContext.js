/**
 * Class representing the MCP context for a session
 * This centralizes all context management in one place
 */
class MCPContext {
  /**
   * Create a new MCP context
   * @param {Object} initialContext - Initial context values
   */
  constructor(initialContext = {}) {
    // Memory object for persisting all state
    this.memory = initialContext.memory || {};
    
    // Handle the case where admin_mode is passed directly in initialContext
    if (initialContext.admin_mode === true && !this.memory.admin_mode) {
      this.memory.admin_mode = true;
    }
    
    // Initialize default memory structure
    if (this.memory.admin_mode !== true) this.memory.admin_mode = false;
    if (!this.memory.selectedServices) this.memory.selectedServices = [];
    if (!this.memory.tool_usage) this.memory.tool_usage = {};
    
    // Conversation history - kept separate for simplicity and performance
    this.history = initialContext.history || [];
    
    // Additional metadata
    this.lastUpdated = new Date().toISOString();
    this.sessionProperties = initialContext.sessionProperties || {};
  }
  
  /**
   * Update the context with new values
   * @param {Object} updates - Values to update
   * @returns {MCPContext} - The updated context
   */
  update(updates = {}) {
    // Apply updates to all properties
    Object.entries(updates).forEach(([key, value]) => {
      // Special handling for history updates
      if (key === 'history' && Array.isArray(value)) {
        this.history = [...value];
      } else if (key === 'sessionProperties' && typeof value === 'object') {
        // Merge session properties
        this.sessionProperties = {
          ...this.sessionProperties,
          ...value
        };
      } else if (key === 'memory' && typeof value === 'object') {
        // Merge memory
        this.memory = {
          ...this.memory,
          ...value
        };
      }
    });
    
    // Update the timestamp
    this.lastUpdated = new Date().toISOString();
    
    return this;
  }
  
  /**
   * Add a message to the history
   * @param {Object} message - Message to add
   * @returns {MCPContext} - The updated context
   */
  addMessage(message) {
    if (!message || !message.role) {
      throw new Error('Invalid message format: missing role');
    }
    
    const newMessage = {
      role: message.role,
      content: message.content || '',  // Use empty string as fallback
      timestamp: new Date().toISOString()
    };
    
    // Include tool_calls if they exist
    if (message.tool_calls) {
      newMessage.tool_calls = message.tool_calls;
    }
    
    // Add tool_call_id for tool responses
    if (message.role === 'tool' && message.tool_call_id) {
      newMessage.tool_call_id = message.tool_call_id;
    }
    
    // Add name for tool responses
    if (message.role === 'tool' && message.name) {
      newMessage.name = message.name;
    }
    
    this.history.push(newMessage);
    
    this.lastUpdated = new Date().toISOString();
    
    return this;
  }
  
  /**
   * Reset the context while preserving admin mode
   * @returns {MCPContext} - The reset context
   */
  reset() {
    const isAdmin = this.memory.admin_mode === true;
    
    // Reset the memory but preserve admin mode
    this.memory = {
      admin_mode: isAdmin,
      tool_usage: {}
    };
    
    this.history = [];
    this.sessionProperties = {};
    this.lastUpdated = new Date().toISOString();
    
    return this;
  }
  
  /**
   * Serialize the context to a plain object
   * @returns {Object} - Plain object representation
   */
  toJSON() {
    return {
      memory: this.memory,
      history: this.history,
      lastUpdated: this.lastUpdated,
      sessionProperties: this.sessionProperties
    };
  }
  
  /**
   * Create an MCPContext from a plain object
   * @param {Object} obj - Plain object representation
   * @returns {MCPContext} - New MCPContext instance
   */
  static fromJSON(obj) {
    return new MCPContext(obj);
  }
}

module.exports = MCPContext; 