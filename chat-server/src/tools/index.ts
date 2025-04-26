import { getServicesTool, GetServicesTool } from './getServices';
import { getAvailableSlotsTool, GetAvailableSlotsTool } from './getAvailableSlots';
import { BookAppointmentTool } from './bookAppointment';
import { LookupUserTool } from './lookupUser';
import { CreateContactTool } from './createContact';

// Create instances of tools that need it
const bookAppointmentTool = new BookAppointmentTool();
const lookupUserTool = new LookupUserTool();
const createContactTool = new CreateContactTool();

// Export the tool classes
export { 
  GetServicesTool,
  GetAvailableSlotsTool,
  BookAppointmentTool,
  LookupUserTool,
  CreateContactTool
};

// Export the tool instances
export {
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointmentTool as bookAppointmentTool,
  lookupUserTool as lookupUserTool,
  createContactTool as createContactTool
};

// Export all tools as an array for easy import
export const AppointmentTools = [
  lookupUserTool,
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
  createContactTool
]; 