const { DynamoDB, DescribeTableCommand, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');

/**
 * Context memory adapter that uses AWS DynamoDB for persistence
 * Uses resourceName as the primary key
 */
class DynamoDBMemory {
  /**
   * Initialize DynamoDB memory adapter
   * @param {Object} options Configuration options
   * @param {string} options.tableName DynamoDB table name for context memory
   * @param {string} options.region AWS region (default: 'ap-southeast-1')
   * @param {string} options.endpoint Custom endpoint for local development
   */
  constructor(options = {}) {
    this.tableName = options.tableName || 'rare-beauty-context-memory';
    
    // Initialize DynamoDB client
    const clientOptions = {
      region: options.region || 'ap-southeast-1',
    };
    
    // For local development with DynamoDB local
    if (options.endpoint) {
      clientOptions.endpoint = options.endpoint;
    }
    
    this.client = new DynamoDB(clientOptions);
    this.docClient = DynamoDBDocument.from(this.client);
    
    console.log(`📝 Initialized DynamoDB memory adapter with table: ${this.tableName}`);
  }
  
  /**
   * Ensure the DynamoDB table exists, creating it if necessary
   * @returns {Promise<void>}
   */
  async ensureTable() {
    try {
      // Check if table exists
      await this.client.send(new DescribeTableCommand({
        TableName: this.tableName
      }));
      console.log(`✅ DynamoDB table ${this.tableName} exists`);
      return;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        console.error('❌ Error checking DynamoDB table:', error);
        throw error;
      }
      
      // Table doesn't exist, create it
      try {
        console.log(`🔄 Creating DynamoDB table ${this.tableName}...`);
        await this.client.send(new CreateTableCommand({
          TableName: this.tableName,
          KeySchema: [
            { AttributeName: 'resourceName', KeyType: 'HASH' }
          ],
          AttributeDefinitions: [
            { AttributeName: 'resourceName', AttributeType: 'S' }
          ],
          BillingMode: 'PAY_PER_REQUEST'
        }));
        
        // Wait for table to be active
        let tableActive = false;
        while (!tableActive) {
          const response = await this.client.send(new DescribeTableCommand({
            TableName: this.tableName
          }));
          tableActive = response.Table.TableStatus === 'ACTIVE';
          if (!tableActive) {
            console.log(`⏳ Waiting for table ${this.tableName} to be active...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        console.log(`✅ Created DynamoDB table ${this.tableName}`);
      } catch (createError) {
        console.error('❌ Error creating DynamoDB table:', createError);
        throw createError;
      }
    }
  }
  
  /**
   * Get context memory using resourceName
   * @param {string} resourceName The resource name to use
   * @returns {Promise<Object>} The context memory or empty object if not found
   */
  async getMemory(resourceName) {
    try {
      const response = await this.docClient.get({
        TableName: this.tableName,
        Key: { resourceName }
      });
      
      // Return memory data or empty object
      return response.Item?.data || {};
    } catch (error) {
      console.error(`❌ Error getting memory for resourceName ${resourceName}:`, error);
      return {};
    }
  }
  
  /**
   * Save context memory
   * @param {string} resourceName The resource name to use
   * @param {Object} memory The memory data to save
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveMemory(resourceName, memory) {
    try {
      await this.docClient.put({
        TableName: this.tableName,
        Item: {
          resourceName,
          data: memory,
          updatedAt: new Date().toISOString()
        }
      });
      
      return true;
    } catch (error) {
      console.error(`❌ Error saving memory for resourceName ${resourceName}:`, error);
      return false;
    }
  }
  
  /**
   * Delete context memory
   * @param {string} resourceName The resource name to use
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteMemory(resourceName) {
    try {
      await this.docClient.delete({
        TableName: this.tableName,
        Key: { resourceName }
      });
      
      return true;
    } catch (error) {
      console.error(`❌ Error deleting memory for resourceName ${resourceName}:`, error);
      return false;
    }
  }
  
  /**
   * List all memories with their last update time
   * @returns {Promise<Array>} Array of objects with resourceName and updatedAt
   */
  async listSessions() {
    try {
      const response = await this.docClient.scan({
        TableName: this.tableName,
        ProjectionExpression: 'resourceName, updatedAt, #data.lastSessionId, #data.identity.user_id',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      });
      
      // Process items to extract resource names where available
      return (response.Items || []).map(item => {
        const result = {
          resourceName: item.resourceName,
          updatedAt: item.updatedAt
        };
        
        // If data contains lastSessionId, add it
        if (item.data?.lastSessionId) {
          result.sessionId = item.data.lastSessionId;
        }
        
        return result;
      });
    } catch (error) {
      console.error('❌ Error listing memories:', error);
      return [];
    }
  }
}

module.exports = DynamoDBMemory; 