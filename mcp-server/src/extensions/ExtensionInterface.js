/**
 * Base interface that all extensions must implement
 */
class ExtensionInterface {
  /**
   * Process a message and update memory directly
   * @param {string} message - The message to process
   * @param {Object} memory - The memory object to update
   */
  process(message, memory) {
    throw new Error('process() must be implemented by extension');
  }
}

module.exports = ExtensionInterface; 