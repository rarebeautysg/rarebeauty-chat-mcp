const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");

// Define the schema for the search tool
const SearchCustomersSchema = z.object({
  name: z.string().describe("Customer's name or partial name to search for"),
  limit: z.number().optional().describe("Maximum number of results to return (default: 10)")
});

class SearchCustomersTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "searchCustomers";
    this.description = "Search for customers by name using the SOHO API";
    this.schema = SearchCustomersSchema;
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call({ name, limit = 10 }) {
    console.log(`🔍 SEARCH CUSTOMERS TOOL TRIGGERED 🔍`);
    console.log(`📝 Searching for customers with name: "${name}"`);
    console.log(`📊 Limit: ${limit}`);
    console.log(`🔄 Session ID: ${this.sessionId}`);

    // Check if this is a numbered selection from previous results
    const trimmedName = name.trim();
    const isNumber = /^\d+$/.test(trimmedName);
    
    if (isNumber) {
      const selectedIndex = parseInt(trimmedName, 10);
      console.log(`🔢 Detected numbered selection: ${selectedIndex}`);
      
      // Check if we have previous search results stored
      const previousResults = this.context?.memory?.tool_usage?.searchCustomers_lastResults;
      
      if (previousResults && Array.isArray(previousResults) && previousResults.length > 0) {
        console.log(`📋 Found ${previousResults.length} previous search results`);
        
        // Debug: Log all stored results with their indices
        console.log(`🔍 Previous results stored in context:`);
        previousResults.forEach((customer, index) => {
          console.log(`  ${index + 1}. ${customer.name} - ${customer.mobile} (resourceName: ${customer.resourceName})`);
        });
        
        // Check if the selected number is valid (1-based indexing)
        if (selectedIndex >= 1 && selectedIndex <= previousResults.length) {
          const selectedCustomer = previousResults[selectedIndex - 1];
          console.log(`✅ User selected index ${selectedIndex}, accessing array index ${selectedIndex - 1}`);
          console.log(`✅ Selected customer: ${selectedCustomer.name} (${selectedCustomer.mobile})`);
          console.log(`✅ Customer resourceName: ${selectedCustomer.resourceName}`);
          
          // Update user_info in context with selected customer
          if (this.context?.memory) {
            this.context.memory.user_info = {
              resourceName: selectedCustomer.resourceName,
              name: selectedCustomer.name,
              mobile: selectedCustomer.mobile,
              updatedAt: new Date().toISOString()
            };
            
            // Update identity as well
            if (!this.context.identity) {
              this.context.identity = {};
            }
            this.context.identity.user_id = selectedCustomer.resourceName;
            this.context.identity.persona = "returning_customer";
            
            console.log(`💾 Updated context with selected customer: ${selectedCustomer.name}`);
          }
          
          // Clear the previous results since we've made a selection
          if (this.context?.memory?.tool_usage) {
            delete this.context.memory.tool_usage.searchCustomers_lastResults;
          }
          
          return JSON.stringify({
            success: true,
            message: `Selected customer: ${selectedCustomer.name}`,
            selectedCustomer: {
              name: selectedCustomer.name,
              mobile: selectedCustomer.mobile,
              resourceName: selectedCustomer.resourceName,
              display: selectedCustomer.display
            },
            action: 'customer_selected'
          });
        } else {
          console.log(`❌ Invalid selection: ${selectedIndex} (valid range: 1-${previousResults.length})`);
          return JSON.stringify({
            success: false,
            error: 'Invalid selection',
            message: `Please select a number between 1 and ${previousResults.length}, or search for a different customer.`,
            availableOptions: previousResults.length,
            results: []
          });
        }
      } else {
        console.log(`❌ No previous search results found for numbered selection`);
        return JSON.stringify({
          success: false,
          error: 'No previous results',
          message: 'No previous search results found. Please search for a customer by name first.',
          results: []
        });
      }
    }

    // Validate input for name search
    if (trimmedName.length < 2) {
      console.log('❌ Search query too short');
      return JSON.stringify({
        success: false,
        error: 'Search query too short',
        message: 'Please provide at least 2 characters to search for customers.',
        results: []
      });
    }

    try {
      // Get API configuration
      const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
      const authToken = process.env.SOHO_AUTH_TOKEN;

      if (!authToken) {
        console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
        return JSON.stringify({
          success: false,
          error: 'Missing authentication token',
          message: 'The customer search service is currently unavailable. Please try again later.',
          results: []
        });
      }

      // Prepare the GraphQL query to search contacts
      const query = {
        query: `{
          contacts {
            name
            mobile
            resourceName
          }
        }`
      };

      console.log('📞 Calling SOHO API to fetch contacts...');

      // Make the API call
      const response = await axios.post(apiUrl, query, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
          'X-Api-Key': process.env.SOHO_API_KEY || ''
        }
      });

      if (response.status !== 200) {
        console.error(`❌ SOHO API error: ${response.status}`);
        return JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          message: 'The customer search service encountered an error. Please try again later.',
          results: []
        });
      }

      const data = response.data;

      // Check for GraphQL errors
      if (data.errors) {
        console.error('❌ GraphQL errors:', data.errors);
        return JSON.stringify({
          success: false,
          error: 'GraphQL errors',
          message: 'There was an error processing your search request.',
          details: data.errors.map(e => e.message).join(', '),
          results: []
        });
      }

      // Check if we got contacts data
      if (!data.data || !data.data.contacts) {
        console.error('❌ Invalid response format from SOHO API:', data);
        return JSON.stringify({
          success: false,
          error: 'Invalid response format',
          message: 'The customer search service returned unexpected data.',
          results: []
        });
      }

      const contacts = data.data.contacts;
      console.log(`✅ Successfully fetched ${contacts.length} contacts from SOHO API`);

      // Filter contacts by name (case-insensitive search)
      const searchTerm = trimmedName.toLowerCase();
      const matchingContacts = contacts.filter(contact => {
        if (!contact || !contact.name) return false;
        return contact.name.toLowerCase().includes(searchTerm);
      });

      console.log(`🔍 Found ${matchingContacts.length} contacts matching "${trimmedName}"`);

      // Apply limit
      const limitedResults = matchingContacts.slice(0, limit);

      // Log some sample results for debugging
      if (limitedResults.length > 0) {
        console.log(`📋 Sample results (showing first ${Math.min(3, limitedResults.length)}):`);
        limitedResults.slice(0, 3).forEach((contact, i) => {
          console.log(`  ${i + 1}. ${contact.name} - ${contact.mobile}`);
        });
      }

      // Update context with search information (optional)
      if (this.context && limitedResults.length > 0) {
        if (!this.context.memory) {
          this.context.memory = {};
        }

        if (!this.context.memory.tool_usage) {
          this.context.memory.tool_usage = {};
        }

        if (!this.context.memory.tool_usage.searchCustomers) {
          this.context.memory.tool_usage.searchCustomers = [];
        }

        // Track search usage
        this.context.memory.tool_usage.searchCustomers.push({
          timestamp: new Date().toISOString(),
          searchTerm: trimmedName,
          resultsCount: limitedResults.length
        });

        // Store previous results for numbered selection (replace previous results)
        const mappedResults = limitedResults.map((contact, index) => {
          const mapped = {
            name: contact.name,
            mobile: contact.mobile,
            display: contact.name,
            resourceName: contact.resourceName
          };
          console.log(`  📋 Storing result ${index + 1}: ${mapped.name} - ${mapped.mobile}`);
          return mapped;
        });
        
        this.context.memory.tool_usage.searchCustomers_lastResults = mappedResults;
        console.log(`💾 Stored ${mappedResults.length} results for numbered selection`);
      }

      // Create the same mapping for the return results to ensure consistency
      const returnResults = limitedResults.map((contact, index) => {
        const mapped = {
          name: contact.name,
          mobile: contact.mobile,
          display: contact.name,
          resourceName: contact.resourceName
        };
        console.log(`  📤 Return result ${index + 1}: ${mapped.name} - ${mapped.mobile}`);
        return mapped;
      });

      // Return results
      return JSON.stringify({
        success: true,
        message: `Found ${limitedResults.length} customer${limitedResults.length !== 1 ? 's' : ''} matching "${trimmedName}"`,
        resultsCount: limitedResults.length,
        totalMatches: matchingContacts.length,
        searchTerm: trimmedName,
        results: returnResults
      });

    } catch (error) {
      console.error('❌ Error in searchCustomers tool:', error);

      // Provide more specific error information
      let errorMessage = 'An error occurred while searching for customers.';
      let errorDetails = error.message;

      if (error.response) {
        errorMessage = `API error: ${error.response.status}`;
        errorDetails = error.response.data || error.message;
      } else if (error.request) {
        errorMessage = 'Network error: Unable to reach the customer database.';
        errorDetails = 'Please check your internet connection and try again.';
      }

      return JSON.stringify({
        success: false,
        error: errorMessage,
        message: 'The customer search service is currently unavailable. Please try again later.',
        details: errorDetails,
        results: []
      });
    }
  }
}

/**
 * Creates a searchCustomers tool instance with context
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {StructuredTool} - The searchCustomers tool instance
 */
function createSearchCustomersTool(context, sessionId) {
  return new SearchCustomersTool(context, sessionId);
}

// Use CommonJS exports
module.exports = {
  SearchCustomersTool,
  createSearchCustomersTool
}; 