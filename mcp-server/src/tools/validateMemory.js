/**
 * Tool to validate memory contents before updating an appointment
 */
const { StructuredTool } = require("@langchain/core/tools");
const { getAllFormattedServices } = require('./listServices');

/**
 * Create a validateMemory tool instance
 * @param {Object} context - The MCP context
 * @param {string} sessionId - The session ID
 * @returns {Object} - The tool instance
 */
function createValidateMemoryTool(context, sessionId) {
  return {
    name: "validateMemory",
    description: "Ensure selected services in memory are valid before updating an appointment.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    _call: async function (args) {
      console.log(`🧠 Validating memory for session: ${sessionId}`);
      
      if (!context || !context.memory) {
        return {
          isValid: false,
          message: "Context or memory not available."
        };
      }
      
      const services = context.memory.selected_services_details;
      
      if (!Array.isArray(services) || services.length === 0) {
        console.log("⚠️ No services found in memory");
        return {
          isValid: false,
          message: "No services found in memory. Please call `selectServices` to populate memory."
        };
      }
      
      // Load all available services for validation
      const allServices = await getAllFormattedServices();
      
      const invalid = [];
      for (const service of services) {
        if (!service.id || !service.name) {
          invalid.push(service);
          continue;
        }
        
        // Find the service in the available services
        const matchedService = allServices.find(s => s.id === service.id);
        if (!matchedService) {
          invalid.push(service);
          console.log(`⚠️ Invalid service in memory: ${service.name} (${service.id})`);
        }
      }
      
      if (invalid.length > 0) {
        return {
          isValid: false,
          message: `Invalid service entries: ${invalid.map(s => s.name || '[Unnamed]').join(', ')}`
        };
      }
      
      console.log(`✅ Memory validation passed with ${services.length} service(s): ${services.map(s => s.name).join(', ')}`);
      return {
        isValid: true,
        message: `Memory is valid with ${services.length} service(s): ${services.map(s => s.name).join(', ')}`
      };
    }
  };
}

module.exports = {
  createValidateMemoryTool
}; 