/**
 * Tool for storing selected services in memory for booking
 */
const { getServiceById, getAllFormattedServices } = require('./listServices');

/**
 * Create a selectServices tool instance
 * @param {Object} context - The MCP context 
 * @param {string} sessionId - The session ID
 * @returns {Object} - The tool instance
 */
function createSelectServicesTool(context, sessionId) {
  return {
    name: "selectServices",
    description: "getting english service names and returning the service ids",
    parameters: {
      type: "object",
      properties: {
        serviceNames: {
          type: "array", 
          description: "List of service names that has been selected by the user",
          items: {
            type: "string"
          }
        },
        services: {
          type: "array", 
          description: "Alternative parameter name for service names that has been selected by the user",
          items: {
            type: "string"
          }
        }
      }
    },
    _call: async function (args) {
      let selectedServices = [];
      let unmatchedServices = [];
      
      // Get all services for matching
      const allServices = await getAllFormattedServices();
      console.log(`📋 Working with ${allServices.length} available services`);
      
      // Process whatever input we received (serviceIds, serviceNames, or services)
      const servicesToProcess = args.serviceIds || args.serviceNames || args.services || [];
      
      if (servicesToProcess.length === 0) {
        console.warn('⚠️ No services provided to selectServices tool');
        console.warn('Available parameters:', Object.keys(args));
        return { selected: [], unmatched: [] };
      }
      
      console.log(`📋 Processing services:`, servicesToProcess);
      
      // Process each service name/id
      for (const input of servicesToProcess) {
        if (!input || typeof input !== 'string' || input.trim() === '') {
          continue;
        }
        
        const trimmedInput = input.trim();
        
        // Check if this is an actual ID (e.g., "service:123")
        if (trimmedInput.startsWith('service:')) {
          try {
            const service = await getServiceById(trimmedInput);
            if (service) {
              selectedServices.push({
                id: trimmedInput,
                name: service.name
              });
              console.log(`✅ Service ID found: ${trimmedInput} (${service.name})`);
              continue;
            }
          } catch (err) {
            console.error(`❌ Error getting service by ID:`, err);
          }
        }
        
        // If not an ID or ID lookup failed, try to match by name
        // First try exact match
        const exactMatch = allServices.find(s => 
          s.name.toLowerCase() === trimmedInput.toLowerCase()
        );
        
        if (exactMatch) {
          selectedServices.push({
            id: exactMatch.id,
            name: exactMatch.name
          });
          console.log(`✅ Exact match: "${trimmedInput}" → ${exactMatch.name} (${exactMatch.id})`);
          continue;
        }
        
        // Then try partial match
        const partialMatches = allServices.filter(s => 
          s.name.toLowerCase().includes(trimmedInput.toLowerCase()) ||
          trimmedInput.toLowerCase().includes(s.name.toLowerCase())
        );
        
        if (partialMatches.length > 0) {
          const bestMatch = partialMatches[0];
          selectedServices.push({
            id: bestMatch.id,
            name: bestMatch.name
          });
          console.log(`✅ Partial match: "${trimmedInput}" → ${bestMatch.name} (${bestMatch.id})`);
          continue;
        }
        
        // If still no match, try word-based matching for better fuzzy matching
        const inputWords = trimmedInput.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 1);
        if (inputWords.length > 0) {
          const wordMatches = allServices.filter(s => {
            const serviceWords = s.name.toLowerCase().split(/[\s\-_]+/);
            // Check if all input words appear in the service name
            return inputWords.every(inputWord => 
              serviceWords.some(serviceWord => 
                serviceWord.includes(inputWord) || inputWord.includes(serviceWord)
              )
            );
          });
          
          if (wordMatches.length > 0) {
            const bestMatch = wordMatches[0];
            selectedServices.push({
              id: bestMatch.id,
              name: bestMatch.name
            });
            console.log(`✅ Word-based match: "${trimmedInput}" → ${bestMatch.name} (${bestMatch.id})`);
            console.log(`   Matched words: ${inputWords.join(', ')}`);
            continue;
          }
        }
        
        // If still no match, add to unmatched services
        console.log(`❌ No match found for: "${trimmedInput}"`);
        unmatchedServices.push(trimmedInput);
      }
      
      // Remove duplicates
      const uniqueSelectedServices = [];
      const seenIds = new Set();
      
      for (const service of selectedServices) {
        if (!seenIds.has(service.id)) {
          uniqueSelectedServices.push(service);
          seenIds.add(service.id);
        }
      }
      
      console.log(`📋 Final selected services (${uniqueSelectedServices.length}):`, 
        uniqueSelectedServices.map(s => `${s.name} (${s.id})`).join(', '));
      
      // Store in context memory
      if (context && context.memory) {
        // Store just the IDs in last_selected_services for backward compatibility
        context.memory.last_selected_services = uniqueSelectedServices.map(service => service.id);
        
        // Store full service details
        context.memory.selected_services_details = uniqueSelectedServices;
        
        console.log(`🔄 SERVICES STORED IN MEMORY: ${uniqueSelectedServices.map(s => s.name).join(', ')}`);
        
        // Store unmatched services
        if (unmatchedServices.length > 0) {
          context.memory.unmatched_services = unmatchedServices;
          console.log(`⚠️ Unmatched services: ${unmatchedServices.join(', ')}`);
        }
      }
      
      // IMPORTANT: Also add selected service IDs to detectedServiceIds array
      // Initialize detectedServiceIds array if it doesn't exist
      if (!context.detectedServiceIds) {
        context.detectedServiceIds = [];
        console.log('✅ Initialized detectedServiceIds array in selectServices');
      }
      
      // Add selected service IDs to detectedServiceIds
      for (const service of uniqueSelectedServices) {
        if (!context.detectedServiceIds.includes(service.id)) {
          context.detectedServiceIds.push(service.id);
          console.log(`✅ Service ID "${service.id}" added to detectedServiceIds from selectServices`);
        } else {
          console.log(`ℹ️ Service ID "${service.id}" already in detectedServiceIds`);
        }
      }
      
      console.log(`🔍 Updated detectedServiceIds: ${JSON.stringify(context.detectedServiceIds)}`);
      
      return { 
        selected: uniqueSelectedServices,
        unmatched: unmatchedServices
      };
    }
  };
}

module.exports = {
  createSelectServicesTool
}; 