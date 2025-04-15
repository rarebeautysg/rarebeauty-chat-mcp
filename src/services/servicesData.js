class ServicesDataService {
  constructor() {
    this.cachedServices = null;
    this.lastFetchTime = 0;
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get all available services
   * @param {boolean} forceRefresh Force refresh the cache
   * @returns {Promise<Array>} List of services
   */
  async getAllServices(forceRefresh = false) {
    const now = Date.now();
    
    // Check if cache is valid
    if (!forceRefresh && this.cachedServices && (now - this.lastFetchTime < this.cacheDuration)) {
      return this.cachedServices;
    }
    
    try {
      // Fetch services from the API
      const response = await fetch('/api/services?activeOnly=true');
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Flatten all categories into a single array and format service objects
      let services = [];
      Object.keys(data.categories).forEach(category => {
        const categoryServices = data.categories[category].map(service => ({
          id: service.id,
          name: service.name,
          duration: service.duration || 60, // Default to 60 mins if no duration
          price: service.price,
          followUp: service.followUp
        }));
        services = [...services, ...categoryServices];
      });
      
      this.cachedServices = services;
      this.lastFetchTime = now;
      
      return services;
    } catch (error) {
      console.error('Error fetching services from API:', error);
      throw error;
    }
  }
  
  /**
   * Get service duration by service ID or name
   * @param {string} serviceIdOrName The service ID or name
   * @returns {Promise<number>} Duration in minutes
   */
  async getServiceDuration(serviceIdOrName) {
    try {
      // Try to get the service details from the API
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          serviceId: serviceIdOrName.startsWith('service:') ? serviceIdOrName : undefined,
          serviceName: !serviceIdOrName.startsWith('service:') ? serviceIdOrName : undefined
        }),
      });
      
      if (response.ok) {
        const service = await response.json();
        if (service && typeof service.duration === 'number') {
          return service.duration;
        }
      }
      
      // If API call fails or service not found, try to find in cached services
      const services = await this.getAllServices();
      const service = services.find(s => 
        s.id === serviceIdOrName || 
        s.name === serviceIdOrName || 
        s.name.toLowerCase().includes(serviceIdOrName.toLowerCase())
      );
      
      if (service && service.duration) {
        return service.duration;
      }
      
      // Return default duration if not found
      return 60; // Default duration: 60 minutes
    } catch (error) {
      console.error('Error getting service duration:', error);
      return 60; // Default duration: 60 minutes
    }
  }
  
  /**
   * Find a service by name, ID, or partial match
   * @param {string} query The search query
   * @returns {Promise<Object|null>} The service object or null if not found
   */
  async findService(query) {
    try {
      // Try to get the service details from the API first
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          serviceId: query.startsWith('service:') ? query : undefined,
          serviceName: !query.startsWith('service:') ? query : undefined
        }),
      });
      
      if (response.ok) {
        const service = await response.json();
        if (service && service.id) {
          return {
            id: service.id,
            name: service.name,
            duration: service.duration || 60,
            price: service.price,
            followUp: service.followUp
          };
        }
      }
      
      // Fallback to cached services
      const services = await this.getAllServices();
      return services.find(s => 
        s.id === query || 
        s.name === query || 
        s.name.toLowerCase().includes(query.toLowerCase())
      ) || null;
    } catch (error) {
      console.error('Error finding service:', error);
      return null;
    }
  }
}

// Create a singleton instance
let servicesDataInstance = null;

/**
 * Get the ServicesDataService instance
 * @returns {ServicesDataService}
 */
export function getServicesData() {
  if (!servicesDataInstance) {
    servicesDataInstance = new ServicesDataService();
  }
  return servicesDataInstance;
} 