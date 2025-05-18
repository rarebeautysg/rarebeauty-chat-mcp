const { StructuredTool } = require("@langchain/core/tools");
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

// Initialize services cache at startup
async function initializeServicesCache() {
  console.log('📋 initializeServicesCache called');
  try {
    const services = await getServices(true); // Force refresh
    console.log(`✅ Initialized services cache with ${services.length} services`);
    
    // Log some example services with their IDs for reference
    if (services.length > 0) {
      console.log('📊 Service matching improved with advanced fuzzy search');
      console.log('📊 Example services in cache:');
      const sampleSize = Math.min(5, services.length);
      for (let i = 0; i < sampleSize; i++) {
        const service = services[i];
        console.log(`   - ID: ${service.id}, Name: ${service.service}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error initializing services cache:', error);
    return false;
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
      
      console.log(`✅ Processed ${result.length} services into formatted cache`);
      return result;
    } catch (error) {
      console.error('❌ Error processing services:', error);
      
      // If we have a stale cache, use it as fallback
      if (processedServicesCache.length > 0) {
        console.log('⚠️ Using stale processed services cache due to error');
        return processedServicesCache;
      }
      
      throw error;
    }
  } else {
    console.log(`📝 Using cached processed services (${processedServicesCache.length} items)`);
    return processedServicesCache;
  }
}

// Tool to list all services
class ListServicesTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = 'listServices';
    this.description = 'List all available beauty services categorized by type.';
    this.schema = { 
      type: 'object', 
      properties: {} 
    };
    
    // Store context and session for logging/tracking
    this.context = context;
    this.sessionId = sessionId;
    
    // Pre-warm cache
    getAllFormattedServices().catch(err => console.error('Failed to warm services cache:', err));
  }

  async _call(args) {
    console.log(`🔍 listServices tool called for session: ${this.sessionId || 'unknown'}`, args);
    
    try {
      const services = await getAllFormattedServices();
      
      // Track tool usage in memory if context exists
      if (this.context && this.context.memory) {
        // Initialize necessary objects in context memory
        if (!this.context.memory.tool_usage) {
          this.context.memory.tool_usage = {};
        }
        
        if (!this.context.memory.tool_usage.listServices) {
          this.context.memory.tool_usage.listServices = [];
        }
        
        // Initialize highlighted services array if it doesn't exist
        if (!this.context.memory.highlightedServices) {
          this.context.memory.highlightedServices = [];
        }
        
        this.context.memory.tool_usage.listServices.push({
          timestamp: new Date().toISOString(),
          result: `Retrieved ${services.length} services`
        });
      }
      
      return services;
    } catch (error) {
      console.error('❌ Error listing services:', error);
      throw error;
    }
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

// Find a service by name (exact or direct match)
async function getServiceByName(serviceName) {
  try {
    const services = await getAllFormattedServices();
    
    // Normalize the search query
    const normalizedQuery = serviceName.toLowerCase().trim();
    console.log(`🔍 Searching for service by normalized name: "${normalizedQuery}"`);
    
    // Try exact match first (case-insensitive)
    let service = services.find(s => 
      s.name.toLowerCase() === normalizedQuery
    );
    
    if (!service) {
      // Try direct partial match (service name contains the search query)
      service = services.find(s => 
        s.name.toLowerCase().includes(normalizedQuery)
      );
    }
    
    // If still no match, try simple word matching
    if (!service) {
      // Split the service name and query into words for better matching
      const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
      
      if (queryWords.length > 0) {
        // Find services where at least one significant word matches
        const potentialMatches = services.filter(s => {
          const serviceNameLower = s.name.toLowerCase();
          return queryWords.some(word => serviceNameLower.includes(word));
        });
        
        // Sort by number of matching words
        if (potentialMatches.length > 0) {
          service = potentialMatches[0];
        }
      }
    }
    
    if (!service) {
      console.log(`❓ Service with name "${serviceName}" not found`);
      return null;
    }
    
    console.log(`✅ Selected service match: "${service.name}" (${service.id})`);
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

// Add a new function to highlight services mentioned by the user
async function highlightService(serviceId, context) {
  if (!context || !context.memory) {
    console.log('⚠️ Cannot highlight service: context or memory not available');
    return false;
  }
  
  try {
    const service = await getServiceById(serviceId);
    
    if (!service) {
      console.log(`⚠️ Cannot highlight service: service with ID ${serviceId} not found`);
      return false;
    }
    
    // Initialize highlighted services array if it doesn't exist
    if (!context.memory.highlightedServices) {
      context.memory.highlightedServices = [];
    }
    
    // Initialize detectedServiceIds array if it doesn't exist
    if (!context.detectedServiceIds) {
      context.detectedServiceIds = [];
      console.log('✅ Initialized detectedServiceIds array in context (highlightService)');
    }
    
    // Check if service is already highlighted
    const alreadyHighlighted = context.memory.highlightedServices.some(s => s.id === service.id);
    
    if (!alreadyHighlighted) {
      // Add to highlighted services
      context.memory.highlightedServices.push({
        id: service.id,
        name: service.name,
        category: service.category,
        price: service.price,
        highlightedAt: new Date().toISOString()
      });
      
      console.log(`✅ Service "${service.name}" highlighted and stored in context`);
    } else {
      console.log(`ℹ️ Service "${service.name}" already highlighted`);
    }
    
    // Always ensure the service ID is in the detectedServiceIds array
    if (!context.detectedServiceIds.includes(service.id)) {
      context.detectedServiceIds.push(service.id);
      console.log(`✅ Service ID "${service.id}" added to detectedServiceIds from highlightService`);
    } else {
      console.log(`ℹ️ Service ID "${service.id}" already in detectedServiceIds`);
    }
    
    // Log the current state of the detectedServiceIds array for debugging
    console.log(`🔍 Current detectedServiceIds: ${JSON.stringify(context.detectedServiceIds)}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error highlighting service:`, error);
    return false;
  }
}

// Helper function to get all highlighted services from context
function getHighlightedServices(context) {
  if (!context || !context.memory || !context.memory.highlightedServices) {
    return [];
  }
  
  return context.memory.highlightedServices;
}

// Function to track when a service is mentioned in chat
async function trackServiceMention(serviceName, context, serviceId) {
  if (!context || !context.memory) {
    console.log('⚠️ Cannot track service mention: context or memory not available');
    return false;
  }
  
  try {
    // Initialize highlighted services array if it doesn't exist
    if (!context.memory.highlightedServices) {
      context.memory.highlightedServices = [];
    }
    
    // Initialize detectedServiceIds array if it doesn't exist
    if (!context.detectedServiceIds) {
      context.detectedServiceIds = [];
      console.log('✅ Initialized detectedServiceIds array in context');
    }
    
    // If a specific serviceId is provided, process it directly
    if (serviceId) {
      // Validate serviceId format (if provided)
      let validServiceId = serviceId;
      
      // Ensure service ID has correct format
      if (!serviceId.startsWith('service:')) {
        if (/^\d+(-\d+)?$/.test(serviceId)) {
          validServiceId = `service:${serviceId}`;
          console.log(`✅ Corrected service ID format: ${validServiceId} (original: ${serviceId})`);
        } else {
          console.log(`⚠️ Invalid service ID format: ${serviceId}`);
          validServiceId = null;
        }
      }
    
      if (validServiceId) {
        console.log(`🔍 Processing explicit service ID: ${validServiceId}`);
        
        // Get service info for additional context
        const services = await getAllFormattedServices();
        const serviceInfo = services.find(s => s.id === validServiceId);
        
        // Add to highlighted services if not already there
        const alreadyHighlighted = context.memory.highlightedServices.some(s => s.id === validServiceId);
        
        if (!alreadyHighlighted) {
          // Get the service name from either the provided info or the service name argument
          const displayName = serviceInfo ? serviceInfo.name : (serviceName || `Service ${validServiceId}`);
          
          // Add to highlighted services
          context.memory.highlightedServices.push({
            id: validServiceId,
            name: displayName,
            category: serviceInfo ? serviceInfo.category : 'Unknown',
            price: serviceInfo ? serviceInfo.price : null,
            highlightedAt: new Date().toISOString()
          });
          
          console.log(`✅ Service ID "${validServiceId}" highlighted and stored in context as "${displayName}"`);
        } else {
          console.log(`ℹ️ Service ID "${validServiceId}" already highlighted`);
        }
        
        // Always add to detectedServiceIds if not already there
        if (!context.detectedServiceIds.includes(validServiceId)) {
          context.detectedServiceIds.push(validServiceId);
          console.log(`✅ Service ID "${validServiceId}" added to detectedServiceIds`);
        } else {
          console.log(`ℹ️ Service ID "${validServiceId}" already in detectedServiceIds`);
        }
        
        return true;
      }
    }
    
    // If no valid service ID provided, try to find by name
    if (serviceName) {
      console.log(`🔍 Processing service mention: "${serviceName}"`);
      
      // Check if the input contains multiple services separated by commas
      if (serviceName.includes(',')) {
        console.log(`🔍 Multiple services detected in: "${serviceName}"`);
        const serviceNames = serviceName.split(',').map(name => name.trim()).filter(name => name.length > 0);
        
        // Process each service name individually
        let successCount = 0;
        for (const name of serviceNames) {
          console.log(`🔍 Processing individual service: "${name}"`);
          const success = await trackServiceMention(name, context);
          if (success) successCount++;
        }
        
        return successCount > 0;
      }
      
      // Process single service name
      const service = await getServiceByName(serviceName);
      
      if (service) {
        console.log(`✅ Found service by name: "${serviceName}" => ID: ${service.id}`);
        
        // Also add to detectedServiceIds array
        if (!context.detectedServiceIds.includes(service.id)) {
          context.detectedServiceIds.push(service.id);
          console.log(`✅ Service ID "${service.id}" added to detectedServiceIds from name lookup`);
        }
        
        return await highlightService(service.id, context);
      } else {
        console.log(`⚠️ Could not find service with name: "${serviceName}"`);
      }
    }
    
    console.log(`⚠️ Cannot track service mention: no valid service ID or name provided`);
    return false;
  } catch (error) {
    console.error(`❌ Error tracking service mention:`, error);
    return false;
  }
}

// Export the initialization function along with other exports
module.exports = {
  fetchServicesFromSOHO,
  getServices,
  getAllFormattedServices,
  getServiceById,
  getServiceByName,
  getServiceDuration,
  getHighlightedServices,
  ListServicesTool,
  initializeServicesCache,
  getActiveServices,
  categorizeServices,
  highlightService,
  trackServiceMention
}; 