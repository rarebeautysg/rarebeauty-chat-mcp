import { Tool } from "@langchain/core/tools";
import { getAllFormattedServices } from "../app/api/services/route";

class GetServicesTool extends Tool {
  constructor() {
    super();
    this.name = "getServices";
    this.description = "Get a list of all available beauty services with prices";
  }

  async _call(_args) {
    console.log('📋 GetServices tool called');
    
    try {
      // Get services from our consolidated API
      const allServices = await getAllFormattedServices();
      
      // Group services by category
      const servicesByCategory = allServices.reduce((acc, service) => {
        if (!acc[service.category]) {
          acc[service.category] = [];
        }
        acc[service.category].push(service);
        return acc;
      }, {});
      
      // Format the response in a readable way
      let formattedResponse = {
        categories: {}
      };
      
      Object.keys(servicesByCategory).forEach(category => {
        formattedResponse.categories[category] = servicesByCategory[category].map(service => ({
          id: service.id,
          name: service.name,
          price: service.price,
          duration: `${service.duration} minutes`
        }));
      });
      
      console.log(`✅ Returning ${allServices.length} services in ${Object.keys(servicesByCategory).length} categories`);
      return JSON.stringify(formattedResponse);
      
    } catch (error) {
      console.error('❌ Error in getServices tool:', error);
      return JSON.stringify({
        error: "Failed to get services",
        message: error.message
      });
    }
  }
}

// Export an instance of the tool
export const getServicesTool = new GetServicesTool();

// Export the function to get active services for other modules that need it
export const getActiveServices = async () => {
  try {
    const allServices = await getAllFormattedServices();
    return allServices.map(service => ({
      id: service.id,
      name: service.name,
      price: service.price,
      duration: service.duration,
      category: service.category
    }));
  } catch (error) {
    console.error('Error fetching active services:', error);
    return [];
  }
}; 