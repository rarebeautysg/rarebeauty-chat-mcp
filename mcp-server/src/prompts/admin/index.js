/**
 * Admin prompts orchestrator - determines which focused prompt to use
 */

const { createWelcomePrompt } = require('./welcome');
const { createAppointmentPrompt } = require('./create-appointment');
const { createUpdatePrompt } = require('./update-appointment');
const { createCancelPrompt } = require('./cancel-appointment');

/**
 * Detect user intent from recent messages
 */
function detectIntent(context = {}) {
  const recentMessages = context.history ? context.history.slice(-3) : [];
  
  let hasBookingIntent = false;
  let hasUpdateIntent = false;
  let hasCancelIntent = false;
  
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      
      // Check for booking intent
      if (content.includes('book') || 
          content.includes('schedule') || 
          content.includes('new appointment') ||
          content.includes('make an appointment') ||
          content.includes('create appointment') ||
          content.includes('appointment for') ||
          content.includes('book for') ||
          content.includes('schedule for') ||
          content.includes('set up') ||
          content.includes('arrange') ||
          content.includes('want to book') ||
          content.includes('would like to book') ||
          content.includes('need to book') ||
          content.includes('book an appointment')) {
        hasBookingIntent = true;
      }
      
      // Check for update intent
      if (content.includes('update') || 
          content.includes('change') || 
          content.includes('modify') || 
          content.includes('reschedule') ||
          content.includes('move the appointment') ||
          content.includes('update the appointment') ||
          content.includes('change the appointment') ||
          content.includes('edit') ||
          content.includes('alter') ||
          content.includes('switch') ||
          content.includes('move to') ||
          content.includes('push to') ||
          content.includes('shift to')) {
        hasUpdateIntent = true;
      }
      
      // Check for cancel intent
      if (content.includes('cancel') || 
          content.includes('remove') ||
          content.includes('delete') ||
          content.includes('cancel appointment') ||
          content.includes('cancel the appointment') ||
          content.includes('remove appointment') ||
          content.includes('delete appointment')) {
        hasCancelIntent = true;
      }
    }
  }
  
  return {
    hasBookingIntent,
    hasUpdateIntent,
    hasCancelIntent
  };
}

/**
 * Clear appointment context when new booking intent is detected
 */
function clearAppointmentContextForNewBooking(context = {}) {
  if (!context.memory) return;
  
  const appointmentId = context.memory.current_appointment_id;
  
  if (appointmentId) {
    console.log(`🧹 Clearing appointment context due to new booking intent (was: ${appointmentId})`);
    
    // Clear appointment-specific data
    delete context.memory.current_appointment_id;
    delete context.memory.current_appointment;
    delete context.memory.last_appointment;
    
    // Keep user info but clear appointment-specific context
    // This allows booking for the same customer without the appointment baggage
    console.log(`✅ Cleared appointment context while preserving customer info`);
  }
}

/**
 * Determine which prompt to use based on context and intent
 */
function determinePromptType(context = {}) {
  const hasUserInfo = !!context.memory?.user_info;
  const appointmentId = context.memory?.current_appointment_id;
  const intent = detectIntent(context);
  
  console.log(`🔄 Intent detection - Booking: ${intent.hasBookingIntent}, Update: ${intent.hasUpdateIntent}, Cancel: ${intent.hasCancelIntent}`);
  console.log(`🔄 Context - UserInfo: ${hasUserInfo}, AppointmentId: ${!!appointmentId}`);
  
  // Priority order for intent detection:
  
  // 1. Cancel intent - highest priority
  if (intent.hasCancelIntent) {
    console.log(`🔄 Using CANCEL prompt due to cancel intent`);
    return 'cancel';
  }
  
  // 2. Booking intent - clear appointment context and use create prompt
  if (intent.hasBookingIntent) {
    console.log(`🔄 Using CREATE prompt due to explicit booking intent`);
    // Clear any existing appointment context for new booking
    clearAppointmentContextForNewBooking(context);
    return 'create';
  }
  
  // 3. Update intent - only if we have an appointment ID
  if (intent.hasUpdateIntent && appointmentId) {
    console.log(`🔄 Using UPDATE prompt due to update intent and appointment ID`);
    return 'update';
  }
  
  // 4. Default logic based on context
  if (!hasUserInfo) {
    console.log(`🔄 Using WELCOME prompt - no customer identified`);
    return 'welcome';
  }
  
  // 5. If we have user info but no clear intent, default to create
  console.log(`🔄 Using CREATE prompt - customer identified, no specific intent`);
  return 'create';
}

/**
 * Create the appropriate system prompt based on context and intent
 */
async function createSystemPrompt(context = {}, dateInfo) {
  // Get services context (copied from original file)
  let servicesContext = '';
  try {
    const { getServicesCache } = require('../../services/servicesCache');
    if (getServicesCache) {
      const services = await getServicesCache();
      
      if (services && Array.isArray(services) && services.length > 0) {
        // Group services by category
        const servicesByCategory = {};
        services.forEach(service => {
          const category = service.category || 'Other';
          if (!servicesByCategory[category]) {
            servicesByCategory[category] = [];
          }
          servicesByCategory[category].push(service);
        });
        
        // Format as simple text list by category
        servicesContext = '### AVAILABLE SERVICES:\n\n';
        
        Object.entries(servicesByCategory).forEach(([category, categoryServices]) => {
          servicesContext += `**${category}**:\n`;
          categoryServices.forEach(service => {
            servicesContext += `- ${service.description || service.name} (${service.duration} min, $${service.price})\n`;
          });
          servicesContext += '\n';
        });
      }
    }
  } catch (error) {
    console.warn('⚠️ Services cache not available for admin prompt');
  }
  
  // Add services context to the context object
  const contextWithServices = {
    ...context,
    servicesContext
  };
  
  // Determine which prompt to use
  const promptType = determinePromptType(context);
  
  // Create the appropriate prompt
  switch (promptType) {
    case 'welcome':
      return createWelcomePrompt(contextWithServices, dateInfo);
    case 'create':
      return createAppointmentPrompt(contextWithServices, dateInfo);
    case 'update':
      return createUpdatePrompt(contextWithServices, dateInfo);
    case 'cancel':
      return createCancelPrompt(contextWithServices, dateInfo);
    default:
      console.warn(`⚠️ Unknown prompt type: ${promptType}, defaulting to welcome`);
      return createWelcomePrompt(contextWithServices, dateInfo);
  }
}

/**
 * Get the appropriate welcome message for the admin based on context
 * @param {Object} context - The MCP context
 * @param {Object} dateInfo - Date information 
 * @returns {string} The welcome message to display
 */
function getAdminWelcomeMessage(context = {}, dateInfo) {
  const userInfo = context.memory?.user_info || null;
  const hasAppointmentId = !!context.memory?.current_appointment_id;
  
  if (hasAppointmentId) {
    return "Welcome back, Admin. I have an appointment loaded. How can I help you update it?";
  } else if (userInfo) {
    return `Welcome, Admin. I have ${userInfo.name} loaded. How can I assist you with this customer?`;
  } else {
    return "Welcome, Admin. Can I have the customer's mobile number or name so I can better help you?";
  }
}

module.exports = {
  createSystemPrompt,
  determinePromptType,
  detectIntent,
  getAdminWelcomeMessage
}; 