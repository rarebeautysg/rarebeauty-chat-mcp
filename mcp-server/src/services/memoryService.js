/**
 * Memory Service - Handles context memory storage and retrieval
 * Provides a unified interface for memory storage with AWS DynamoDB support
 * Primary key is resourceName for user-centric storage
 */
const DynamoDBMemory = require('../lib/dynamodb-memory');

// In-memory fallback for when DynamoDB is not configured
const inMemoryStorage = new Map();

// Session to resource mapping for temporary session handling
const sessionToResourceMap = new Map();

class MemoryService {
  constructor() {
    this.isUsingDynamo = process.env.USE_DYNAMODB === 'true';
    this.dynamoOptions = {
      tableName: process.env.DYNAMODB_TABLE || 'rare-beauty-context-memory',
      region: process.env.AWS_REGION || 'ap-southeast-1',
      endpoint: process.env.DYNAMODB_ENDPOINT // For local development
    };

    // Initialize DynamoDB adapter if enabled
    if (this.isUsingDynamo) {
      try {
        this.dynamoAdapter = new DynamoDBMemory(this.dynamoOptions);
        console.log('✅ Initialized DynamoDB memory adapter');
        
        // Ensure the table exists
        this.dynamoAdapter.ensureTable()
          .then(() => console.log('✅ DynamoDB table is ready'))
          .catch(err => {
            console.error('❌ Error ensuring DynamoDB table exists:', err);
            console.log('⚠️ Falling back to in-memory storage');
            this.isUsingDynamo = false;
          });
      } catch (error) {
        console.error('❌ Error initializing DynamoDB adapter:', error);
        console.log('⚠️ Falling back to in-memory storage');
        this.isUsingDynamo = false;
      }
    } else {
      console.log('ℹ️ Using in-memory storage for context memory');
    }
  }

  /**
   * Extract resourceName from memory object or use provided resourceName
   * @param {Object} memory Memory object
   * @param {string} defaultResourceName Default resourceName to use if not found in memory
   * @returns {string|null} The resourceName or null
   */
  extractResourceName(memory, defaultResourceName = null) {
    if (!memory) {
      console.log('ℹ️ Memory object is null or undefined');
      return defaultResourceName;
    }
    
    // Check memory.identity.user_id
    if (memory?.identity?.user_id) {
      console.log(`📋 Found resourceName in memory.identity.user_id: ${memory.identity.user_id}`);
      return memory.identity.user_id;
    }
    
    // Check memory.memory.user_info.resourceName
    if (memory?.memory?.user_info?.resourceName) {
      console.log(`📋 Found resourceName in memory.memory.user_info.resourceName: ${memory.memory.user_info.resourceName}`);
      return memory.memory.user_info.resourceName;
    }
    
    // Check user_info directly if memory is flattened
    if (memory?.user_info?.resourceName) {
      console.log(`📋 Found resourceName in memory.user_info.resourceName: ${memory.user_info.resourceName}`);
      return memory.user_info.resourceName;
    }
    
    // Check the resourceName property directly
    if (memory?.resourceName) {
      console.log(`📋 Found resourceName in memory.resourceName: ${memory.resourceName}`);
      return memory.resourceName;
    }
    
    // Log and return default if not found
    if (defaultResourceName) {
      console.log(`ℹ️ Using default resourceName: ${defaultResourceName}`);
    } else {
      console.log('⚠️ No resourceName found in memory, searched:');
      console.log('  - memory.identity.user_id');
      console.log('  - memory.memory.user_info.resourceName');
      console.log('  - memory.user_info.resourceName');
      console.log('  - memory.resourceName');
    }
    
    return defaultResourceName;
  }

  /**
   * Get memory by sessionId - tries to find associated resourceName first
   * @param {string} sessionId 
   * @returns {Promise<Object>} The memory object
   */
  async getMemory(sessionId) {
    if (!sessionId) {
      console.warn('⚠️ No sessionId provided to getMemory');
      return {};
    }

    // Check if this session is associated with a resourceName
    const resourceName = sessionToResourceMap.get(sessionId);
    
    if (resourceName) {
      // If we have a resourceName, use that to fetch memory
      return this.getMemoryByResourceName(resourceName);
    }
    
    // No resourceName found for this session
    console.log(`No resourceName found for session ${sessionId}`);
    return {};
  }

  /**
   * Get memory by resourceName (customer identifier)
   * @param {string} resourceName 
   * @returns {Promise<Object>} The memory object
   */
  async getMemoryByResourceName(resourceName) {
    if (!resourceName) {
      console.warn('⚠️ No resourceName provided to getMemoryByResourceName');
      return {};
    }
    
    if (this.isUsingDynamo && this.dynamoAdapter) {
      return await this.dynamoAdapter.getMemory(resourceName);
    } else {
      return inMemoryStorage.get(resourceName) || {};
    }
  }

  /**
   * Save memory - resourceName is required
   * @param {string} sessionId Current session ID (will be stored in memory)
   * @param {string} resourceName Customer identifier
   * @param {Object} memory Memory data to save
   * @returns {Promise<boolean>} Success indicator
   */
  async saveMemoryByResourceName(sessionId, resourceName, memory) {
    if (!resourceName) {
      console.warn('⚠️ No resourceName provided to saveMemoryByResourceName');
      return false;
    }
    
    // Map session to resourceName for future lookups
    if (sessionId) {
      sessionToResourceMap.set(sessionId, resourceName);
      console.log(`🔗 Associated sessionId ${sessionId} with resourceName ${resourceName}`);
      
      // Add sessionId to memory for reference
      memory.lastSessionId = sessionId;
    }
    
    // Store by resourceName
    if (this.isUsingDynamo && this.dynamoAdapter) {
      return await this.dynamoAdapter.saveMemory(resourceName, memory);
    } else {
      inMemoryStorage.set(resourceName, memory);
      return true;
    }
  }

