const { StructuredTool } = require("@langchain/core/tools");
const axios = require('axios');

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

// Function to fetch services from SOHO GraphQL API
async function fetchServicesFromSOHO() {
  console.log('🔄 Fetching services from SOHO GraphQL API');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    throw new Error('Missing authentication token for SOHO API');
  }
  
  const query = {
    query: `
      {
        services {
          id,
          service,
          duration,
          price,
          followUp,
          count,
          enabled
        }
      }
    `
  };
  
  try {
    const response = await axios.post(apiUrl, query, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`GraphQL API request failed with status ${response.status}`);
    }
    
    const result = response.data;
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }
    
    if (!result.data || !result.data.services || !Array.isArray(result.data.services)) {
      throw new Error('Invalid response format from GraphQL API');
    }
    
    console.log(`✅ Successfully fetched ${result.data.services.length} services from SOHO API`);
    
    return result.data.services;
  } catch (error) {
    console.error('❌ Error fetching services from SOHO API:', error);
    throw error;
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
      s.name.toLowerCase() === serviceName.toLowerCase()
    );
    
    if (!service) {
      // Try partial match
      service = services.find(s => 
        s.name.toLowerCase().includes(serviceName.toLowerCase())
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
  fetchServicesFromSOHO,
  getServiceById,
  getServiceByName,
  getServiceDuration
}; 