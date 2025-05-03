import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";

// In-memory contact cache
let contactsCache = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache duration

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

export class LookupUserTool extends StructuredTool {
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

    try {
      // If cache is still empty after trying to load, return an error
      if (contactsCache.length === 0) {
        console.error('❌ No contacts available - SOHO API may be unavailable');
        return JSON.stringify({ 
          error: 'No contacts available',
          message: 'The contacts database is currently unavailable. Please try again later.'
        });
      }
      
      // Normalize the phone number for comparison
      const normalizedInput = normalizePhone(phoneNumber);
      const lastEightDigits = normalizedInput.slice(-8);

      console.log(`🔍 Looking up contact with normalized phone: "${normalizedInput}", last 8: "${lastEightDigits}"`);
      
      // Try multiple matching strategies
      // 1. Exact match
      let contact = contactsCache.find(c => c.mobile === phoneNumber);
      if (contact) {
        console.log(`✅ Found exact match: ${contact.name}`);
        // Update context directly
        this.updateContext(contact);
        return JSON.stringify({
          resourceName: contact.resourceName,
          name: contact.name,
          mobile: contact.mobile
        });
      }
      
      // 2. Match after normalizing
      contact = contactsCache.find(c => {
        const contactNormalized = normalizePhone(c.mobile);
        return contactNormalized === normalizedInput;
      });
      
      if (contact) {
        console.log(`✅ Found normalized match: ${contact.name}`);
        // Update context directly
        this.updateContext(contact);
        return JSON.stringify({ 
          resourceName: contact.resourceName,
          name: contact.name,
          mobile: contact.mobile
        });
      }
      
      // 3. Match by last 8 digits (common for Singapore numbers)
      contact = contactsCache.find(c => {
        const contactNormalized = normalizePhone(c.mobile);
        const contactLastEight = contactNormalized.slice(-8);
        return contactLastEight === lastEightDigits;
      });
      
      if (contact) {
        console.log(`✅ Found last-8-digits match: ${contact.name}`);
        // Update context directly
        this.updateContext(contact);
        return JSON.stringify({
          resourceName: contact.resourceName,
          name: contact.name,
          mobile: contact.mobile
        });
      }
      
      // No match found
      console.log(`❌ No contact found with phone: ${phoneNumber}`);
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
    
    // Ensure memory exists
    if (!this.context.memory) {
      this.context.memory = {};
    }
    
    // Update the user_info in the local context first
    this.context.memory.user_info = {
      resourceName: contact.resourceName,
      name: contact.name,
      mobile: contact.mobile,
      updatedAt: new Date().toISOString()
    };
    
    // Ensure identity exists
    if (!this.context.identity) {
      this.context.identity = {};
    }
    
    // Update identity too
    this.context.identity.user_id = contact.resourceName;
    this.context.identity.persona = "returning_customer";
    
    // Explicitly log the updated identity
    console.log(`✅ Set identity.user_id to ${contact.resourceName}`);
    
    // Use the memory service to update the session-to-resource mapping
    try {
      const memoryService = require('../services/memoryService');
      memoryService.setSessionToResourceMapping(this.sessionId, contact.resourceName);
    } catch (error) {
      console.error('❌ Error updating session-to-resource mapping:', error);
    }
    
    // Save to global.mcpContexts ONLY for DynamoDB persistence
    try {
      if (global.mcpContexts && global.mcpContexts instanceof Map && this.sessionId) {
        global.mcpContexts.set(this.sessionId, this.context);
        console.log(`📋 Saved to global.mcpContexts for DynamoDB persistence with resourceName: ${contact.resourceName}`);
      }
    } catch (error) {
      console.error('❌ Error saving to global.mcpContexts:', error);
    }
    
    // Track tool usage in memory
    if (!this.context.memory.tool_usage) {
      this.context.memory.tool_usage = {};
    }
    
    if (!this.context.memory.tool_usage.lookupUser) {
      this.context.memory.tool_usage.lookupUser = [];
    }
    
    // Store the result in tool usage
    this.context.memory.tool_usage.lookupUser.push({
      timestamp: new Date().toISOString(),
      params: { phoneNumber: contact.mobile },
      result: {
        resourceName: contact.resourceName,
        name: contact.name,
        mobile: contact.mobile
      }
    });
    
    console.log(`✅ Updated context with found customer: ${contact.name}, resourceName: ${contact.resourceName}`);
  }
}