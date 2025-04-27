const { Tool } = require("@langchain/core/tools");
const axios = require('axios');

// Service cache for real API
let servicesCache = [];
let lastFetched = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Processed services cache
let processedServicesCache = [];
let processedLastFetched = 0;

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

// Function to get services with caching
async function getServices(forceRefresh = false) {
  const now = Date.now();
  
  // Force refresh if requested
  if (forceRefresh) {
    console.log('🔄 Force refreshing services cache');
    servicesCache = [];
  }
  
  // Check if cache is valid
  if (servicesCache.length === 0 || now - lastFetched > CACHE_DURATION) {
    try {
      servicesCache = getActiveServices(await fetchServicesFromSOHO());
      lastFetched = now;
      // Reset processed cache when raw cache is updated
      processedServicesCache = [];
    } catch (error) {
      console.error('❌ Error updating services cache:', error);
      
      // If cache is empty, throw error; otherwise, use stale cache
      if (servicesCache.length === 0) {
        throw error;
      }
      
      console.log('⚠️ Using stale services cache due to fetch error');
    }
  } else {
    console.log('📝 Using cached services data');
  }
  
  return servicesCache;
}

// Function to filter active services
const getActiveServices = (services) => {
  return services.filter((service) => 
    service.enabled !== false && 
    !service.service.startsWith("(2021)") && 
    !service.service.startsWith("Old ")
  );
};

// Function to categorize services
const categorizeServices = (services) => {
  const categories = {
    "Lashes": [],
    "Facial": [],
    "Threading": [],
    "Waxing": [],
    "Skin": []
  };

  services.forEach(service => {
    // Format the service data for the response
    const serviceInfo = {
      name: service.service,
      price: typeof service.price === 'number' ? service.price : parseFloat(service.price),
      id: service.id,
    };
    
    if (service.service.startsWith("Lashes")) {
      categories["Lashes"].push(serviceInfo);
    } else if (service.service.startsWith("Facial")) {
      categories["Facial"].push(serviceInfo);
    } else if (service.service.startsWith("Threading")) {
      categories["Threading"].push(serviceInfo);
    } else if (service.service.startsWith("Waxing")) {
      categories["Waxing"].push(serviceInfo);
    } else if (service.service.startsWith("Skin")) {
      categories["Skin"].push(serviceInfo);
    }
  });

  // Sort each category alphabetically by service name
  Object.keys(categories).forEach(category => {
    categories[category] = categories[category].sort((a, b) => 
      a.name.localeCompare(b.name)
    );
  });

  return categories;
};

// Get all formatted services - used by tools and other components
async function getAllFormattedServices(forceRefresh = false) {
  const now = Date.now();
  
  // Check if we need to refresh the processed cache
  if (forceRefresh || processedServicesCache.length === 0 || now - processedLastFetched > CACHE_DURATION) {
    console.log('🔄 Building processed services cache');
    
    try {
      // Get raw services (may use cache internally)
      const rawServices = await getServices(forceRefresh);
      const filteredServices = getActiveServices(rawServices);
      
      // Categorize services
      const categorizedServices = categorizeServices(filteredServices);
      
      // Flatten into array with category information
      const result = [];
      
      Object.entries(categorizedServices).forEach(([category, services]) => {
        services.forEach(service => {
          result.push({
            id: service.id,
            name: service.name,
            category,
            price: service.price,
            duration: filteredServices.find(s => s.id === service.id)?.duration || 60,
            followUp: filteredServices.find(s => s.id === service.id)?.followUp
          });
        });
      });
      
      // Update processed cache
      processedServicesCache = result;
      processedLastFetched = now;
      
      return result;
    } catch (error) {
      console.error('❌ Error building processed services cache:', error);
      
      // If we have a stale cache, use it rather than failing
      if (processedServicesCache.length > 0) {
        console.log('⚠️ Using stale processed services cache');
        return processedServicesCache;
      }
      
      // Generate minimal fallback data
      console.log('⚠️ Generating minimal fallback data - API unavailable');
      return [];
    }
  } else {
    console.log('📝 Using cached processed services data');
    return processedServicesCache;
  }
}

// Get a specific service by ID
async function getServiceById(serviceId) {
  try {
    const services = await getAllFormattedServices();
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
    const services = await getAllFormattedServices();
    
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

class GetServicesTool extends Tool {
  constructor() {
    super();
    this.name = "getServices";
    this.description = "Get a list of all available beauty services with prices";
  }

  async _call(args) {
    console.log('📋 GetServices tool called', args);
    
    try {
      // Get services
      const allServices = await getAllFormattedServices();
      
      // Optional filtering by category
      const category = args?.category;
      
      if (category) {
        const filteredServices = allServices.filter(
          service => service.category.toLowerCase() === category.toLowerCase()
        );
        
        if (filteredServices.length === 0) {
          return JSON.stringify({
            success: false,
            message: `No services found for category "${category}". Available categories are: Lashes, Facial, Threading, Waxing, and Skin.`
          });
        }
        
        return JSON.stringify({
          success: true,
          services: filteredServices
        });
      }
      
      // Group by category for a better response format
      const categorizedServices = {};
      allServices.forEach(service => {
        if (!categorizedServices[service.category]) {
          categorizedServices[service.category] = [];
        }
        
        categorizedServices[service.category].push({
          id: service.id,
          name: service.name,
          price: `$${service.price.toFixed(2)}`
        });
      });
      
      return JSON.stringify({
        success: true,
        categories: categorizedServices
      });
    } catch (error) {
      console.error('❌ Error in getServices tool:', error);
      return JSON.stringify({ 
        success: false,
        error: "Failed to retrieve services",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Create an instance of the tool
const getServicesTool = new GetServicesTool();

// Warm the cache on module load
getAllFormattedServices().catch(err => console.error('Failed to warm services cache:', err));

// Export both the tool class and the instance
module.exports = {
  GetServicesTool,
  getServicesTool,
  getAllFormattedServices,
  getServiceById,
  getServiceByName
}; 