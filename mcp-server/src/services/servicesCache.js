/**
 * Services Cache - Maintains a cache of services for use in system prompts
 * This avoids needing to fetch services on each prompt generation
 */

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

// In-memory cache of services
let servicesCache = [];
let lastCacheUpdate = null;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// Get Soho auth token
const SOHO_AUTH_TOKEN = process.env.SOHO_AUTH_TOKEN;
const SOHO_API_URL = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';

/**
 * Fetch services from the SOHO API using GraphQL
 * @returns {Promise<Array>} Array of services
 */
async function fetchServicesFromSoho() {
  if (!SOHO_AUTH_TOKEN) {
    console.error('❌ No SOHO_AUTH_TOKEN provided, cannot fetch services');
    return [];
  }

  try {
    console.log('🔄 Fetching services from SOHO API...');
    
    const query = {
      query: `
        {
          services {
            id,
            service,
            duration,
            price,
            followUp,
            count,
            enabled
          }
        }
      `
    };
    
    const response = await axios.post(SOHO_API_URL, query, {
      headers: {
        'Authorization': SOHO_AUTH_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.data && Array.isArray(response.data.data.services)) {
      const services = response.data.data.services;
      // Filter only enabled services
      const enabledServices = services.filter(service => 
        service.enabled === true && 
        !service.service.startsWith("(2021)") && 
        !service.service.startsWith("Old ")
      );
      console.log(`✅ Successfully fetched ${enabledServices.length} services from SOHO API`);
      return enabledServices;
    }

    console.error('❌ Invalid response format from SOHO API:', response.data);
    return [];
  } catch (error) {
    console.error('❌ Error fetching services from SOHO API:', error.message);
    return [];
  }
}

/**
 * Process raw services into a format suitable for the system prompt
 * @param {Array} rawServices - Raw services from the API
 * @returns {Array} Processed services
 */
function processServices(rawServices) {
  if (!rawServices || !Array.isArray(rawServices)) {
    return [];
  }

  return rawServices.map(service => {
    return {
      id: service.id || service.resourceName,
      name: service.service || 'Unknown Service',
      description: service.service || 'Unknown Service',
      category: getCategoryFromServiceName(service.service) || 'Other',
      price: service.price || 0,
      duration: service.duration || 0
    };
  });
}

/**
 * Extract category from service name
 * @param {string} serviceName - Service name
 * @returns {string} Category
 */
function getCategoryFromServiceName(serviceName) {
  if (!serviceName) return 'Other';
  
  if (serviceName.startsWith('Lashes')) {
    return 'Lashes';
  } else if (serviceName.startsWith('Facial')) {
    return 'Facial';
  } else if (serviceName.startsWith('Threading')) {
    return 'Threading';
  } else if (serviceName.startsWith('Waxing')) {
    return 'Waxing';
  } else if (serviceName.startsWith('Skin')) {
    return 'Skin';
  }
  
  return 'Other';
}

/**
 * Initialize the services cache
 * This should be called at startup to ensure the cache is warm
 */
async function initializeServicesCache() {
  try {
    const rawServices = await fetchServicesFromSoho();
    const processedServices = processServices(rawServices);
    
    servicesCache = processedServices;
    lastCacheUpdate = Date.now();
    
    console.log(`✅ Processed ${processedServices.length} services into formatted cache`);
    return processedServices;
  } catch (error) {
    console.error('❌ Error initializing services cache:', error);
    return [];
  }
}

/**
 * Get services from cache, refreshing if needed
 * @returns {Promise<Array>} Array of services
 */
async function getServicesCache() {
  // If cache is empty or stale, refresh it
  if (servicesCache.length === 0 || !lastCacheUpdate || (Date.now() - lastCacheUpdate > CACHE_TTL)) {
    console.log('🔄 Services cache empty or expired, refreshing...');
    await initializeServicesCache();
  }
  
  return servicesCache;
}

// Call initializeServicesCache on module load
initializeServicesCache().catch(err => {
  console.error('❌ Failed to initialize services cache:', err);
});

module.exports = {
  getServicesCache,
  initializeServicesCache
}; 