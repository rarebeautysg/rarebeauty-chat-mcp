// Import all tools
const lookupAndHistory = require('./lookupAndHistory');
const createContact = require('./createContact');
const getServiceInfo = require('./getServiceInfo');
const listServices = require('./listServices');
const bookAppointment = require('./bookAppointment');
const storeUser = require('./storeUser');
const selectServices = require('./selectServices');
const lookupUser = require('./lookupUser');
const getAvailableSlots = require('./getAvailableSlots');
// NOTE: scanServices has been removed

/**
 * Create an array of tools for a given context and session
 * @param {Object} context - The conversation context
 * @param {string} sessionId - Session ID
 * @returns {Array} Array of LangChain tools
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
  
  // selectServices tool
  try {
    if (selectServices.createSelectServicesTool) {
      tools.push(selectServices.createSelectServicesTool(context, sessionId));
    } else {
      console.warn('⚠️ SelectServicesTool could not be created with context');
    }
  } catch (error) {
    console.error('❌ Error creating selectServices tool:', error);
  }
  
  // Note: scanServices has been removed
  
  // Note: getCustomerAppointments is integrated with lookupAndHistory
  // and should not be registered as a separate tool
  
  console.log(`✅ Created tools array with ${tools.length} tools`);
  return tools;
}

module.exports = {
  createTools
}; 