import { getServicesTool } from './getServices';
import { getAvailableSlotsTool } from './getAvailableSlots';
import { BookAppointmentTool } from './bookAppointment';
import { LookupUserTool } from './lookupUser';

// Create instances of tools that need it
const bookAppointment = new BookAppointmentTool();
const lookupUser = new LookupUserTool();

// Export all tools as an array for easy import
export const GoogleTools = [
  lookupUser,
  getServicesTool,
  getAvailableSlotsTool,
  bookAppointment,
]; 