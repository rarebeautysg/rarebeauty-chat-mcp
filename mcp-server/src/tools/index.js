// Import tool modules
const getServices = require('./getServices');
const getAvailableSlots = require('./getAvailableSlots');
const bookAppointment = require('./bookAppointment');
const lookupUser = require('./lookupUser');
const createContact = require('./createContact');
const storeUser = require('./storeUser');

// Get tool instances
const getServicesTool = getServices.getServicesTool;
const getAvailableSlotsTool = getAvailableSlots.getAvailableSlotsTool;
const bookAppointmentTool = new bookAppointment.BookAppointmentTool();
const lookupUserTool = new lookupUser.LookupUserTool();
const createContactTool = new createContact.CreateContactTool();
const storeUserTool = storeUser.storeUserTool;

// Export the tool instances
module.exports = {
  lookupUserTool,
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
  createContactTool,
  storeUserTool
}; 