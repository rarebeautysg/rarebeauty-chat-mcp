// Mock services data for testing purposes
const SERVICES_DATA = [
  {
    id: 'service:1-2024',
    name: 'Lashes - Full Set - Natural',
    category: 'Lashes',
    price: '$65',
    duration: 60
  },
  {
    id: 'service:2-2024',
    name: 'Lashes - Full Set - Dense',
    category: 'Lashes',
    price: '$75',
    duration: 75
  },
  {
    id: 'service:3-2024',
    name: 'Lashes - Full Set - Russian',
    category: 'Lashes',
    price: '$85',
    duration: 90
  },
  {
    id: 'service:4-2024',
    name: 'Facial - Basic Cleanse',
    category: 'Facial',
    price: '$45',
    duration: 30
  },
  {
    id: 'service:5-2024',
    name: 'Facial - Hydrating',
    category: 'Facial',
    price: '$65',
    duration: 45
  },
  {
    id: 'service:6-2024',
    name: 'Facial - Anti-Aging',
    category: 'Facial',
    price: '$85',
    duration: 60
  },
  {
    id: 'service:7-2024',
    name: 'Threading - Eyebrows',
    category: 'Threading',
    price: '$15',
    duration: 15
  },
  {
    id: 'service:8-2024',
    name: 'Threading - Upper Lip',
    category: 'Threading',
    price: '$10',
    duration: 10
  },
  {
    id: 'service:9-2024',
    name: 'Waxing - Legs Full',
    category: 'Waxing',
    price: '$55',
    duration: 45
  },
  {
    id: 'service:10-2024',
    name: 'Waxing - Brazilian',
    category: 'Waxing',
    price: '$65',
    duration: 30
  }
];

// Singleton class to manage services data
class ServicesData {
  constructor() {
    this.services = SERVICES_DATA;
  }

  async getAllServices() {
    // In a real implementation, this would fetch from an API
    console.log('📋 Getting all services');
    return this.services;
  }

  async getServicesByCategory(category) {
    console.log(`📋 Getting services for category: ${category}`);
    return this.services.filter(service => 
      service.category.toLowerCase() === category.toLowerCase()
    );
  }

  async getServiceById(serviceId) {
    console.log(`📋 Looking up service by ID: ${serviceId}`);
    const service = this.services.find(s => s.id === serviceId);
    
    if (!service) {
      console.log(`❌ Service not found with ID: ${serviceId}`);
      throw new Error(`Service not found with ID: ${serviceId}`);
    }
    
    console.log(`✅ Found service: ${service.name}`);
    return service;
  }

  async getServiceDuration(serviceId) {
    const service = await this.getServiceById(serviceId);
    return service.duration;
  }

  // Add more methods as needed
}

// Export a singleton getter
let instance = null;

export function getServicesData() {
  if (!instance) {
    instance = new ServicesData();
  }
  return instance;
} 