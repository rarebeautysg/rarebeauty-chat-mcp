/**
 * Registry for managing message processing extensions
 */
class ExtensionRegistry {
  constructor() {
    this.extensions = new Map();
  }

  /**
   * Register a new extension
   * @param {string} name - Name of the extension
   * @param {ExtensionInterface} extension - The extension instance
   */
  register(name, extension) {
    if (!extension.process || typeof extension.process !== 'function') {
      throw new Error(`Extension ${name} must implement process() method`);
    }
    this.extensions.set(name, extension);
  }

  /**
   * Process a message through all registered extensions
   * @param {string} message - The message to process
   * @param {Object} memory - The memory object to update
   */
  processMessage(message, memory) {
    for (const [name, extension] of this.extensions) {
      try {
        extension.process(message, memory);
      } catch (error) {
        console.error(`Error processing message with extension ${name}:`, error);
      }
    }
  }
}

module.exports = new ExtensionRegistry(); 