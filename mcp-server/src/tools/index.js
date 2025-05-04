// Import tool modules
const listServices = require('./listServices');
const getServiceInfo = require('./getServiceInfo');
const getAvailableSlots = require('./getAvailableSlots');
const bookAppointment = require('./bookAppointment');
const lookupUser = require('./lookupUser');
const createContact = require('./createContact');
const storeUser = require('./storeUser');
const suggestServices = require('./suggestServices');
const scanServices = require('./scanServices');
const getCustomerAppointments = require('./getCustomerAppointments');
const lookupAndHistory = require('./lookupAndHistory');

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
  
  // Use lookupAndHistory tool instead of lookupUser
  try {
    if (lookupAndHistory.createLookupAndHistoryTool) {
      tools.push(lookupAndHistory.createLookupAndHistoryTool(context, sessionId));
      console.log('✅ Using combined lookupAndHistory tool with auto-appointment retrieval');
    } else {
      console.warn('⚠️ LookupAndHistoryTool not available, falling back to standard lookupUser');
      if (lookupUser.LookupUserTool) {
        tools.push(new lookupUser.LookupUserTool(context, sessionId));
      } else if (lookupUser.createLookupUserTool) {
        tools.push(lookupUser.createLookupUserTool(context, sessionId));
      } else {
        console.warn('⚠️ LookupUserTool could not be created with context');
      }
    }
  } catch (error) {
    console.error('❌ Error creating lookupAndHistory tool:', error);
    console.warn('⚠️ Falling back to standard lookupUser');
    try {
      if (lookupUser.LookupUserTool) {
        tools.push(new lookupUser.LookupUserTool(context, sessionId));
      } else if (lookupUser.createLookupUserTool) {
        tools.push(lookupUser.createLookupUserTool(context, sessionId));
      }
    } catch (fallbackError) {
      console.error('❌ Error creating fallback lookupUser tool:', fallbackError);
    }
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
  
  // listServices tool
  try {
    if (listServices.ListServicesTool) {
      tools.push(new listServices.ListServicesTool(context, sessionId));
    } else {
      console.warn('⚠️ ListServicesTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating listServices tool:', error);
  }
  
  // getServiceInfo tool
  try {
    if (getServiceInfo.GetServiceInfoTool) {
      tools.push(new getServiceInfo.GetServiceInfoTool(context, sessionId));
    } else {
      console.warn('⚠️ GetServiceInfoTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating getServiceInfo tool:', error);
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
  
  // suggestServices tool
  try {
    if (suggestServices.createSuggestServicesTool) {
      tools.push(suggestServices.createSuggestServicesTool(context, sessionId));
    } else {
      console.warn('⚠️ SuggestServicesTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating suggestServices tool:', error);
  }
  
  // scanServices tool
  try {
    if (scanServices.createScanServicesTool) {
      tools.push(scanServices.createScanServicesTool(context, sessionId));
    } else {
      console.warn('⚠️ ScanServicesTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating scanServices tool:', error);
  }
  
  // Do NOT register getCustomerAppointments as a separate tool anymore
  // since it's now integrated with lookupUser
  // This prevents the LLM from calling it separately and ensures
  // appointment history is always retrieved automatically
  console.log(`✅ Created tools array with ${tools.length} tools`);
  return tools;
}

module.exports = {
  createTools
}; 