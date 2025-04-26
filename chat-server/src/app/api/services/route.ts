import { NextRequest, NextResponse } from 'next/server';
import { 
  getServices, 
  getActiveServices, 
  categorizeServices,
  getAllFormattedServices,
  Service,
  ServiceResponse,
  Categories,
  FormattedService
} from '@/services/servicesData';

// Only keep the route handlers (GET and POST)
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