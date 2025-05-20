// Convert imports to CommonJS requires
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");

// In-memory contact cache
let contactsCache = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache duration

// Initialize function to be called on server startup
async function initializeContactsCache() {
  console.log('📋 initializeContactsCache called');
  try {
    // Force fetch contacts from SOHO API
    const contacts = await fetchContactsFromSoho();
    
    if (contacts && contacts.length > 0) {
      contactsCache = contacts;
      lastFetchTime = Date.now();
      console.log(`✅ Initialized contacts cache with ${contacts.length} contacts`);
      return true;
    } else {
      console.error('❌ Failed to initialize contacts cache - no contacts returned');
      return false;
    }
  } catch (error) {
    console.error('❌ Error initializing contacts cache:', error);
    return false;
  }
}

// Helper to normalize phone numbers
function normalizePhone(phone) {
  // Handle undefined, null or non-string values
  if (!phone) {
    console.warn('⚠️ Received empty phone number in normalizePhone');
    return '';
  }
  
  // Ensure phone is a string
  const phoneStr = String(phone);
  
  // Remove all non-digits
  const digits = phoneStr.replace(/\D/g, '');
  
  // For Singapore numbers, we want the last 8 digits
  if (digits.length >= 8) {
    return digits.slice(-8);
  }
  
  return digits;
}

// Function to fetch contacts from the SOHO API
async function fetchContactsFromSoho() {
  console.log('📞 Fetching contacts from SOHO API...');
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return [];
  }
  
  try {
    const query = `{"query":"{contacts{name,mobile,display,resourceName}}"}`;
    
    const response = await axios.post(apiUrl, 
      JSON.parse(query),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        }
      }
    );
    
    if (response.status !== 200) {
      console.error(`❌ SOHO API error: ${response.status}`);
      return [];
    }
    
    const data = response.data;
    
    if (!data.data || !data.data.contacts) {
      console.error('❌ Invalid response format from SOHO API:', data);
      return [];
    }
    
    console.log(`✅ Successfully fetched ${data.data.contacts.length} contacts from SOHO API`);
    return data.data.contacts;
    
  } catch (error) {
    console.error('❌ Error fetching contacts from SOHO API:', error);
    return [];
  }
}

// Function to refresh cache if needed and return all contacts
async function getContacts() {
  const now = Date.now();
  
  // Check if cache is empty or expired
  if (contactsCache.length === 0 || (now - lastFetchTime > CACHE_DURATION)) {
    console.log('🔄 Cache empty or expired, refreshing contacts from SOHO API');
    
    const contacts = await fetchContactsFromSoho();
    
    if (contacts.length > 0) {
      contactsCache = contacts;
      lastFetchTime = now;
      console.log(`✅ Updated contacts cache with ${contacts.length} records`);
    } else {
      console.warn('⚠️ No contacts returned from SOHO API');
    }
  } else {
    console.log(`📋 Using cached contacts (${contactsCache.length} records, updated ${Math.round((now - lastFetchTime) / 1000 / 60)} minutes ago)`);
  }
  
  return contactsCache;
}

class LookupUserTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "lookupUser";
    this.description = "Find a user by Singapore phone number";
    this.schema = z.object({
      phoneNumber: z.string().describe("Singapore mobile number to lookup")
    });
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
    
    // Warm the cache on initialization
    getContacts().catch(err => console.error('Failed to warm contacts cache:', err));
  }

  async _call({ phoneNumber }) {
    console.log(`🚨 LOOKUP TOOL TRIGGERED 🚨`);
    console.log(`📞 Looking up user by phone: ${phoneNumber}`);
    console.log(`🔄 Session ID: ${this.sessionId}`);
    console.log(`📊 Contact cache status: ${contactsCache.length} contacts, last updated ${lastFetchTime ? Math.floor((Date.now() - lastFetchTime) / 1000 / 60) + ' minutes ago' : 'never'}`);

    try {
      // If cache is still empty after trying to load, try fetching one more time directly
      if (contactsCache.length === 0) {
        console.warn('⚠️ Contact cache is empty, attempting to fetch contacts directly');
        const contacts = await fetchContactsFromSoho();
        
        if (contacts && contacts.length > 0) {
          console.log(`✅ Direct fetch successful, got ${contacts.length} contacts`);
          contactsCache = contacts;
          lastFetchTime = Date.now();
        } else {
          console.error('❌ No contacts available - SOHO API may be unavailable');
          return JSON.stringify({ 
            error: 'No contacts available',
            message: 'The contacts database is currently unavailable. Please try again later.'
          });
        }
      }
      
      // Log the cache size for debugging
      console.log(`📊 Using contacts cache with ${contactsCache.length} records`);
      
      // Normalize the phone number for comparison
      const normalizedInput = normalizePhone(phoneNumber);
      const lastEightDigits = normalizedInput.slice(-8);

      console.log(`🔍 Looking up contact with normalized phone: "${normalizedInput}", last 8: "${lastEightDigits}"`);
      
      // Prepare alternative formats for search
      const searchFormats = [
        phoneNumber,              // Original format
        `+65${phoneNumber}`,      // With +65 prefix
        `+${phoneNumber}`,        // With + prefix
        `65${phoneNumber}`        // With 65 prefix
      ];
      
      // Try multiple matching strategies
      let contact = null;
      
      // 1. Try exact match with multiple formats
      console.log('Trying exact match with multiple formats...');
      for (const format of searchFormats) {
        contact = contactsCache.find(c => c && c.mobile === format);
        if (contact) {
          console.log(`✅ Found exact match with format "${format}": ${contact.name}`);
          break;
        }
      }
      
      // 2. If no exact match, try normalized match
      if (!contact) {
        console.log('Trying normalized match...');
        contact = contactsCache.find(c => {
          if (!c || !c.mobile) return false;
          const contactNormalized = normalizePhone(c.mobile);
          return contactNormalized === normalizedInput;
        });
        
        if (contact) {
          console.log(`✅ Found normalized match: ${contact.name}`);
        }
      }
      
      // 3. If still no match, try by last 8 digits (common for Singapore numbers)
      if (!contact) {
        console.log('Trying last 8 digits match...');
        contact = contactsCache.find(c => {
          if (!c || !c.mobile) return false;
          const contactNormalized = normalizePhone(c.mobile);
          const contactLastEight = contactNormalized.slice(-8);
          return contactLastEight === lastEightDigits;
        });
        
        if (contact) {
          console.log(`✅ Found last-8-digits match: ${contact.name}`);
        }
      }
      
      // 4. If STILL no match, try a more aggressive approach with partial matching
      if (!contact && lastEightDigits.length >= 6) {
        console.log('Trying partial match with last 6+ digits...');
        const lastSixDigits = lastEightDigits.slice(-6);
        
        contact = contactsCache.find(c => {
          if (!c || !c.mobile) return false;
          const contactNormalized = normalizePhone(c.mobile);
          return contactNormalized.endsWith(lastSixDigits);
        });
        
        if (contact) {
          console.log(`✅ Found partial match with last ${lastSixDigits.length} digits: ${contact.name}`);
        }
      }
      
      // If we found a contact, update context and return
      if (contact) {
        // Update context directly
        this.updateContext(contact);
        return JSON.stringify({
          resourceName: contact.resourceName,
          name: contact.name,
          mobile: contact.mobile
        });
      }
      
      // No match found after all attempts
      console.log(`❌ No contact found with phone: ${phoneNumber} after trying all matching strategies`);
      return JSON.stringify({ 
        error: "No contact found with the provided phone number",
        message: "Please ensure the phone number is correct or contact support to add this customer to the system."
      });
    } catch (error) {
      console.error('❌ Error in lookupUser tool:', error);
      return JSON.stringify({
        error: "Failed to lookup user",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Helper method to update context with user information
  updateContext(contact) {
    if (!this.context) {
      console.error('❌ No context provided to updateContext');
      return;
    }
    
    console.log(`📋 Updating context for resourceName: ${contact.resourceName}, session: ${this.sessionId}`);
    
    // Add sessionId to context for tracking
    this.context.sessionId = this.sessionId;
    
    // Initialize memory if needed
    if (!this.context.memory) {
      this.context.memory = {};
    }
    
    // Initialize identity object if needed
    if (!this.context.memory.identity) {
      this.context.memory.identity = {};
    }
    
    // Update identity directly
    this.context.memory.identity.user_id = contact.resourceName;
    this.context.memory.identity.persona = "returning_customer";
    this.context.memory.identity.name = contact.name;
    this.context.memory.identity.mobile = contact.mobile;
    this.context.memory.identity.updatedAt = new Date().toISOString();
    
    // Set user_info directly
    this.context.memory.user_info = {
      resourceName: contact.resourceName,
      name: contact.name,
      mobile: contact.mobile,
      updatedAt: new Date().toISOString()
    };
    
    // Update timestamp
    this.context.lastUpdated = new Date().toISOString();
    
    console.log(`✅ Customer identified: ${contact.name} (${contact.resourceName})`);
    
    // Use the memory service to update the session-to-resource mapping (essential for session tracking)
    try {
      const memoryService = require('../services/memoryService');
      memoryService.setSessionToResourceMapping(this.sessionId, contact.resourceName);
    } catch (error) {
      console.error('❌ Error updating session-to-resource mapping:', error);
    }
    
    // Track minimal tool usage data
    if (!this.context.memory.tool_usage) {
      this.context.memory.tool_usage = {};
    }
    
    if (!this.context.memory.tool_usage.lookupUser) {
      this.context.memory.tool_usage.lookupUser = [];
    }
    
    // Only store timestamp and mobile number used for lookup
    this.context.memory.tool_usage.lookupUser.push({
      timestamp: new Date().toISOString(),
      phone: contact.mobile
    });
    
    console.log(`✅ Updated context with found customer: ${contact.name}, resourceName: ${contact.resourceName}`);
  }
}

// Use CommonJS exports
module.exports = {
  LookupUserTool,
  createLookupUserTool: (context, sessionId) => new LookupUserTool(context, sessionId),
  initializeContactsCache // Export the initialization function
};