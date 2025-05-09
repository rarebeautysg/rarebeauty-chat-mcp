const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { 
  getAllFormattedServices, 
  trackServiceMention, 
  getServiceByName,
  getHighlightedServices
} = require('./listServices');

// Define the ScanServicesSchema
const ScanServicesSchema = z.object({
  message: z.string().describe("Message to scan for service mentions"),
  analyzeOnly: z.boolean().optional().describe("If true, only analyze but don't save to context")
});

// Singleton cache for services data
const servicesCache = {
  services: null,
  serviceNames: null,
  serviceCategories: null,
  initialized: false,
  initializing: false
};

// Initialize services once for all instances
async function initializeServicesCache() {
  // If already initializing, wait for it to complete
  if (servicesCache.initializing) {
    while (servicesCache.initializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }
  
  // If already initialized, return immediately
  if (servicesCache.initialized) {
    return;
  }
  
  // Set initializing flag
  servicesCache.initializing = true;
  
  try {
    // Get all services
    const services = await getAllFormattedServices();
    
    // Create lookup data structures
    servicesCache.services = services;
    servicesCache.serviceNames = new Set();
    servicesCache.serviceVariations = new Map();
    servicesCache.serviceCategories = new Set();
    
    // Build service name variations for lookup
    services.forEach(service => {
      // Add main service name (lowercase for case-insensitive matching)
      const nameLower = service.name.toLowerCase();
      servicesCache.serviceNames.add(nameLower);
      
      // Add category to category set
      if (service.category) {
        servicesCache.serviceCategories.add(service.category.toLowerCase());
      }
      
      // Create variations for better matching
      const variations = [];
      
      // Add original name
      variations.push(nameLower);
      
      // Add without hyphens (e.g., "Lashes - Full Set" -> "lashes full set")
      const noHyphens = nameLower.replace(/\s*-\s*/g, ' ');
      if (noHyphens !== nameLower) {
        variations.push(noHyphens);
      }
      
      // Add without category prefix (e.g., "Lashes - Full Set" -> "Full Set")
      if (service.category && nameLower.startsWith(service.category.toLowerCase())) {
        const withoutPrefix = nameLower.substring(service.category.length).replace(/^\s*-\s*/, '').trim();
        if (withoutPrefix) {
          variations.push(withoutPrefix);
        }
      }
      
      // Store variations with the service ID
      servicesCache.serviceVariations.set(service.id, {
        service,
        variations
      });
    });
    
    servicesCache.initialized = true;
    console.log(`✅ Initialized services cache with ${services.length} services`);
  } catch (error) {
    console.error('❌ Error initializing services cache:', error);
  } finally {
    servicesCache.initializing = false;
  }
}

/**
 * Analyze text to detect if it's about appointment history
 */
function isAppointmentHistory(text) {
  if (!text) return false;
  
  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();
  
  // Explicit markers that always indicate history content
  if (lowerText.includes('"isappointmenthistory": true') || 
      lowerText.includes('"arehistoricalservices": true') ||
      lowerText.includes('"appointmenthistory": true')) {
    return true;
  }
  
  // Check for common phrases indicating appointment history
  const historyPhrases = [
    'appointment history',
    'previous appointment',
    'past appointment',
    'appointment details',
    'service history'
  ];
  
  for (const phrase of historyPhrases) {
    if (lowerText.includes(phrase)) {
      return true;
    }
  }
  
  // Check for tabular format commonly used to display history
  if (lowerText.includes('|') && 
     (lowerText.includes('date') || lowerText.includes('time')) && 
     (lowerText.includes('service') || lowerText.includes('treatment'))) {
    return true;
  }
  
  // Check for past tense verbs coupled with service categories, but only if not asking for new services
  // This prevents "last time I had lashes but now I want..." from being classified as pure history
  if (!lowerText.includes('book') && 
      !lowerText.includes('want') && 
      !lowerText.includes('like to') && 
      !lowerText.includes('schedule')) {
    
    const pastTenseVerbs = ['had', 'got', 'received', 'done'];
    const serviceCategories = Array.from(servicesCache.serviceCategories || ['lashes', 'facial', 'threading', 'waxing', 'skin']);
    
    for (const verb of pastTenseVerbs) {
      for (const category of serviceCategories) {
        if (lowerText.includes(`${verb} ${category}`)) {
          return true;
        }
      }
    }
  }
  
  // Not detected as history
  return false;
}

/**
 * Detect if the user wants to reuse previous services
 */
function isReusingPreviousServices(text) {
  if (!text) return false;
  
  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();
  
  // Check for phrases indicating reuse of previous services
  const reusePhrases = [
    'same as before',
    'same service',
    'same services',
    'same treatment',
    'same thing',
    'like before',
    'like last time',
    'as before',
    'as last time',
    'again',
    'usual'
  ];
  
  for (const phrase of reusePhrases) {
    if (lowerText.includes(phrase)) {
      return true;
    }
  }
  
  // Not detected as reusing previous services
  return false;
}

/**
 * Extract service mentions from text
 */
async function extractServiceMentions(text) {
  if (!text || !servicesCache.initialized) {
    return [];
  }
  
  // Ensure services are initialized
  await initializeServicesCache();
  
  const results = [];
  const foundServiceIds = new Set();
  const lowerText = text.toLowerCase();
  
  console.log(`🔍 Extracting service mentions from: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
  
  // 1. First check for explicit service IDs
  const serviceIdPattern = /service:(\d+(?:-\d+)?)/g;
  let match;
  while ((match = serviceIdPattern.exec(text)) !== null) {
    const serviceId = `service:${match[1]}`;
    
    console.log(`🔍 Found explicit service ID: ${serviceId}`);
    
    // Skip if already found
    if (foundServiceIds.has(serviceId)) {
      continue;
    }
    
    // Find service details
    const serviceData = servicesCache.services.find(s => s.id === serviceId);
    if (serviceData) {
      results.push({
        id: serviceId,
        serviceName: serviceData.name,
        type: 'explicit-id'
      });
      foundServiceIds.add(serviceId);
    } else {
      // If we can't find details but it looks like a valid ID, include it anyway
      results.push({
        id: serviceId,
        serviceName: `Unknown Service (${serviceId})`,
        type: 'explicit-id-unknown'
      });
      foundServiceIds.add(serviceId);
    }
  }
  
  // 2. Specific service type detection with specific qualifiers
  const serviceDetectors = [
    // Lashes full set
    {
      check: (text) => {
        const match = text.match(/\b(full\s*set\s*(lashes?|extension))|((lashes?|extension)\s*full\s*set)\b/i);
        return match ? { detected: true, type: 'full-set', match: match[0] } : { detected: false };
      },
      getServices: () => servicesCache.services.filter(s => 
        s.category === 'Lashes' && s.name.toLowerCase().includes('full set')
      )
    },
    // Lashes touch up
    {
      check: (text) => {
        const match = text.match(/\b(touch\s*up\s*(lashes?|extension))|((lashes?|extension)\s*touch\s*up)\b/i);
        return match ? { detected: true, type: 'touch-up', match: match[0] } : { detected: false };
      },
      getServices: () => servicesCache.services.filter(s => 
        s.category === 'Lashes' && s.name.toLowerCase().includes('touch up')
      )
    },
    // Lashes removal
    {
      check: (text) => {
        const match = text.match(/\b(lash(es)?\s*removal)|(remove\s*lash(es)?)\b/i);
        return match ? { detected: true, type: 'removal', match: match[0] } : { detected: false };
      },
      getServices: () => servicesCache.services.filter(s => 
        s.category === 'Lashes' && s.name.toLowerCase().includes('removal')
      )
    },
    // Facial specific types
    {
      check: (text) => {
        const specificTypes = ['radiance', 'treatment', 'hydrating', 'acne'];
        for (const type of specificTypes) {
          const match = text.match(new RegExp(`\\b(${type}\\s*facial)|(facial\\s*${type})\\b`, 'i'));
          if (match) {
            return { detected: true, type: type, match: match[0] };
          }
        }
        return { detected: false };
      },
      getServices: (type) => servicesCache.services.filter(s => 
        s.category === 'Facial' && s.name.toLowerCase().includes(type)
      )
    },
    // Threading specific areas
    {
      check: (text) => {
        const areas = ['eyebrow', 'upper lip', 'lower lip', 'full face'];
        for (const area of areas) {
          const match = text.match(new RegExp(`\\b(${area.replace(/\s+/g, '\\s*')}\\s*threading)|(threading\\s*${area.replace(/\s+/g, '\\s*')})\\b`, 'i'));
          if (match) {
            return { detected: true, type: area, match: match[0] };
          }
        }
        return { detected: false };
      },
      getServices: (type) => servicesCache.services.filter(s => 
        s.category === 'Threading' && s.name.toLowerCase().includes(type)
      )
    },
    // Waxing specific areas
    {
      check: (text) => {
        const areas = ['full arm', 'half arm', 'full leg', 'half leg', 'underarm', 'full face'];
        for (const area of areas) {
          const match = text.match(new RegExp(`\\b(${area.replace(/\s+/g, '\\s*')}\\s*waxing)|(waxing\\s*${area.replace(/\s+/g, '\\s*')})|(${area.replace(/\s+/g, '\\s*')}\\s*wax)\\b`, 'i'));
          if (match) {
            return { detected: true, type: area, match: match[0] };
          }
        }
        return { detected: false };
      },
      getServices: (type) => servicesCache.services.filter(s => 
        s.category === 'Waxing' && s.name.toLowerCase().includes(type)
      )
    }
  ];
  
  // Apply each detector
  for (const detector of serviceDetectors) {
    const detection = detector.check(lowerText);
    if (detection.detected) {
      console.log(`🔍 Found specific service: "${detection.match}" (${detection.type})`);
      
      // Get relevant services
      let matchingServices = detector.getServices(detection.type);
      
      // Limit to 2 most relevant services
      if (matchingServices.length > 2) {
        matchingServices = matchingServices.slice(0, 2);
      }
      
      // Add each service to results
      for (const service of matchingServices) {
        if (!foundServiceIds.has(service.id)) {
          results.push({
            id: service.id,
            serviceName: service.name,
            type: `specific-${detection.type}`
          });
          foundServiceIds.add(service.id);
        }
      }
    }
  }
  
  // 3. Generic category matches as a fallback if nothing more specific is found
  if (results.length === 0) {
    // Check for generic service categories
    const categoryMatches = [
      { regex: /\b(lash(es)?|extension)\b/i, category: 'Lashes' },
      { regex: /\bfacial\b/i, category: 'Facial' },
      { regex: /\bthreading\b/i, category: 'Threading' },
      { regex: /\bwax(ing)?\b/i, category: 'Waxing' },
      { regex: /\bskin\b/i, category: 'Skin' }
    ];
    
    for (const { regex, category } of categoryMatches) {
      if (lowerText.match(regex)) {
        console.log(`🔍 Found generic category mention: "${category}"`);
        
        // Get the most common/popular service in this category
        const categoryServices = servicesCache.services
          .filter(service => service.category === category)
          .slice(0, 1); // Just get the first one
        
        for (const service of categoryServices) {
          if (!foundServiceIds.has(service.id)) {
            results.push({
              id: service.id,
              serviceName: service.name,
              type: 'category-match'
            });
            foundServiceIds.add(service.id);
          }
        }
      }
    }
  }
  
  return results;
}

/**
 * Tool to scan conversation messages for service mentions
 */
class ScanServicesTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "scanServices";
    this.description = "Scan conversation messages for service mentions and add them to context.";
    this.schema = ScanServicesSchema;
    
    // Store context and session for tracking
    this.context = context;
    this.sessionId = sessionId;
    
    // Initialize services cache
    initializeServicesCache();
  }
  
  async _call(inputs) {
    console.log(`🔍 scanServices tool called for session: ${this.sessionId || 'unknown'}`);
    const { message, analyzeOnly = false } = inputs;
    
    try {
      // Ensure services cache is initialized
      await initializeServicesCache();
      
      // First check if user wants to reuse previous services (check this before history check)
      if (isReusingPreviousServices(message) && 
          this.context.memory && 
          this.context.memory.last_selected_services && 
          this.context.memory.last_selected_services.length > 0) {
          
        console.log(`🔍 User wants to reuse previous services`);
        
        // Initialize detectedServiceIds if not exists
        if (!this.context.detectedServiceIds) {
          this.context.detectedServiceIds = [];
        }
        
        // Get service details for the response
        const reusedServices = [];
        for (const serviceId of this.context.memory.last_selected_services) {
          // Add to detectedServiceIds if not already there
          if (!this.context.detectedServiceIds.includes(serviceId)) {
            this.context.detectedServiceIds.push(serviceId);
            console.log(`✅ Added previously selected service ${serviceId} to detectedServiceIds`);
          }
          
          // Find service details
          const service = servicesCache.services.find(s => s.id === serviceId);
          if (service) {
            reusedServices.push({
              id: serviceId,
              serviceName: service.name,
              type: 'reused'
            });
          } else {
            // Add placeholder if service data isn't found
            reusedServices.push({
              id: serviceId,
              serviceName: `Service ${serviceId}`,
              type: 'reused'
            });
          }
        }
        
        return {
          serviceMentions: reusedServices,
          detectedServiceIds: this.context.detectedServiceIds,
          message: `Reusing ${reusedServices.length} services from last selection`,
          isReusing: true
        };
      }
      
      // Then check if this is appointment history
      if (isAppointmentHistory(message)) {
        console.log(`🔍 Message detected as appointment history - skipping service detection`);
        return {
          serviceMentions: [],
          skippedDetection: true,
          message: `Skipped service detection for appointment history data`,
          isHistory: true
        };
      }
      
      // Extract services from the message
      const serviceMentions = await extractServiceMentions(message);
      console.log(`Found ${serviceMentions.length} service mentions in message`);
      
      // Log details for debugging
      if (serviceMentions.length > 0) {
        console.log(`🔍 Service detection results:`);
        serviceMentions.forEach((service, index) => {
          console.log(`   [${index + 1}] ${service.serviceName} (${service.id}) - Match type: ${service.type}`);
        });
      }
      
      // If analyze-only mode, just return results without updating context
      if (analyzeOnly) {
        return {
          serviceMentions,
          message: `Found ${serviceMentions.length} service mentions (analyze-only mode)`
        };
      }
      
      // Initialize detectedServiceIds if it doesn't exist
      if (!this.context.detectedServiceIds) {
        this.context.detectedServiceIds = [];
      }
      
      // If this looks like a booking request (contains booking-related terms)
      // and we already have some services detected, clear existing ones
      const isNewBookingRequest = message.toLowerCase().match(/\b(book|schedule|appoint|want|like)\b/i);
      if (isNewBookingRequest && this.context.detectedServiceIds.length > 0) {
        console.log(`🔍 New booking request detected - clearing previous service selections`);
        this.context.detectedServiceIds = [];
      }
      
      // Track each service mention in context
      const trackedResults = [];
      for (const mention of serviceMentions) {
        try {
          // Track the service mention
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
      
      // Log the final state of detectedServiceIds for debugging
      console.log(`🔍 Final detectedServiceIds in context: ${JSON.stringify(this.context.detectedServiceIds)}`);
      
      // Track tool usage
      this._trackToolUsage(`Found and tracked ${serviceMentions.length} service mentions in context`);
      
      return {
        serviceMentions,
        tracked: trackedResults,
        detectedServiceIds: this.context.detectedServiceIds,
        message: `Found and tracked ${serviceMentions.length} service mentions in context`
      };
      
    } catch (error) {
      console.error('❌ Error scanning for services:', error);
      
      // Track error
      this._trackToolUsage(`Error: ${error.message}`);
      
      throw error;
    }
  }
  
  // Helper to track tool usage in context memory
  _trackToolUsage(result) {
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.scanServices) {
        this.context.memory.tool_usage.scanServices = [];
      }
      
      this.context.memory.tool_usage.scanServices.push({
        timestamp: new Date().toISOString(),
        result: result
      });
    }
  }
}

// Factory function to create tool instance
function createScanServicesTool(context, sessionId) {
  return new ScanServicesTool(context, sessionId);
}

// Initialize services at module load time
initializeServicesCache();

module.exports = {
  ScanServicesTool,
  createScanServicesTool
}; 