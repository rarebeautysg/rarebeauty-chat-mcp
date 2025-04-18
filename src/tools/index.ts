import { getServicesTool, GetServicesTool } from './getServices';
import { getAvailableSlotsTool, GetAvailableSlotsTool } from './getAvailableSlots';
import { BookAppointmentTool } from './bookAppointment';
import { LookupUserTool } from './lookupUser';

// Create instances of tools that need it
const bookAppointmentTool = new BookAppointmentTool();
const lookupUserTool = new LookupUserTool();

// Export the tool classes
export { 
  GetServicesTool,
  GetAvailableSlotsTool,
  BookAppointmentTool,
  LookupUserTool
};

// Export the tool instances
export {
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointmentTool as bookAppointmentTool,
  lookupUserTool as lookupUserTool
};

// Export all tools as an array for easy import
export const GoogleTools = [
  lookupUserTool,
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointmentTool,
]; 