const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { getAllFormattedServices, getHighlightedServices, getServiceByName } = require('./listServices');
const { getSuggestedServices } = require('./bookAppointment');

// Define the schema for the SuggestServicesTool
const SuggestServicesSchema = z.object({
  query: z.string().optional().describe("Optional search query to filter services")
});

class SuggestServicesTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "suggestServices";
    this.description = "Suggest services based on the conversation history and user preferences.";
    this.schema = SuggestServicesSchema;
    
    // Store context and session for tracking
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(inputs) {
    console.log(`🔍 suggestServices tool called for session: ${this.sessionId || 'unknown'}`);
    const { query } = inputs;
    
    try {
      // First priority: Get services highlighted in the conversation
      const highlightedServices = getSuggestedServices(this.context);
      
      // If we have highlighted services and no specific query, return those
      if (highlightedServices.length > 0 && !query) {
        console.log(`✅ Returning ${highlightedServices.length} highlighted services from conversation`);
        
        // Track tool usage in memory
        this._trackToolUsage(`Found ${highlightedServices.length} previously highlighted services`);
        
        return {
          highlighted: true,
          services: highlightedServices,
          message: "These services were mentioned in your conversation"
        };
      }
      
      // Second priority: If there's a query, try to find services matching it
      if (query) {
        console.log(`🔍 Searching for services matching: "${query}"`);
        
        // Get all services
        const allServices = await getAllFormattedServices();
        
        // Filter services by query (case-insensitive)
        const matchingServices = allServices.filter(service => 
          service.name.toLowerCase().includes(query.toLowerCase()) ||
          service.category.toLowerCase().includes(query.toLowerCase())
        );
        
        if (matchingServices.length > 0) {
          console.log(`✅ Found ${matchingServices.length} services matching query: "${query}"`);
          
          // Track tool usage in memory
          this._trackToolUsage(`Found ${matchingServices.length} services matching query: "${query}"`);
          
          return {
            highlighted: false,
            query: query,
            services: matchingServices,
            message: `Services matching "${query}"`
          };
        } else {
          console.log(`⚠️ No services found matching query: "${query}"`);
          
          // If no matches, get top services by category as fallback
          const topServices = this._getTopServicesByCategory(await getAllFormattedServices());
          
          // Track tool usage in memory
          this._trackToolUsage(`No services matching "${query}". Returning top services instead.`);
          
          return {
            highlighted: false,
            query: query,
            services: topServices,
            message: `No services found matching "${query}". Here are some popular options instead.`
          };
        }
      }
      
      // Third priority: Get top services by category
      const topServices = this._getTopServicesByCategory(await getAllFormattedServices());
      
      // Track tool usage in memory
      this._trackToolUsage(`Returning top services by category`);
      
      return {
        highlighted: false,
        services: topServices,
        message: "Here are some popular service options"
      };
      
    } catch (error) {
      console.error('❌ Error suggesting services:', error);
      
      // Track error in tool usage
      this._trackToolUsage(`Error: ${error.message}`);
      
      throw error;
    }
  }
  
  // Helper method to track tool usage in context memory
  _trackToolUsage(result) {
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.suggestServices) {
        this.context.memory.tool_usage.suggestServices = [];
      }
      
      this.context.memory.tool_usage.suggestServices.push({
        timestamp: new Date().toISOString(),
        result: result
      });
    }
  }
  
  // Helper method to get top services by category (1-2 from each)
  _getTopServicesByCategory(allServices) {
    const categoryCounts = {};
    const result = [];
    
    // Get sorted services by category
    const servicesByCategory = {};
    
    allServices.forEach(service => {
      if (!servicesByCategory[service.category]) {
        servicesByCategory[service.category] = [];
      }
      
      servicesByCategory[service.category].push(service);
    });
    
    // Take top 2 from each category
    Object.keys(servicesByCategory).forEach(category => {
      const services = servicesByCategory[category];
      const topCategoryServices = services.slice(0, 2);
      
      topCategoryServices.forEach(service => {
        result.push(service);
      });
    });
    
    return result;
  }
}

// Factory function to create the tool
function createSuggestServicesTool(context, sessionId) {
  return new SuggestServicesTool(context, sessionId);
}

module.exports = {
  SuggestServicesTool,
  createSuggestServicesTool
}; 