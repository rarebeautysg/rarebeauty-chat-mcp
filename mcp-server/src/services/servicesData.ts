// Services data utility functions

// Updated interface to match SOHO API service data
export interface Service {
  count?: number;
  duration: number;
  followUp?: string;
  id: string;
  index?: number;
  price: number;
  service: string;
  enabled?: boolean;
}

export interface ServiceResponse {
  name: string;
  price: number;
  id: string;
  duration?: number;
  category?: string;
}

export interface Categories {
  [category: string]: ServiceResponse[];
}

export interface FormattedService {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
  followUp?: string;
}

// Service cache
let servicesCache: Service[] = [];
let lastFetched: number = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Processed services cache (for tools and other consumers)
let processedServicesCache: FormattedService[] = [];
let processedLastFetched: number = 0;

// Function to fetch services from SOHO GraphQL API
export async function fetchServicesFromSOHO(): Promise<Service[]> {
  console.log('🔄 Fetching services from SOHO GraphQL API');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
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
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        'X-Api-Key': process.env.SOHO_API_KEY || ''
      },
      body: JSON.stringify(query)
    });
    
    if (!response.ok) {
      throw new Error(`GraphQL API request failed with status ${response.status}`);
    }
    
    const result = await response.json();
    
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
export async function getServices(forceRefresh = false): Promise<Service[]> {
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
export const getActiveServices = (services: Service[]): Service[] => {
  return services.filter((service: Service) => 
    service.enabled !== false && 
    !service.service.startsWith("(2021)") && 
    !service.service.startsWith("Old ")
  );
};

// Function to categorize services
export const categorizeServices = (services: Service[]): Categories => {
  const categories: Categories = {
    "Lashes": [],
    "Facial": [],
    "Threading": [],
    "Waxing": [],
    "Skin": []
  };

  services.forEach(service => {
    // Format the service data for the response
    const serviceInfo: ServiceResponse = {
      name: service.service,
      price: typeof service.price === 'number' ? service.price : parseFloat(service.price as unknown as string),
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
export async function getAllFormattedServices(forceRefresh = false): Promise<FormattedService[]> {
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
      const result: FormattedService[] = [];
      
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
      
      // Fall back to mock data as a last resort
      console.log('⚠️ Falling back to mock data - API unavailable');
      return getMockServices();
    }
  } else {
    console.log('📝 Using cached processed services data');
    return processedServicesCache;
  }
}

// Fallback mock data in case API is unavailable
function getMockServices(): FormattedService[] {
  return [
    {
      id: "lash-classic",
      name: "Classic Lash Extensions",
      price: 88,
      duration: 60,
      category: "Lashes"
    },
    {
      id: "lash-hybrid",
      name: "Hybrid Lash Extensions",
      price: 108,
      duration: 75,
      category: "Lashes"
    },
    {
      id: "lash-volume",
      name: "Volume Lash Extensions",
      price: 128,
      duration: 90,
      category: "Lashes"
    },
    {
      id: "facial-basic",
      name: "Basic Facial",
      price: 78,
      duration: 60,
      category: "Facial"
    },
    {
      id: "facial-deluxe",
      name: "Deluxe Facial Treatment",
      price: 128,
      duration: 90,
      category: "Facial"
    },
    {
      id: "wax-brow",
      name: "Eyebrow Waxing",
      price: 18,
      duration: 15,
      category: "Waxing"
    },
    {
      id: "wax-lip",
      name: "Upper Lip Waxing",
      price: 12,
      duration: 10,
      category: "Waxing"
    }
  ];
}

// Get a specific service by ID
export async function getServiceById(serviceId: string): Promise<FormattedService | null> {
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

// Get a service by name (case insensitive partial match)
export async function getServiceByName(serviceName: string): Promise<FormattedService | null> {
  try {
    const services = await getAllFormattedServices();
    
    // Try exact match first
    let service = services.find(s => 
      s.name.toLowerCase() === serviceName.toLowerCase()
    );
    
    // If not found, try partial match
    if (!service) {
      service = services.find(s => 
        s.name.toLowerCase().includes(serviceName.toLowerCase())
      );
    }
    
    if (!service) {
      console.log(`❓ Service with name containing "${serviceName}" not found`);
      return null;
    }
    
    return service;
  } catch (error) {
    console.error(`❌ Error getting service by name "${serviceName}":`, error);
    return null;
  }
}

// Get services by category
export async function getServicesByCategory(category: string): Promise<FormattedService[]> {
  try {
    const services = await getAllFormattedServices();
    return services.filter(s => 
      s.category.toLowerCase() === category.toLowerCase()
    );
  } catch (error) {
    console.error(`❌ Error getting services for category "${category}":`, error);
    return [];
  }
}

// Get service duration by ID
export async function getServiceDuration(serviceId: string): Promise<number> {
  const service = await getServiceById(serviceId);
  return service?.duration || 60; // Default to 60 minutes if service not found
}

// CommonJS exports for compatibility
module.exports = {
  getAllFormattedServices,
  getServiceById,
  getServiceByName,
  getServicesByCategory,
  getServiceDuration
}; 