const { StructuredTool } = require("@langchain/core/tools");
const { fetchServicesFromSOHO } = require('./listServices');

// Tool to get information about a specific service
class GetServiceInfoTool extends StructuredTool {
  constructor(context, sessionId) {
    super(context, sessionId);
    this.name = 'getServiceInfo';
    this.description = 'Get detailed information about a specific service by ID.';
  }

  async _call({ serviceId }) {
    try {
      if (!serviceId) {
        throw new Error('Service ID is required');
      }
      const service = await getServiceById(serviceId);
      if (!service) {
        throw new Error(`Service with ID ${serviceId} not found.`);
      }
      return service;
    } catch (error) {
      console.error('❌ Error retrieving service information:', error);
      throw error;
    }
  }
}

// Get a specific service by ID
async function getServiceById(serviceId) {
  try {
    const services = await fetchServicesFromSOHO();
    const service = services.find(s => s.id === serviceId);
    
    if (!service) {
      console.log(`❓ Service with ID ${serviceId} not found`);
      return null;
    }
    
    return service;
  } catch (error) {
    console.error(`❌ Error getting service by ID ${serviceId}:`, error);
    return null;
  }
}

// Find a service by name (exact or partial match)
async function getServiceByName(serviceName) {
  try {
    const services = await fetchServicesFromSOHO();
    
    // Try exact match first (case-insensitive)
    let service = services.find(s => 
      s.service.toLowerCase() === serviceName.toLowerCase()
    );
    
    if (!service) {
      // Try partial match
      service = services.find(s => 
        s.service.toLowerCase().includes(serviceName.toLowerCase())
      );
    }
    
    if (!service) {
      console.log(`❓ Service with name "${serviceName}" not found`);
      return null;
    }
    
    return service;
  } catch (error) {
    console.error(`❌ Error getting service by name "${serviceName}":`, error);
    return null;
  }
}

// Get service duration by ID
async function getServiceDuration(serviceId) {
  const service = await getServiceById(serviceId);
  return service?.duration || 60; // Default to 60 minutes if service not found
}

module.exports = {
  GetServiceInfoTool,
  getServiceById,
  getServiceByName,
  getServiceDuration
}; 