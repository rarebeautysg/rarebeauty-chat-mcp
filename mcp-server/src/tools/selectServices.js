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
    description: "Store selected services (IDs or names) for booking.",
    parameters: {
      type: "object",
      properties: {
        selected: {
          type: "array",
          description: "List of selected services objects with id and name",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The exact service ID (e.g. service:2 or services:2-2024)"
              },
              name: {
                type: "string",
                description: "The display name or description of the service (e.g. Lashes-Dense)"
              }
            },
            required: ["id", "name"]
          }
        },
        serviceIds: {
          type: "array",
          description: "List of service IDs to select",
          items: {
            type: "string"
          }
        },
        serviceNames: {
          type: "array", 
          description: "List of service names to select (will be mapped to IDs automatically)",
          items: {
            type: "string"
          }
        }
      }
    },
    _call: async function (args) {
      let selectedServices = [];
      let unmatchedServices = [];
      
      // Handle all parameter formats
      if (args.selected) {
        // Format: { selected: [{ id: "service:1", name: "Service Name" }, ...] }
        selectedServices = args.selected;
        console.log(`📋 Processing services from 'selected' parameter:`, selectedServices);
      } 
      else if (args.serviceIds) {
        // Format: { serviceIds: ["service:1", "service:2", ...] }
        const serviceIds = args.serviceIds;
        console.log(`📋 Processing services from 'serviceIds' parameter:`, serviceIds);
        
        // Get service details for each ID
        for (const id of serviceIds) {
          try {
            const service = await getServiceById(id);
            if (service) {
              selectedServices.push({
                id: id,
                name: service.name || `Service ${id}`
              });
            } else {
              console.warn(`⚠️ Service with ID ${id} not found`);
              // Add to unmatched services
              unmatchedServices.push(id);
            }
          } catch (err) {
            console.error(`❌ Error getting service info for ${id}:`, err);
            // Add to unmatched services
            unmatchedServices.push(id);
          }
        }
      }
      else if (args.serviceNames) {
        // New format: { serviceNames: ["Lashes Natural", "Facial Treatment", ...] }
        const serviceNames = args.serviceNames;
        console.log(`📋 Processing services from 'serviceNames' parameter:`, serviceNames);
        
        // Get all services for mapping
        const allServices = await getAllFormattedServices();
        
        // Process each service name
        for (const name of serviceNames) {
          if (!name || typeof name !== 'string' || name.trim() === '') {
            continue;
          }
          
          const trimmedName = name.trim();
          let matched = false;
          
          // Try direct match first
          const exactMatch = allServices.find(s => 
            s.name.toLowerCase() === trimmedName.toLowerCase()
          );
          
          if (exactMatch) {
            console.log(`✅ Exact match found for "${trimmedName}": ${exactMatch.name} (${exactMatch.id})`);
            selectedServices.push({
              id: exactMatch.id,
              name: exactMatch.name
            });
            matched = true;
            continue;
          }
          
          // Try partial name matching (service name contains the input)
          if (!matched) {
            const partialMatches = allServices.filter(s => 
              s.name.toLowerCase().includes(trimmedName.toLowerCase()) ||
              trimmedName.toLowerCase().includes(s.name.toLowerCase())
            );
            
            if (partialMatches.length > 0) {
              const bestMatch = partialMatches[0];
              console.log(`✅ Partial match found for "${trimmedName}": ${bestMatch.name} (${bestMatch.id})`);
              selectedServices.push({
                id: bestMatch.id,
                name: bestMatch.name
              });
              matched = true;
              continue;
            }
          }
          
          // Try category keyword matching if no exact or partial match
          const categoryKeywords = {
            "Lashes": ["lash", "eyelash", "lashes", "dense", "natural", "volume", "russian"],
            "Facial": ["facial", "face", "treatment", "skin", "acne", "hydra"],
            "Threading": ["thread", "brow", "eyebrow", "threading"],
            "Waxing": ["wax", "hair", "removal"]
          };
          
          for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (matched) break;
            
            // Check if service name contains any category keyword
            const hasKeyword = keywords.some(keyword => 
              trimmedName.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (hasKeyword) {
              // Get services in this category
              const categoryServices = allServices.filter(s => s.category === category);
              
              if (categoryServices.length > 0) {
                // Find the best matching service in this category
                let bestMatch = categoryServices[0];
                let bestScore = 0;
                
                // Simple word matching score
                for (const service of categoryServices) {
                  const serviceWords = service.name.toLowerCase().split(/\s+/);
                  const nameWords = trimmedName.toLowerCase().split(/\s+/);
                  
                  let score = 0;
                  for (const nameWord of nameWords) {
                    if (nameWord.length <= 2) continue; // Skip short words
                    
                    for (const serviceWord of serviceWords) {
                      if (serviceWord.includes(nameWord) || nameWord.includes(serviceWord)) {
                        score += 1;
                      }
                    }
                  }
                  
                  if (score > bestScore) {
                    bestScore = score;
                    bestMatch = service;
                  }
                }
                
                console.log(`✅ Category match found for "${trimmedName}": ${bestMatch.name} (${bestMatch.id})`);
                
                selectedServices.push({
                  id: bestMatch.id,
                  name: bestMatch.name
                });
                matched = true;
              }
            }
          }
          
          // If still not matched, do basic word matching
          if (!matched) {
            const words = trimmedName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            
            for (const service of allServices) {
              if (matched) break;
              
              const serviceNameLower = service.name.toLowerCase();
              for (const word of words) {
                if (serviceNameLower.includes(word)) {
                  console.log(`✅ Word match found for "${trimmedName}": ${service.name} (${service.id})`);
                  
                  selectedServices.push({
                    id: service.id,
                    name: service.name
                  });
                  matched = true;
                  break;
                }
              }
            }
          }
          
          // If still no match, add to unmatched services
          if (!matched) {
            console.log(`⚠️ No match found for service name: "${trimmedName}"`);
            unmatchedServices.push(trimmedName);
          }
        }
      }
      else {
        console.error('❌ No services provided to selectServices tool');
        return { selected: [], unmatched: [] };
      }
      
      // Remove duplicates (same ID)
      const uniqueIds = new Set();
      selectedServices = selectedServices.filter(service => {
        if (uniqueIds.has(service.id)) {
          return false;
        }
        uniqueIds.add(service.id);
        return true;
      });
      
      console.log(`📋 Selected services for session ${sessionId}:`, selectedServices);
      if (unmatchedServices.length > 0) {
        console.log(`⚠️ Unmatched services: ${unmatchedServices.join(', ')}`);
      }
      
      // Store in context memory
      if (context && context.memory) {
        context.memory.last_selected_services = selectedServices.map(service => service.id);
        
        // Also store full service details
        context.memory.selected_services_details = selectedServices;
        
        // Store unmatched services for reference
        context.memory.unmatched_services = unmatchedServices;
      }
      
      // Return both matched and unmatched services to be used by the caller
      return { 
        selected: selectedServices,
        unmatched: unmatchedServices
      };
    }
  };
}

module.exports = {
  createSelectServicesTool
}; 