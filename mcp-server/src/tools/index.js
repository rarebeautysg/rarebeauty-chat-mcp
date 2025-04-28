// Import tool modules
const getServices = require('./getServices');
const getAvailableSlots = require('./getAvailableSlots');
const bookAppointment = require('./bookAppointment');
const lookupUser = require('./lookupUser');
const createContact = require('./createContact');
const storeUser = require('./storeUser');

/**
 * Creates tool instances with context for a given session
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {Array} - Array of tool instances
 */
function createTools(context, sessionId) {
  const tools = [];
  
  // Try to create each tool with context and session ID
  // Use try-catch to handle cases where some tools don't yet have factory functions
  
  // lookupUser tool
  try {
    if (lookupUser.LookupUserTool) {
      tools.push(new lookupUser.LookupUserTool(context, sessionId));
    } else if (lookupUser.createLookupUserTool) {
      tools.push(lookupUser.createLookupUserTool(context, sessionId));
    } else {
      console.warn('⚠️ LookupUserTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating lookupUser tool:', error);
  }
  
  // createContact tool
  try {
    if (createContact.CreateContactTool) {
      tools.push(new createContact.CreateContactTool(context, sessionId));
    } else if (createContact.createCreateContactTool) {
      tools.push(createContact.createCreateContactTool(context, sessionId));
    } else {
      console.warn('⚠️ CreateContactTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating createContact tool:', error);
  }
  
  // bookAppointment tool
  try {
    if (bookAppointment.createBookAppointmentTool) {
      tools.push(bookAppointment.createBookAppointmentTool(context, sessionId));
    } else if (bookAppointment.BookAppointmentTool) {
      tools.push(new bookAppointment.BookAppointmentTool(context, sessionId));
    } else {
      console.warn('⚠️ BookAppointmentTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating bookAppointment tool:', error);
  }
  
  // getServices tool
  try {
    if (getServices.createGetServicesTool) {
      tools.push(getServices.createGetServicesTool(context, sessionId));
    } else {
      console.warn('⚠️ GetServicesTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating getServices tool:', error);
  }
  
  // getAvailableSlots tool
  try {
    if (getAvailableSlots.createGetAvailableSlotsTool) {
      tools.push(getAvailableSlots.createGetAvailableSlotsTool(context, sessionId));
    } else {
      console.warn('⚠️ GetAvailableSlotsTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating getAvailableSlots tool:', error);
  }
  
  // storeUser tool
  try {
    if (storeUser.createStoreUserTool) {
      tools.push(storeUser.createStoreUserTool(context, sessionId));
    } else {
      console.warn('⚠️ StoreUserTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating storeUser tool:', error);
  }
  
  return tools;
}

module.exports = {
  createTools
}; 