  /**
   * Save memory - extracts resourceName from memory object
   * @param {string} sessionId Current session ID
   * @param {Object} memory Memory data to save (must contain resourceName identifiers)
   * @returns {Promise<boolean>} Success indicator
   */
  async saveMemory(sessionId, memory) {
    if (!sessionId && !memory) {
      console.warn('⚠️ No sessionId or memory provided to saveMemory');
      return false;
    }

    console.log(`🔍 DEBUG: Saving memory for session: ${sessionId}`);
    console.log(`🔍 Memory keys available: ${Object.keys(memory).join(', ')}`);
    
    // Try to find resourceName in the memory
    const resourceName = this.extractResourceName(memory);
    
    // If we have a resourceName, use it as the primary storage key
    if (resourceName) {
      return this.saveMemoryByResourceName(sessionId, resourceName, memory);
    }
    
    // If we don't have a resourceName in the memory object, but we know it from session mapping
    const mappedResourceName = sessionToResourceMap.get(sessionId);
    if (mappedResourceName) {
      console.log(`📋 Using mapped resourceName ${mappedResourceName} from session mapping`);
      
      // Update memory with the resourceName to ensure it's saved properly
      if (!memory.identity) {
        memory.identity = {};
      }
      memory.identity.user_id = mappedResourceName;
      
      return this.saveMemoryByResourceName(sessionId, mappedResourceName, memory);
    }
    
    // No resourceName found, cannot save
    console.warn(`⚠️ No resourceName found in memory or session mapping, cannot save for session ${sessionId}`);
    return false;
  }

  /**
   * Update memory - finds and extracts resourceName
   * @param {string} sessionId Current session ID
   * @param {Object} updates Updates to apply to memory
   * @returns {Promise<boolean>} Success indicator
   */
  async updateMemory(sessionId, updates) {
    if (!sessionId && !updates) {
      console.warn('⚠️ No sessionId or updates provided to updateMemory');
      return false;
    }

    // Try to find resourceName in updates or session mapping
    let resourceName = this.extractResourceName(updates);
    
    // If not found in updates, check session mapping
    if (!resourceName) {
      resourceName = sessionToResourceMap.get(sessionId);
    }

    if (!resourceName) {
      console.warn('⚠️ No resourceName found for updates, cannot update memory');
      return false;
    }

    // Update the session mapping
    if (sessionId) {
      sessionToResourceMap.set(sessionId, resourceName);
      console.log(`🔗 Using resourceName ${resourceName} for updates from session ${sessionId}`);
    }
    
    // Get existing memory by resourceName
    const currentMemory = await this.getMemoryByResourceName(resourceName);
    
    // Merge updates with current memory
    const updatedMemory = {
      ...currentMemory,
      ...updates,
      lastSessionId: sessionId // Always update the session ID
    };
    
    // Save using resourceName
    return this.saveMemoryByResourceName(sessionId, resourceName, updatedMemory);
  }

  /**
   * Get sessionId associated with a resourceName
   * @param {string} resourceName 
   * @returns {string|null} The most recent session ID
   */
  getSessionIdByResourceName(resourceName) {
    if (!resourceName) return null;
    
    // Check session mappings
    for (const [sessionId, resource] of sessionToResourceMap.entries()) {
      if (resource === resourceName) {
        return sessionId;
      }
    }
    
    return null;
  }

  /**
   * Delete memory by resourceName
   * @param {string} resourceName Customer identifier
   * @returns {Promise<boolean>} Success indicator
   */
  async deleteMemory(resourceName) {
    if (!resourceName) {
      console.warn('⚠️ No resourceName provided to deleteMemory');
      return false;
    }

    // Delete any associated sessions
    for (const [sessionId, resource] of sessionToResourceMap.entries()) {
      if (resource === resourceName) {
        sessionToResourceMap.delete(sessionId);
      }
    }
    
    // Delete the memory
    if (this.isUsingDynamo && this.dynamoAdapter) {
      return await this.dynamoAdapter.deleteMemory(resourceName);
    } else {
      return inMemoryStorage.delete(resourceName);
    }
  }

  /**
   * List all memories with their associated sessions
   * @returns {Promise<Array>} Array of memory entries
   */
  async listMemories() {
    if (this.isUsingDynamo && this.dynamoAdapter) {
      return await this.dynamoAdapter.listSessions();
    } else {
      // Create list from in-memory storage
      return Array.from(inMemoryStorage.entries()).map(([resourceName, data]) => {
        return {
          resourceName,
          updatedAt: data.updatedAt || new Date().toISOString(),
          sessionId: data.lastSessionId || null
        };
      });
    }
  }

  /**
   * Get all session to resource mappings
   * @returns {Object} Map of sessionId to resourceName
   */
  listResourceNameMappings() {
    const result = {};
    
    for (const [sessionId, resourceName] of sessionToResourceMap.entries()) {
      result[sessionId] = resourceName;
    }
    
    return result;
  }

  // Also export the session-to-resource mapping for direct access by tools
  setSessionToResourceMapping(sessionId, resourceName) {
    if (!sessionId || !resourceName) return false;
    sessionToResourceMap.set(sessionId, resourceName);
    console.log(`🔗 [Memory Service] Mapped session ${sessionId} to resourceName ${resourceName}`);
    return true;
  }
}

// Export a singleton instance
const memoryService = new MemoryService();

module.exports = memoryService;