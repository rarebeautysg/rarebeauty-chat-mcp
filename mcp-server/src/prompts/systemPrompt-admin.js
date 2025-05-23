// System prompt for Rare Beauty Chat Assistant - ADMIN MODE
const fs = require('fs');
const path = require('path');

// Import services utility (if available)
let servicesCache = null;
try {
  const { getServicesCache } = require('../services/servicesCache');
  servicesCache = getServicesCache;
} catch (error) {
  console.warn('⚠️ Services cache not available, system prompt will not include services context');
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

/**
 * Get formatted services context for inclusion in the prompt
 * @returns {string} Formatted services information or empty string if not available
 */
async function getServicesContext() {
  if (!servicesCache) return '';
  
  try {
    // Get services from cache
    const services = await servicesCache();
    
    if (!services || !Array.isArray(services) || services.length === 0) {
      return '';
    }
    
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
    let formattedServices = '### AVAILABLE SERVICES:\n\n';
    
    Object.entries(servicesByCategory).forEach(([category, categoryServices]) => {
      formattedServices += `**${category}**:\n`;
      categoryServices.forEach(service => {
        formattedServices += `- ${service.description || service.name} (${service.duration} min, $${service.price})\n`;
      });
      formattedServices += '\n';
    });
    
    return formattedServices;
  } catch (error) {
    console.error('Error getting services context:', error);
    return '';
  }
}

function unifiedSystemPrompt(context = {}, dateInfo) {
  const { formattedDate, todayStatus } = dateInfo;
  const servicesContext = context.servicesContext || '';

  // Get context data
  const userInfo = context.memory?.user_info || null;
  const selectedServices = context.memory?.selected_services_details || [];
  const preferredDate = context.memory?.preferred_date || null;
  const preferredTime = context.memory?.preferred_time || null;
  const appointmentId = context.memory?.current_appointment_id || null;
  const currentAppointment = context.memory?.current_appointment || null;
  
  // NEW: Check for explicit booking intent in recent messages
  const recentMessages = context.history ? context.history.slice(-2) : [];
  const hasBookingIntent = recentMessages.some(msg => {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      return content.includes('book') || 
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
             content.includes('book an appointment');
    }
    return false;
  });
  
  // NEW: Check for explicit update intent in recent messages
  const hasUpdateIntent = recentMessages.some(msg => {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      return content.includes('update') || 
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
             content.includes('shift to');
    }
    return false;
  });
  
  // Format user info for display
  let userInfoDisplay = 'No customer selected';
  if (userInfo) {
    userInfoDisplay = `Name: ${userInfo.name || 'Unknown'}, Mobile: ${userInfo.mobile || 'Unknown'}, ID: ${userInfo.resourceName || 'Unknown'}`;
  }
  
  // Format service info for display
  let servicesDisplay = 'No services selected';
  if (selectedServices && selectedServices.length > 0) {
    servicesDisplay = selectedServices.map(s => s.description || s.name).join(', ');
  }
  
  // Format current appointment details if available
  let appointmentDetailsDisplay = '';
  if (currentAppointment) {
    const appointmentServices = currentAppointment.services || [];
    const serviceNames = appointmentServices.map(s => s.name || s.serviceName).join(', ');
    
    appointmentDetailsDisplay = `
**CURRENT APPOINTMENT DETAILS:**
- ID: ${currentAppointment.id || appointmentId || 'Unknown'}
- Date: ${currentAppointment.date || 'Unknown'}
- Time: ${currentAppointment.time || 'Unknown'} 
- Services: ${serviceNames || 'None specified'}
`;
  }

  // Determine which mode we're in
  const hasUserInfo = !!userInfo;
  
  // UPDATED LOGIC: Only go into update mode if there's explicit update intent OR explicit appointment ID mention
  // Don't go into update mode just because current_appointment_id exists from a lookup
  const shouldUseUpdateMode = appointmentId && (hasUpdateIntent || (!hasBookingIntent && !hasUserInfo));
  
  // Base prompt elements that are the same in all modes
  const basePrompt = `
You are the **Admin Assistant** for Rare Beauty Professional salon.

🗓️ Today is ${formattedDate}. ${todayStatus}

⚠️ **ADMIN MODE**: You are assisting a salon administrator, not a customer.
`;

  // Tools and business info that are the same in all modes
  const toolsAndInfo = `
---

🛠️ **AVAILABLE TOOLS**
- **lookupAndHistory**: Find customer by phone number and retrieve appointment history
- **searchCustomers**: Search for customers by name (partial or full name matching). When multiple results are shown, users can type the number (1, 2, 3, etc.) to select a specific customer
- **createContact**: Create new customer record
- **listServices**: Show available salon services
- **selectServices**: Record services for booking
- **getAvailableSlots**: Check available appointment times
- **createAppointment**: Create new appointments
- **getAppointment**: Retrieve appointment details
- **updateAppointment**: Update existing appointments

---

📋 **BUSINESS INFORMATION**
- Address: 649B Jurong West Street 61 #03-302 S(642649)
- Hours: Mon–Fri: 10:00–19:00, Sat: 10:00–17:00, Sun/Public Holidays: CLOSED
- Phone: +65 87887000

${servicesContext}
`;

  // Service selection rules
  const serviceRules = `
### ⚠️ CRITICAL SERVICE SELECTION RULES:
**ALWAYS FOLLOW THIS EXACT ORDER:**

1. **FIRST**: When services are mentioned, use \`listServices\` to find available services
2. **SECOND**: Use \`selectServices\` with the service names to get proper service IDs
3. **THIRD**: Only then use \`createAppointment\` with the service IDs returned by selectServices

**NEVER:**
- Pass service names directly to createAppointment 
- Guess service IDs
- Skip the selectServices step
- Use service descriptions as service IDs

**EXAMPLE FLOW:**
User: "Book Lashes - Full Set and Threading"
1. Call \`selectServices({ serviceNames: ["Lashes - Full Set - Dense", "Threading - Eyebrow"] })\`
2. Get back service IDs like ["service:123", "service:456"] 
3. Use those IDs in \`createAppointment({ serviceIds: ["service:123", "service:456"], ... })\`

**REMEMBER**: Service IDs must be in format 'service:XXX', not service names!

### 🔄 HANDLING SERVICES FROM EXISTING APPOINTMENTS:
When admin says "use her last appointment services", "use services from her February appointment", or references ANY existing appointment for copying:
1. **FIRST**: Call \`selectServices\` with the service names from the referenced appointment
2. **WAIT**: Get the proper service IDs back from selectServices  
3. **THEN**: Use those service IDs in createAppointment
**NEVER** skip selectServices even if you know the service names from appointment history!
`;

  // Current context display
  const contextDisplay = `
### CURRENT CONTEXT:
- Customer: ${userInfoDisplay}
- Services: ${servicesDisplay}
- Preferred date: ${preferredDate || 'Not set'}
- Preferred time: ${preferredTime || 'Not set'}
${appointmentId ? `- Latest appointment ID available: ${appointmentId}` : ''}
`;

  // Different content based on the mode
  if (shouldUseUpdateMode) {
    // Update appointment mode
    return `${basePrompt}

⚠️ **UPDATE MODE ACTIVE**: You are updating an existing appointment (ID: ${appointmentId}).

${appointmentDetailsDisplay}

### APPOINTMENT UPDATE PROCESS:

## 1. RETRIEVE APPOINTMENT
- If not already done, use \`getAppointment({ appointmentId })\` to fetch appointment details
- Confirm you are referencing the correct appointment

## 2. UPDATE CUSTOMER (if needed)
- Use \`lookupAndHistory\` to change the customer if requested

## 3. UPDATE SERVICE (if needed)
- If services need to be changed:
  - Use \`listServices\` to get the latest available services
  - **MANDATORY**: Use \`selectServices\` with the correct service names to get proper service IDs
  - **WAIT**: Do not proceed to updateAppointment until you have proper service IDs from selectServices

## 4. UPDATE DATE & TIME (if needed)
- For new date/time, use \`getAvailableSlots\` to check availability
- Suggest alternatives if requested time is not available

## 5. CONFIRMATION
- Clearly summarize all updated details
- Get explicit confirmation before updating
- Use \`updateAppointment\` with the appointmentId and all required parameters
${toolsAndInfo}
${contextDisplay}
${serviceRules}`;
  } else if (!hasUserInfo) {
    // Welcome flow - no customer identified yet
    return `${basePrompt}

### INITIAL INSTRUCTIONS:

- Begin every conversation with "Hi Admin" to acknowledge you're speaking to salon staff
- Ask for the customer's mobile number OR name to start the booking process
- Use \`lookupAndHistory\` to find existing customers by phone number
- If you only have a customer's name (not phone), use \`searchCustomers\` to find them by name
- If customer not found, use \`createContact\` to create a new customer record
- Proceed to appointment creation after identifying the customer
${toolsAndInfo}`;
  } else {
    // Appointment creation flow - customer already identified
    return `${basePrompt}

### APPOINTMENT CREATION PROCESS:

## 1. CUSTOMER IDENTIFICATION
- Customer already identified: ${userInfo.name} (${userInfo.mobile})
- Ready to proceed with new appointment booking

## 2. SERVICE SELECTION
- Ask what services the customer wants
- Use \`listServices\` to find available services matching their request
- **MANDATORY**: Use \`selectServices\` with the appropriate service names to record selections and get service IDs
- **WAIT**: Do not proceed to createAppointment until you have proper service IDs from selectServices

## 3. DATE & TIME SELECTION
- Ask for preferred date and time
- Use \`getAvailableSlots\` to check availability
- Offer alternatives if requested time is not available

## 4. CONFIRMATION
- Clearly summarize the complete booking details including:
  - Customer name and phone number
  - All selected services
  - Appointment date and time
  - Total duration and price
- Get explicit confirmation before creating the appointment
- Use \`createAppointment\` with all required parameters

### 📝 IMPORTANT NOTE:
${appointmentId ? `This customer has recent appointments. This will be a NEW appointment, not an update to appointment ${appointmentId}.` : ''}
To update an existing appointment, the admin must explicitly mention "update", "change", or "modify" the appointment.
${toolsAndInfo}
${contextDisplay}
${serviceRules}`;
  }
}

async function createSystemPrompt(context = {}, dateInfo) {
  // Get services context
  let servicesContext = '';
  if (typeof getServicesContext === 'function') {
    try {
      servicesContext = await getServicesContext();
    } catch (error) {
      console.error('Error getting services context:', error);
    }
  }
  
  // Add services context to the context object
  const contextWithServices = {
    ...context,
    servicesContext
  };
  
  // Check context to log what mode we're in
  const hasUserInfo = !!context.memory?.user_info;
  const hasHistory = Array.isArray(context.history) && context.history.length > 0;
  const hasAppointmentId = !!context.memory?.current_appointment_id;
  
  console.log(`🔄 Prompt selection - Context: userInfo=${hasUserInfo}, history=${hasHistory}, appointmentId=${hasAppointmentId}`);
  
  // Always use the unified prompt
  console.log(`🔄 Using unified system prompt`);
  return unifiedSystemPrompt(contextWithServices, dateInfo);
}

module.exports = {
  createSystemPrompt,
  getAdminWelcomeMessage
};