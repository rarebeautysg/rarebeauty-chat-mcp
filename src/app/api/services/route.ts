import { NextRequest, NextResponse } from 'next/server';
import { servicesData } from '@/tools/getServices';

// Updated interface to match actual service data
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
}

interface Categories {
  [category: string]: ServiceResponse[];
}

// Function to filter active services
const getActiveServices = (): Service[] => {
  return servicesData.services.filter((service: Service) => 
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

export async function GET(request: NextRequest) {
  console.log('GET /api/services');
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const activeOnly = searchParams.get('activeOnly') !== 'false'; // Default to true
    const includeDuration = searchParams.get('includeDuration') === 'true'; // Default to false
    
    console.log(`Query params: category=${category}, activeOnly=${activeOnly}, includeDuration=${includeDuration}`);
    
    // Start with either all services or only active ones
    let filteredServices = activeOnly ? getActiveServices() : servicesData.services;
    
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    
    // Find the service by ID or name
    const service = servicesData.services.find(s => 
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 