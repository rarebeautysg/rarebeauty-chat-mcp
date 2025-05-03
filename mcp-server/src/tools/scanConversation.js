const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { getAllFormattedServices, trackServiceMention } = require('./listServices');

// Define the ScanConversationSchema
const ScanConversationSchema = z.object({
  message: z.string().describe("Message to scan for service mentions"),
  analyzeOnly: z.boolean().optional().describe("If true, only analyze but don't save to context")
});

/**
 * Tool to scan conversation messages for service mentions
 */
class ScanConversationTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "scanConversation";
    this.description = "Scan conversation messages for service mentions and add them to context.";
    this.schema = ScanConversationSchema;
    
    // Store context and session for tracking
    this.context = context;
    this.sessionId = sessionId;
    
    // Initialize service names lookup
    this.servicesById = null;
    this.servicesByName = null;
    this.serviceCategories = null;
    this.initializeServices();
  }
  
  async initializeServices() {
    try {
      const services = await getAllFormattedServices();
      
      // Create simple lookup maps by ID and name
      this.servicesById = {};
      this.servicesByName = {};
      this.serviceCategories = new Set();
      
      services.forEach(service => {
        // Index by ID
        this.servicesById[service.id] = service;
        
        // Index by exact name (case-insensitive)
        const nameLower = service.name.toLowerCase();
        this.servicesByName[nameLower] = service;
        
        // Add service category
        if (service.category) {
          this.serviceCategories.add(service.category.toLowerCase());
        }
      });
      
      console.log(`✅ Initialized services lookup with ${services.length} services`);
    } catch (error) {
      console.error('❌ Error initializing services lookup:', error);
    }
  }
  
  async _call(inputs) {
    console.log(`🔍 scanConversation tool called for session: ${this.sessionId || 'unknown'}`);
    const { message, analyzeOnly = false } = inputs;
    
    try {
      // Make sure we have services lookup initialized
      if (!this.servicesById) {
        await this.initializeServices();
      }
      
      // Extract service IDs from the message using regex and service name matching
      const mentionedServices = this.extractServiceIds(message);
      console.log(`Found ${mentionedServices.length} service references in message`);
      
      // If analyze-only mode, just return the results without updating context
      if (analyzeOnly) {
        return {
          serviceMentions: mentionedServices,
          message: `Found ${mentionedServices.length} service references (analyze-only mode)`
        };
      }
      
      // Track mentions in context
      const trackedResults = [];
      if (mentionedServices.length > 0) {
        console.log(`🔍 Detected services in message:`);
        mentionedServices.forEach(service => {
          console.log(`   🔹 Service: "${service.serviceName}" (ID: ${service.id})`);
        });
      }
      
      for (const mention of mentionedServices) {
        try {
          // Pass both service name and ID to ensure accurate tracking
          const result = await trackServiceMention(mention.serviceName, this.context, mention.id);
          trackedResults.push({
            serviceName: mention.serviceName,
            serviceId: mention.id,
            success: result
          });
        } catch (error) {
          console.error(`❌ Error tracking service mention: ${mention.serviceName}`, error);
          trackedResults.push({
            serviceName: mention.serviceName,
            serviceId: mention.id,
            success: false,
            error: error.message
          });
        }
      }
      
      // Track tool usage in memory
      this._trackToolUsage(`Found and tracked ${mentionedServices.length} service mentions`);
      
      return {
        serviceMentions: mentionedServices,
        tracked: trackedResults,
        message: `Found and tracked ${mentionedServices.length} service mentions in context`
      };
      
    } catch (error) {
      console.error('❌ Error scanning conversation:', error);
      
      // Track error in tool usage
      this._trackToolUsage(`Error: ${error.message}`);
      
      throw error;
    }
  }
  
  // Extract service IDs from the message using regex and service name matching
  extractServiceIds(message) {
    if (!message || !this.servicesById) {
      return [];
    }
    
    const serviceReferences = [];
    const processedIds = new Set();
    
    // Check for explicit service IDs (both service:X and service:X-YYYY formats)
    const serviceIdPattern = /(service:\d+(?:-\d+)?)/g;
    const serviceIdMatches = [...message.matchAll(serviceIdPattern)];
    
    // Extract all service IDs mentioned directly in the text
    for (const match of serviceIdMatches) {
      const serviceId = match[1];
      if (!processedIds.has(serviceId)) {
        const service = this.servicesById[serviceId];
        serviceReferences.push({
          id: serviceId,
          serviceName: service ? service.name : `Service ${serviceId}`,
          type: 'explicit-id'
        });
        processedIds.add(serviceId);
      }
    }
    
    // Check the message for service names from our service list
    if (message && this.servicesByName) {
      const messageLower = message.toLowerCase();
      
      // Check each service in our service list
      Object.entries(this.servicesByName).forEach(([serviceName, service]) => {
        // Skip if already processed
        if (processedIds.has(service.id)) {
          return;
        }
        
        // Check if service name is in the message
        if (messageLower.includes(serviceName)) {
          serviceReferences.push({
            id: service.id,
            serviceName: service.name,
            type: 'name-match'
          });
          processedIds.add(service.id);
        }
        
        // Also check common variations (e.g., "lashes dense" for "Lashes - Full Set - Dense")
        const simplifiedName = service.name.toLowerCase().replace(/\s*-\s*/g, ' ');
        if (simplifiedName !== serviceName && messageLower.includes(simplifiedName)) {
          serviceReferences.push({
            id: service.id,
            serviceName: service.name,
            type: 'simplified-name-match'
          });
          processedIds.add(service.id);
        }
      });
    }
    
    return serviceReferences;
  }
  
  // Helper method to track tool usage in context memory
  _trackToolUsage(result) {
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.scanConversation) {
        this.context.memory.tool_usage.scanConversation = [];
      }
      
      this.context.memory.tool_usage.scanConversation.push({
        timestamp: new Date().toISOString(),
        result: result
      });
    }
  }
}

// Factory function to create the tool
function createScanConversationTool(context, sessionId) {
  return new ScanConversationTool(context, sessionId);
}

module.exports = {
  ScanConversationTool,
  createScanConversationTool
}; 