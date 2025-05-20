// Import required tools
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

// Import the specific tools we need
const { createLookupUserTool } = require('./lookupUser');
const { createGetCustomerAppointmentsTool } = require('./getCustomerAppointments');

/**
 * A class that combines lookupUser and getCustomerAppointments
 */
class LookupAndHistoryTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "lookupUser";  // Keep the same name as lookupUser to be a drop-in replacement
    this.description = "Find a user by Singapore phone number and automatically retrieve their appointment history";
    this.schema = z.object({
      phoneNumber: z.string().describe("Singapore mobile number to lookup")
    });
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
    
    // Create the individual tools for internal use
    this.lookupUserTool = createLookupUserTool(context, sessionId);
    this.getCustomerAppointmentsTool = createGetCustomerAppointmentsTool(context, sessionId);
  }

  async _call(input) {
    console.log(`🔄 LookupAndHistoryTool called with phone: ${input.phoneNumber}`);
    
    try {
      // Step 1: Look up the user
      console.log("🔍 Looking up customer details...");
      const lookupResult = await this.lookupUserTool._call(input);
      const customer = JSON.parse(lookupResult);
      
      // If no user found, return early
      if (!customer.resourceName) {
        console.log("❌ No customer found with this phone number");
        return lookupResult; // Return original result
      }
      
      // Step 2: Get recent appointments if user found
      console.log(`✅ Customer found: ${customer.name}, fetching appointments...`);
      const appointmentsResult = await this.getCustomerAppointmentsTool._call({
        resourceName: customer.resourceName,
        limit: 5 // Get last 5 appointments
      });
      
      const appointmentsData = JSON.parse(appointmentsResult);
      const appointments = appointmentsData.appointments || [];
      
      // Step 3: Store latest appointment details in memory
      if (appointments.length > 0) {
        const latestAppointment = appointments[0]; // First is most recent
        
        if (this.context && this.context.memory) {
          // Store appointment ID for updates
          this.context.memory.current_appointment_id = latestAppointment.id;
          
          // Store complete appointment details in memory
          this.context.memory.current_appointment = latestAppointment;
          
          // Also keep a simplified version for backward compatibility
          this.context.memory.last_appointment = {
            id: latestAppointment.id,
            date: latestAppointment.date,
            time: latestAppointment.time,
            services: latestAppointment.services || []
          };
          
          console.log(`✅ Stored complete appointment details in memory: ${latestAppointment.id}`);
          
          // Log service information but DON'T select them automatically
          if (latestAppointment.services && Array.isArray(latestAppointment.services)) {
            console.log(`ℹ️ Appointment has ${latestAppointment.services.length} services (available in memory.current_appointment)`);
          }
        }
      }
      
      // Combine the results
      const result = {
        ...customer,
        appointments: appointments,
        appointmentCount: appointments.length,
        cancelCount: appointmentsData.cancelCount || 0,
        lastAppointmentId: appointments.length > 0 ? appointments[0].id : null
      };
      
      console.log(`✅ Successfully retrieved customer and ${appointments.length} appointments`);
      return JSON.stringify(result);
      
    } catch (error) {
      console.error("❌ Error in LookupAndHistoryTool:", error);
      return JSON.stringify({
        error: "Failed to lookup user and history",
        message: error.message || String(error)
      });
    }
  }
}

/**
 * Creates a LookupAndHistoryTool instance
 * @param {Object} context - The context for the session
 * @param {string} sessionId - The session ID
 * @returns {LookupAndHistoryTool} An instance of the tool
 */
function createLookupAndHistoryTool(context, sessionId) {
  return new LookupAndHistoryTool(context, sessionId);
}

// Export the factory function
module.exports = {
  createLookupAndHistoryTool
}; 