const ExtensionInterface = require('./ExtensionInterface');

/**
 * Service removal detection extension for chat messages
 */
class ServiceRemovalExtension extends ExtensionInterface {
  process(message, memory) {
    // Check for service removal intent
    const removalPattern = /(?:remove|delete|cancel|take off|without)\s+(?:the\s+)?([a-zA-Z\s]+)(?:\s+service)?/i;
    const removalMatch = message.match(removalPattern);

    if (removalMatch) {
      const serviceName = removalMatch[1].trim();
      memory.actionHints.push({
        type: 'service_removal',
        timestamp: new Date().toISOString(),
        service: serviceName
      });
    }
  }
}

module.exports = new ServiceRemovalExtension(); 