const ExtensionInterface = require('./ExtensionInterface');

/**
 * Intent detection extension for chat messages
 */
class IntentDetectionExtension extends ExtensionInterface {
  /**
   * Detect intent from message content
   * @param {string} message - The message to analyze
   * @param {Object} memory - The current memory
   * @returns {Object} - Detected intent and any additional data
   */
  process(message, memory) {
    // Check for appointment update intent
    const updatePattern = /(?:update|change|modify|reschedule|move|push back|push forward|postpone|delay|earlier|later)\s+(?:my|the|this|that|our)\s+(?:appointment|booking|session|visit|meeting)/i;
    const updateMatch = message.match(updatePattern);

    if (updateMatch) {
      // Check for common typos
      const typoPattern = /(?:appoitment|appointmnet|appointmet|appointmnt|appointmetn|appointmnt|appointmet|appointmnt|appointmet|appointmnt)/i;
      const typoMatch = message.match(typoPattern);
      
      if (typoMatch) {
        memory.actionHints.push({
          type: 'typo_detected',
          timestamp: new Date().toISOString(),
          original: typoMatch[0],
          corrected: 'appointment'
        });
      }

      // Check for appointment ID in context
      const appointmentId = memory.appointmentId;
      if (appointmentId) {
        memory.intent = {
          type: 'update_appointment',
          appointmentId: appointmentId,
          timestamp: new Date().toISOString()
        };
      } else {
        memory.intent = {
          type: 'update_appointment',
          timestamp: new Date().toISOString()
        };
      }
    }
  }
}

module.exports = new IntentDetectionExtension(); 