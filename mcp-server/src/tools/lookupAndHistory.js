// Import LangChain Runnable and required tools
const { RunnableSequence } = require("@langchain/core/runnables");
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

// Import the specific tools we need to chain
const { createLookupUserTool } = require('./lookupUser');
const { createGetCustomerAppointmentsTool } = require('./getCustomerAppointments');

// Disable the linter rule for private/protected properties in exported classes
// This is required because LangChain's StructuredTool class has properties with leading underscores
// eslint-disable-next-line @typescript-eslint/naming-convention
// eslint-disable-next-line typescript/no-unsafe-declaration-merging
// eslint-disable-next-line typescript/class-literal-property-style

/**
 * A class that combines lookupUser and getCustomerAppointments
 * Note: This class is not exported directly to avoid linter errors
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
    
    // Check if we're in admin mode
    this.isAdmin = context?.identity?.role === "admin" || context?.identity?.is_admin === true;
    console.log(`🔐 LookupAndHistoryTool initialized with admin status: ${this.isAdmin ? 'YES' : 'NO'}`);
    
    // Create the individual tools for internal use
    this.lookupUserTool = createLookupUserTool(context, sessionId);
    this.getCustomerAppointmentsTool = createGetCustomerAppointmentsTool(context, sessionId);
    
    // Create the runnable sequence
    this.sequence = RunnableSequence.from([
      // Step 1: Call lookupUser with the phone number
      async (input) => {
        console.log("🔄 LookupAndHistoryTool: First calling lookupUser...");
        const lookupResult = await this.lookupUserTool._call(input);
        // Parse the JSON result
        try {
          const parsed = JSON.parse(lookupResult);
          // Check if we found a user
          if (parsed.resourceName) {
            console.log(`✅ LookupAndHistoryTool: User found with resourceName ${parsed.resourceName}`);
            return { 
              lookupResult: parsed,
              resourceName: parsed.resourceName
            };
          } else {
            console.log("❌ LookupAndHistoryTool: No user found");
            // If no user found, return the lookup result directly
            return { 
              lookupResult: parsed,
              resourceName: null
            };
          }
        } catch (error) {
          console.error("❌ LookupAndHistoryTool: Error parsing lookupUser result", error);
          throw new Error(`Failed to parse lookupUser result: ${error.message}`);
        }
      },
      
      // Step 2: If a user was found, fetch their appointment history
      async (input) => {
        // If no resourceName, just return the lookup result
        if (!input.resourceName) {
          console.log("ℹ️ LookupAndHistoryTool: No resourceName, skipping appointment lookup");
          return input.lookupResult;
        }
        
        console.log(`🔄 LookupAndHistoryTool: Now fetching appointments for ${input.resourceName}...`);
        try {
          // Call getCustomerAppointments with the resourceName
          const appointmentsResult = await this.getCustomerAppointmentsTool._call({
            resourceName: input.resourceName,
            limit: 5
          });
          
          // Parse the appointments JSON
          const appointments = JSON.parse(appointmentsResult);
          
          // Obfuscate service names and IDs to prevent scanServices from detecting them
          if (appointments.appointments && Array.isArray(appointments.appointments)) {
            appointments.appointments.forEach(appointment => {
              // Replace service name with obfuscated version that scanServices won't match
              if (appointment.serviceName) {
                // Save original for display
                appointment.displayServiceName = appointment.serviceName;
                
                // Obfuscate the service name to prevent detection
                // Replace all spaces, add special characters that aren't typical in service names
                appointment.serviceName = "↯hist↯" + appointment.serviceName.replace(/\s+/g, '•').replace(/-/g, '→');
              }
              
              // If there's a serviceId field, obfuscate it too
              if (appointment.serviceId) {
                appointment.displayServiceId = appointment.serviceId;
                appointment.serviceId = "hist_" + appointment.serviceId.replace(/:/g, '_');
              }
            });
          }
          
          // Add flags to indicate these are historical services
          appointments.areHistoricalServices = true;
          appointments.doNotAddToServiceSelections = true;
          
          // Combine the result
          const combinedResult = {
            ...input.lookupResult,
            appointments: appointments.appointments || [],
            appointment_message: appointments.message || "No appointment data available",
            cancelCount: appointments.cancelCount || 0,
            areHistoricalServices: true,
            doNotAddToServiceSelections: true
          };
          
          console.log(`✅ LookupAndHistoryTool: Successfully combined user and appointment data`);
          return combinedResult;
        } catch (error) {
          console.error("❌ LookupAndHistoryTool: Error fetching appointments", error);
          // Still return the user data even if appointments failed
          return {
            ...input.lookupResult,
            appointments: [],
            appointment_message: `Error retrieving appointments: ${error.message}`,
            cancelCount: 0
          };
        }
      }
    ]);
  }

  async _call(input) {
    console.log(`🔄 LookupAndHistoryTool called with phone: ${input.phoneNumber}`);
    try {
      // Run the sequence
      const result = await this.sequence.invoke(input);
      
      // Add admin context flag to the result
      if (this.isAdmin) {
        result.isAdminView = true;
        result.forCustomer = false;
        console.log(`🔐 Adding admin context flags to lookupUser result`);
      }
      
      // Return as JSON string to match the original tool's behavior
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
 * This factory function is the recommended way to create tool instances
 * @param {Object} context - The context for the session
 * @param {string} sessionId - The session ID
 * @returns {LookupAndHistoryTool} An instance of the tool
 */
function createLookupAndHistoryTool(context, sessionId) {
  return new LookupAndHistoryTool(context, sessionId);
}

// CommonJS exports - only export the factory function
module.exports = {
  createLookupAndHistoryTool
}; 