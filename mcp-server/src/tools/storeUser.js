const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

// Define schema using zod
const StoreUserSchema = z.object({
  name: z.string().describe("User's name"),
  mobile: z.string().describe("User's mobile phone number"),
  resourceName: z.string().optional().describe("User's resource name (e.g., 'people/C123')"),
  email: z.string().optional().describe("User's email address")
});

// Create and export the tool
const storeUserTool = new DynamicStructuredTool({
  name: "storeUser",
  description: "Store user information in chat context",
  schema: StoreUserSchema,
  func: async (input) => {
    const { name, mobile, resourceName, email } = input;
    console.log('📝 Storing user context:', { name, mobile, resourceName, email });
    
    try {
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

module.exports = { storeUserTool }; 