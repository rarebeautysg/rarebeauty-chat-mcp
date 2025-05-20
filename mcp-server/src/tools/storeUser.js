const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

/**
 * Creates a storeUser tool instance with context
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {DynamicStructuredTool} - The storeUser tool instance
 */
function createStoreUserTool(context, sessionId) {
  // Define schema using zod
  const StoreUserSchema = z.object({
    name: z.string().describe("User's name"),
    mobile: z.string().describe("User's mobile phone number"),
    resourceName: z.string().optional().describe("User's resource name (e.g., 'people/C123')"),
    email: z.string().optional().describe("User's email address")
  });

  // Create and return the tool
  return new DynamicStructuredTool({
    name: "storeUser",
    description: "Store user information in chat context",
    schema: StoreUserSchema,
    func: async (input) => {
      const { name, mobile, resourceName, email } = input;
      console.log('📝 Storing user context:', { name, mobile, resourceName, email });
      
      try {
        // Update the context directly
        if (context && context.memory) {
          context.memory.user_info = {
            name,
            mobile,
            resourceName,
            email,
            updatedAt: new Date().toISOString()
          };
          
          // Update identity if resourceName is provided
          if (resourceName) {
            if (!context.memory.identity) {
              context.memory.identity = {};
            }
            context.memory.identity.user_id = resourceName;
            context.memory.identity.persona = "returning_customer";
          }
          
          // Track tool usage
          if (!context.memory.tool_usage) {
            context.memory.tool_usage = {};
          }
          
          if (!context.memory.tool_usage.storeUser) {
            context.memory.tool_usage.storeUser = [];
          }
          
          context.memory.tool_usage.storeUser.push({
            timestamp: new Date().toISOString(),
            params: { name, mobile, resourceName, email },
            result: { success: true }
          });
          
          console.log(`✅ Successfully stored user info in context for session ${sessionId}`);
        }
        
        // Return success with the stored data
        return JSON.stringify({
          success: true,
          message: "User information stored successfully",
          userContext: { name, mobile, resourceName, email }
        });
      } catch (error) {
        console.error('❌ Error storing user context:', error);
        return JSON.stringify({
          success: false,
          error: "Failed to store user information"
        });
      }
    }
  });
}

module.exports = { createStoreUserTool }; 