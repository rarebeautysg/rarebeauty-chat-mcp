const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { getAllFormattedServices, trackServiceMention } = require('./listServices');

// Define the ScanConversationSchema
const ScanConversationSchema = z.object({
  message: z.string().describe("Message to scan for service mentions"),
  analyzeOnly: z.boolean().optional().describe("If true, only analyze but don't save to context")
});

// Singleton state for services lookup
const servicesLookup = {
  servicesById: null,
  servicesByName: null,
  serviceCategories: null,
  initialized: false,
  initializing: false
};

// Initialize services once for all instances
async function initializeServicesOnce() {
  // If already initializing, wait for it to complete
  if (servicesLookup.initializing) {
    while (servicesLookup.initializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }
  
  // If already initialized, return immediately
  if (servicesLookup.initialized) {
    return;
  }
  
  // Set initializing flag
  servicesLookup.initializing = true;
  
  try {
    const services = await getAllFormattedServices();
    
    // Create simple lookup maps by ID and name
    servicesLookup.servicesById = {};
    servicesLookup.servicesByName = {};
    servicesLookup.serviceCategories = new Set();
    
    services.forEach(service => {
      // Index by ID
      servicesLookup.servicesById[service.id] = service;
      
      // Index by exact name (case-insensitive)
      const nameLower = service.name.toLowerCase();
      servicesLookup.servicesByName[nameLower] = service;
      
      // Add service category
      if (service.category) {
        servicesLookup.serviceCategories.add(service.category.toLowerCase());
      }
    });
    
    servicesLookup.initialized = true;
    console.log(`✅ Initialized services lookup with ${services.length} services`);
  } catch (error) {
    console.error('❌ Error initializing services lookup:', error);
  } finally {
    servicesLookup.initializing = false;
  }
}

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
    
    // Initialize services if needed
    if (!servicesLookup.initialized && !servicesLookup.initializing) {
      initializeServicesOnce();
    }
  }
  
  async _call(inputs) {
    console.log(`🔍 scanConversation tool called for session: ${this.sessionId || 'unknown'}`);
    const { message, analyzeOnly = false } = inputs;
    
    try {
      // Make sure we have services lookup initialized
      if (!servicesLookup.initialized) {
        await initializeServicesOnce();
      }
      
      // More thorough check for appointment history data
      const isHistoricalData = 
        message.includes('"areHistoricalServices":true') || 
        message.includes('"doNotAddToServiceSelections":true') ||
        message.includes('"isHistoricalService":true') ||
        message.includes('appointment_message') ||
        message.includes('appointmentData') ||
        (message.includes('appointments') && message.includes('cancelCount')) ||
        message.includes("appointment history");
      
      if (isHistoricalData) {
        console.log(`🔍 Message appears to contain appointment history - skipping service detection entirely`);
        return {
          serviceMentions: [],
          skippedDetection: true,
          message: `Skipped service detection for appointment history data`
        };
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
      
      // Check if the message itself indicates it's just displaying historical data
      const isDisplayingHistory = 
        message.toLowerCase().includes("appointment history for") || 
        message.toLowerCase().includes("previous appointments") ||
        message.toLowerCase().includes("past appointments") ||
        message.toLowerCase().includes("appointment details");
        
      if (isDisplayingHistory) {
        console.log(`🔍 Message is displaying appointment history - skipping context updates`);
        return {
          serviceMentions: mentionedServices,
          skippedContextUpdate: true,
          message: `Detected services but skipped context updates for appointment history display`
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
      
      // Update local context only, not global mcpContext
      for (const mention of mentionedServices) {
        try {
          // Pass both service name and ID to ensure accurate tracking
          const result = await trackServiceMention(mention.serviceName, this.context, mention.id);
          trackedResults.push({
            serviceName: mention.serviceName,
            serviceId: mention.id,
            success: result
          });
          
          // Ensure this service is in the detectedServiceIds array
          if (!this.context.detectedServiceIds) {
            this.context.detectedServiceIds = [];
          }
          if (!this.context.detectedServiceIds.includes(mention.id)) {
            this.context.detectedServiceIds.push(mention.id);
            console.log(`✅ Added service ID ${mention.id} to detectedServiceIds`);
          }
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
      this._trackToolUsage(`Found and tracked ${mentionedServices.length} service mentions in local context`);
      
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
    if (!message || !servicesLookup.servicesById) {
      return [];
    }
    
    // Skip service detection in specific contexts related to appointment history
    const skipContexts = [
      "appointment history",
      "previous appointment",
      "past appointment",
      "customer's appointments",
      "has previously booked",
      "has had appointments"
    ];
    
    const lowercaseMsg = message.toLowerCase();
    for (const skipContext of skipContexts) {
      if (lowercaseMsg.includes(skipContext)) {
        console.log(`🔍 Skipping service detection in "${skipContext}" context`);
        return [];
      }
    }
    
    const serviceReferences = [];
    const processedIds = new Set();
    
    // Check for explicit service IDs (both service:X and service:X-YYYY formats)
    const serviceIdPattern = /(service:\d+(?:-\d+)?)/g;
    const serviceIdMatches = [...message.matchAll(serviceIdPattern)];
    
    // Extract all service IDs mentioned directly in the text
    for (const match of serviceIdMatches) {
      const serviceId = match[1];
      
      // Skip if this appears to be in a historical context
      const surroundingText = this.getSurroundingContext(message, match.index, 30);
      if (this.isHistoricalContext(surroundingText)) {
        console.log(`🔍 Skipping service ID ${serviceId} in historical context: "${surroundingText}"`);
        continue;
      }
      
      if (!processedIds.has(serviceId)) {
        const service = servicesLookup.servicesById[serviceId];
        serviceReferences.push({
          id: serviceId,
          serviceName: service ? service.name : `Service ${serviceId}`,
          type: 'explicit-id'
        });
        processedIds.add(serviceId);
      }
    }
    
    // Check the message for service names from our service list
    if (message && servicesLookup.servicesByName) {
      const messageLower = message.toLowerCase();
      
      // Check each service in our service list
      Object.entries(servicesLookup.servicesByName).forEach(([serviceName, service]) => {
        // Skip if already processed
        if (processedIds.has(service.id)) {
          return;
        }
        
        // Check if service name is in the message
        if (messageLower.includes(serviceName)) {
          // Skip if this appears to be in a historical context
          const surroundingText = this.getSurroundingContext(message, messageLower.indexOf(serviceName), 30);
          if (this.isHistoricalContext(surroundingText)) {
            console.log(`🔍 Skipping service "${serviceName}" in historical context: "${surroundingText}"`);
            return;
          }
          
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
          // Skip if this appears to be in a historical context
          const surroundingText = this.getSurroundingContext(message, messageLower.indexOf(simplifiedName), 30);
          if (this.isHistoricalContext(surroundingText)) {
            console.log(`🔍 Skipping simplified service "${simplifiedName}" in historical context: "${surroundingText}"`);
            return;
          }
          
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
  
  // Helper to get text surrounding a match position
  getSurroundingContext(text, position, contextSize = 30) {
    const start = Math.max(0, position - contextSize);
    const end = Math.min(text.length, position + contextSize);
    return text.substring(start, end);
  }
  
  // Helper to determine if text appears to be in a historical context
  isHistoricalContext(text) {
    const historicalIndicators = [
      "previous", "past", "history", "booked before", "last time", 
      "last appointment", "appointment on", "had on", "completed on"
    ];
    
    const lowercaseText = text.toLowerCase();
    return historicalIndicators.some(indicator => lowercaseText.includes(indicator));
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

// Initialize services at module load time
initializeServicesOnce();

module.exports = {
  ScanConversationTool,
  createScanConversationTool
}; 