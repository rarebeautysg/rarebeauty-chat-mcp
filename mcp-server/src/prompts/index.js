// Export system prompt creators from one centralized file
const { createSystemPrompt: createAdminSystemPrompt, getAdminWelcomeMessage } = require('./admin');
const { createSystemPrompt: createCustomerSystemPrompt } = require('./systemPrompt-customer');

// Function to extract and store appointment IDs from user input
function extractAndStoreAppointmentId(context, userInput) {
  if (!context || !context.memory || !userInput) return;
  
  // Pattern to match appointment IDs in various formats
  const appointmentIdRegex = /\b(appt|appointment|id|#):?[-\s]?([a-zA-Z0-9]{6,})\b/gi;
  const matches = [...userInput.matchAll(appointmentIdRegex)];
  
  if (matches.length > 0) {
    // Take the first match
    const appointmentId = matches[0][2];
    const fullMatch = matches[0][0];
    
    if (appointmentId && appointmentId.length >= 6) {
      // Format consistently with 'appt:' prefix if needed
      const formattedId = appointmentId.startsWith('appt:') ? appointmentId : `appt:${appointmentId}`;
      
      // Store in memory
      context.memory.current_appointment_id = formattedId;
      console.log(`📋 Extracted and stored appointment ID ${formattedId} in memory.current_appointment_id from user input: "${fullMatch}"`);
      return formattedId;
    }
  }
  return null;
}

module.exports = {
  createAdminSystemPrompt,
  createCustomerSystemPrompt,
  extractAndStoreAppointmentId,
  getAdminWelcomeMessage
}; 