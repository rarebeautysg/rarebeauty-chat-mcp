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
    this.servicesLookup = null;
    this.initializeServices();
  }
  
  async initializeServices() {
    try {
      const services = await getAllFormattedServices();
      
      // Create lookup object for service names (case-insensitive)
      this.servicesLookup = {};
      services.forEach(service => {
        const nameLower = service.name.toLowerCase();
        this.servicesLookup[nameLower] = service;
        
        // Also add without category prefix for easier matching
        // E.g. "Lashes - Extensions" -> "Extensions"
        if (nameLower.includes(' - ')) {
          const parts = nameLower.split(' - ');
          if (parts.length > 1) {
            const shortName = parts[1].trim();
            if (shortName && shortName.length > 3) {
              this.servicesLookup[shortName] = service;
            }
          }
        }
      });
      
      console.log(`✅ Initialized service names lookup with ${Object.keys(this.servicesLookup).length} entries`);
    } catch (error) {
      console.error('❌ Error initializing services lookup:', error);
    }
  }
  
  async _call(inputs) {
    console.log(`🔍 scanConversation tool called for session: ${this.sessionId || 'unknown'}`);
    const { message, analyzeOnly = false } = inputs;
    
    try {
      // Make sure we have services lookup initialized
      if (!this.servicesLookup) {
        await this.initializeServices();
      }
      
      // Find service mentions in the message
      const mentionedServices = this.findServiceMentions(message);
      console.log(`Found ${mentionedServices.length} service mentions in message`);
      
      // If analyze-only mode, just return the results without updating context
      if (analyzeOnly) {
        return {
          serviceMentions: mentionedServices,
          message: `Found ${mentionedServices.length} service mentions (analyze-only mode)`
        };
      }
      
      // Track mentions in context
      const trackedResults = [];
      for (const mention of mentionedServices) {
        try {
          const result = await trackServiceMention(mention.serviceName, this.context);
          trackedResults.push({
            serviceName: mention.serviceName,
            success: result
          });
        } catch (error) {
          console.error(`❌ Error tracking service mention: ${mention.serviceName}`, error);
          trackedResults.push({
            serviceName: mention.serviceName,
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
  
  // Find service mentions in a message
  findServiceMentions(message) {
    if (!message || !this.servicesLookup) {
      return [];
    }
    
    const messageLower = message.toLowerCase();
    const mentions = [];
    
    // Check for exact matches first
    for (const [serviceName, service] of Object.entries(this.servicesLookup)) {
      if (messageLower.includes(serviceName)) {
        mentions.push({
          serviceName: service.name,
          id: service.id,
          match: 'exact',
          matchedOn: serviceName
        });
      }
    }
    
    // If no exact matches, look for partial matches using tokenization
    if (mentions.length === 0) {
      const words = messageLower.split(/\s+/);
      
      for (const word of words) {
        if (word.length < 4) continue; // Skip short words
        
        for (const [serviceName, service] of Object.entries(this.servicesLookup)) {
          if (serviceName.includes(word)) {
            // Add if not already added
            if (!mentions.some(m => m.id === service.id)) {
              mentions.push({
                serviceName: service.name,
                id: service.id,
                match: 'partial',
                matchedOn: word
              });
            }
          }
        }
      }
    }
    
    // Sort mentions by match type (exact first, then partial)
    return mentions.sort((a, b) => {
      if (a.match === 'exact' && b.match !== 'exact') return -1;
      if (a.match !== 'exact' && b.match === 'exact') return 1;
      return 0;
    });
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