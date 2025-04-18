import { NextRequest, NextResponse } from 'next/server';

// Updated interface to match SOHO API service data
interface Service {
  count?: number;
  duration: number;
  followUp?: string;
  id: string;
  index?: number;
  price: number;
  service: string;
  enabled?: boolean;
}

interface ServiceResponse {
  name: string;
  price: number;
  id: string;
  duration?: number;
  category?: string;
}

interface Categories {
  [category: string]: ServiceResponse[];
}

interface FormattedService {
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
async function fetchServicesFromSOHO(): Promise<Service[]> {
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
const getActiveServices = (services: Service[]): Service[] => {
  return services.filter((service: Service) => 
    service.enabled !== false && 
    !service.service.startsWith("(2021)") && 
    !service.service.startsWith("Old ")
  );
};

// Function to categorize services
const categorizeServices = (services: Service[]): Categories => {
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
      
      // Build flat processed cache
      const allProcessedServices: FormattedService[] = [];
      
      Object.keys(categorizedServices).forEach(category => {
        categorizedServices[category].forEach(service => {
          // Find original service to get additional data
          const originalService = filteredServices.find(s => s.id === service.id);
          
          if (originalService) {
            allProcessedServices.push({
              id: service.id,
              name: service.name,
              category: category,
              price: service.price,
              duration: typeof originalService.duration === 'number' 
                ? originalService.duration 
                : parseInt(originalService.duration as unknown as string, 10),
              followUp: originalService.followUp
            });
          }
        });
      });
      
      processedServicesCache = allProcessedServices;
      processedLastFetched = now;
      
      console.log(`✅ Built processed services cache with ${allProcessedServices.length} services`);
    } catch (error) {
      console.error('❌ Error building processed services cache:', error);
      
      // If cache is empty, throw error; otherwise, use stale cache
      if (processedServicesCache.length === 0) {
        throw error;
      }
      
      console.log('⚠️ Using stale processed services cache due to error');
    }
  } else {
    console.log('📝 Using existing processed services cache');
  }
  
  return processedServicesCache;
}

// Get service by ID - used by tools
export async function getServiceById(serviceId: string): Promise<FormattedService | null> {
  console.log(`📋 Looking up service by ID: ${serviceId}`);
  
  try {
    const allServices = await getAllFormattedServices();
    const service = allServices.find(s => s.id === serviceId);
    
    if (!service) {
      console.log(`❌ Service not found with ID: ${serviceId}`);
      return null;
    }
    
    console.log(`✅ Found service: ${service.name}`);
    return service;
  } catch (error) {
    console.error(`❌ Error getting service by ID ${serviceId}:`, error);
    return null;
  }
}

// Get services by category - used by tools
export async function getServicesByCategory(category: string): Promise<FormattedService[]> {
  console.log(`📋 Getting services for category: ${category}`);
  
  try {
    const allServices = await getAllFormattedServices();
    return allServices.filter(service => 
      service.category.toLowerCase() === category.toLowerCase()
    );
  } catch (error) {
    console.error(`❌ Error getting services for category ${category}:`, error);
    return [];
  }
}

// Get service duration - used by booking tool
export async function getServiceDuration(serviceId: string): Promise<number> {
  const service = await getServiceById(serviceId);
  return service ? service.duration : 60; // Default to 60 minutes if not found
}

export async function GET(request: NextRequest) {
  console.log('GET /api/services');
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const activeOnly = searchParams.get('activeOnly') !== 'false'; // Default to true
    const includeDuration = searchParams.get('includeDuration') === 'true'; // Default to false
    const forceRefresh = searchParams.get('forceRefresh') === 'true'; // Force cache refresh
    
    console.log(`Query params: category=${category}, activeOnly=${activeOnly}, includeDuration=${includeDuration}, forceRefresh=${forceRefresh}`);
    
    // Get services (from cache or API)
    const allServices = await getServices(forceRefresh);
    
    // Start with either all services or only active ones
    let filteredServices = activeOnly ? getActiveServices(allServices) : allServices;
    
    // Categorize the services
    const categorizedServices = categorizeServices(filteredServices);
    
    // Add duration if requested
    if (includeDuration) {
      Object.keys(categorizedServices).forEach(categoryName => {
        categorizedServices[categoryName].forEach(service => {
          // Find the original service to get the duration
          const originalService = filteredServices.find(s => s.id === service.id);
          if (originalService) {
            service.duration = typeof originalService.duration === 'number' 
              ? originalService.duration 
              : parseInt(originalService.duration as unknown as string, 10);
          }
        });
      });
    }
    
    // Further filter by category if provided
    if (category) {
      // If category is provided, only return services from that category
      if (categorizedServices[category]) {
        return NextResponse.json({ categories: { [category]: categorizedServices[category] } });
      } else {
        return NextResponse.json({ categories: {} });
      }
    }
    
    // Return all categories
    return NextResponse.json({ categories: categorizedServices });
  } catch (error) {
    console.error('Error in services API:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('POST /api/services');
  try {
    const data = await request.json();
    const { serviceId, serviceName } = data;
    
    if (!serviceId && !serviceName) {
      return NextResponse.json(
        { error: 'Either serviceId or serviceName is required' },
        { status: 400 }
      );
    }
    
    console.log(`Looking for service with ID: ${serviceId} or name: ${serviceName}`);
    
    // Get services (from cache or API)
    const services = await getServices();
    
    // Find the service by ID or name
    const service = services.find(s => 
      (serviceId && s.id === serviceId) || 
      (serviceName && (s.service === serviceName || s.service.toLowerCase().includes(serviceName.toLowerCase())))
    );
    
    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }
    
    const serviceResponse = {
      id: service.id,
      name: service.service,
      duration: typeof service.duration === 'number' 
        ? service.duration 
        : parseInt(service.duration as unknown as string, 10),
      price: typeof service.price === 'number' 
        ? service.price 
        : parseFloat(service.price as unknown as string),
      followUp: service.followUp
    };
    
    return NextResponse.json(serviceResponse);
  } catch (error) {
    console.error('Error in services API:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
} 