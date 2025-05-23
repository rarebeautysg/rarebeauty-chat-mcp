const ExtensionInterface = require('./ExtensionInterface');

/**
 * Intent extraction extension for chat messages
 */
class IntentExtractionExtension extends ExtensionInterface {
  process(message, memory) {
    // If there's already an intent in memory, preserve it
    if (memory.intent) {
      console.log(`🔄 Using existing intent from memory: ${memory.intent}`);
      return;
    }

    // Extract intent from message
    const intent = this.extractIntent(message);
    if (intent) {
      console.log(`🔄 Setting intent in context: ${intent}`);
      memory.intent = intent;

      // If intent is update, ensure it's reflected in executor selection
      if (intent === 'update' && memory.appointments && memory.appointments.length > 0) {
        const latestAppointment = memory.appointments[0];
        if (latestAppointment && latestAppointment.id) {
          memory.current_appointment_id = latestAppointment.id;
          console.log(`🔄 Set current_appointment_id=${latestAppointment.id} from intent detection`);
        }
      }
    }
  }

  /**
   * Extract intent from message content
   * @param {string} message - The message to analyze
   * @returns {string|null} - The extracted intent or null if none found
   */
  extractIntent(message) {
    const lowerMessage = message.toLowerCase();

    // Check for update intent
    if (lowerMessage.includes('update') || lowerMessage.includes('change')) {
      return 'update';
    }

    // Check for cancel intent
    if (lowerMessage.includes('cancel') || lowerMessage.includes('remove')) {
      return 'cancel';
    }

    // Check for reschedule intent
    if (lowerMessage.includes('reschedule') || lowerMessage.includes('move')) {
      return 'reschedule';
    }

    return null;
  }
}

module.exports = new IntentExtractionExtension(); 