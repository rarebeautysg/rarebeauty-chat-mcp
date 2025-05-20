// Convert imports to CommonJS requires
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");

// Add a constant for retry attempts and a fallback query format
const MAX_RETRY_ATTEMPTS = 2;

// Function to fetch appointments from the SOHO API
async function fetchAppointmentsFromSoho(resourceName, limit = 5) {
  console.log(`📅 Fetching appointments for customer: ${resourceName} from SOHO API...`);
  
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN || '';
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return { appointments: [], cancelCount: 0 };
  }
  
  // Extract the person ID from the resourceName
  // ResourceName may be in format "people/12345" - we need just the ID part
  const personId = resourceName.includes('/') 
    ? resourceName.split('/').pop() 
    : resourceName;
  
  console.log(`🔍 Using person ID: ${personId} from resourceName: ${resourceName}`);
  
  // Use the exact query format provided
  try {
    const payload = {
      query: `{person(id: "${resourceName}")
                {   
                    id, 
                    cancelCount,
                    appointments { id,
                        event{ 
                            id, start, end, status, resourceName, serviceIds, shortURL, mobile,
                        },
                        transaction { 
                            id,
                            totalAmount,
                            service,
                            product,
                            discount,
                            additional,
                            deposit,
                            items {
                                name 
                            }
                        },                            
                    }
                }
            }`
    };
    
    console.log('📤 Using exact query format from sample');
    console.log('📤 GraphQL query preview:', JSON.stringify(payload).substring(0, 100) + '...');
    
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      }
    });
    
    if (response.status !== 200) {
      console.error(`❌ SOHO API error: ${response.status}`);
      return { appointments: [], cancelCount: 0 };
    }
    
    console.log('📥 API response structure:', Object.keys(response.data));
    
    const { data: responseData } = response.data;
    
    // Match the exact structure from queryPastAppointments
    if (responseData && responseData.person) {
      const person = responseData.person;
      const appointments = person.appointments || [];
      const cancelCount = person.cancelCount || 0;
      
      console.log(`✅ Successfully fetched ${appointments.length} appointments for person ID: ${personId}, cancelCount: ${cancelCount}`);
      
      // Limit the number of appointments if needed
      const limitedAppointments = limit > 0 ? appointments.slice(0, limit) : appointments;
      
      // Return in the exact format from queryPastAppointments
      return {
        appointments: limitedAppointments,
        cancelCount: cancelCount
      };
    } else if (response.data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors));
      return { appointments: [], cancelCount: 0 };
    } else {
      console.error('❌ Invalid response format:', JSON.stringify(response.data).substring(0, 200));
      return { appointments: [], cancelCount: 0 };
    }
    
  } catch (error) {
    console.error('❌ Error fetching appointments:', error.message);
    
    if (error.response) {
      console.error('📋 Error response data:', JSON.stringify(error.response.data).substring(0, 200));
      
      if (error.response.data && error.response.data.errors) {
        console.error('📋 GraphQL errors:', JSON.stringify(error.response.data.errors));
      }
    }
    
    return { appointments: [], cancelCount: 0 };
  }
}

// Format appointment details for display
function formatAppointment(appointment) {
  if (!appointment) return {};
  
  // Extract service details from the event and transaction
  const event = appointment.event || {};
  const transaction = appointment.transaction || {};
  
  // Format the date and time from event.start
  let date = "Unknown Date";
  let time = "Unknown Time";
  
  if (event.start) {
    try {
      const startDate = new Date(event.start);
      date = startDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      time = startDate.toTimeString().split(' ')[0].substring(0, 5); // Format as HH:MM
    } catch (e) {
      console.error('Error formatting date/time:', e);
    }
  }
  
  // Get service name from transaction items
  let serviceNames = "Unknown Service";
  let price = 0;
  
  if (transaction.items && transaction.items.length > 0) {
    serviceNames = transaction.items.map(item => item.name).join(', ');
  }
  
  // Get price from transaction
  if (transaction.totalAmount) {
    price = parseFloat(transaction.totalAmount);
  } else if (transaction.service) {
    price = parseFloat(transaction.service);
  }
  
  // Calculate duration from event start/end if available
  let duration = 0;
  if (event.start && event.end) {
    try {
      const start = new Date(event.start);
      const end = new Date(event.end);
      duration = Math.round((end - start) / (60 * 1000)); // Duration in minutes
    } catch (e) {
      console.error('Error calculating duration:', e);
    }
  }
  
  return {
    id: appointment.id || event.id || "Unknown ID",
    date: date,
    time: time,
    serviceNames: serviceNames,
    duration: duration,
    price: price,
    status: event.status || "Unknown Status",
    notes: ""
  };
}

class GetCustomerAppointmentsTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "getCustomerAppointments";
    this.description = "Get a customer's last appointments by their resourceName";
    this.schema = z.object({
      resourceName: z.string().describe("Customer's resourceName to lookup appointments for"),
      limit: z.number().optional().default(5).describe("Maximum number of appointments to return (default: 5)"),
    });
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }
  
  async _call({ resourceName, limit = 5 }) {
    console.log(`🔍 Looking up appointments for customer: ${resourceName}, limit: ${limit}`);
    console.log(`🔄 Session ID: ${this.sessionId}`);
    
    try {
      // Always fetch fresh data directly (no caching)
      console.log(`🔄 Always fetching fresh appointment data for ${resourceName}`);
      let appointmentData = await fetchAppointmentsFromSoho(resourceName, limit);
      
      // No longer use mock data if API returns empty appointments
      if (!appointmentData.appointments || appointmentData.appointments.length === 0) {
        console.log(`ℹ️ No appointments found for ${resourceName}`);
        appointmentData = { appointments: [], cancelCount: 0 };
      }
      
      // Format each appointment for display
      const formattedAppointments = appointmentData.appointments.map(formatAppointment);
      
      // Store in context if available
      if (this.context && this.context.memory) {
        if (!this.context.memory.customer_appointments) {
          this.context.memory.customer_appointments = {};
        }
        
        this.context.memory.customer_appointments[resourceName] = {
          retrievedAt: new Date().toISOString(),
          appointments: formattedAppointments,
          cancelCount: appointmentData.cancelCount || 0
        };
        
        // Add to tool usage tracking
        if (!this.context.memory.tool_usage) {
          this.context.memory.tool_usage = {};
        }
        
        if (!this.context.memory.tool_usage.getCustomerAppointments) {
          this.context.memory.tool_usage.getCustomerAppointments = [];
        }
        
        this.context.memory.tool_usage.getCustomerAppointments.push({
          timestamp: new Date().toISOString(),
          params: { resourceName, limit },
          result: { 
            count: formattedAppointments.length,
            cancelCount: appointmentData.cancelCount || 0,
            appointments: formattedAppointments
          }
        });
        
        // Update global context if available
        if (global.mcpContexts && global.mcpContexts instanceof Map && this.sessionId) {
          global.mcpContexts.set(this.sessionId, this.context);
        }
        
        // Use the memory service to update any necessary mappings
        try {
          const memoryService = require('../services/memoryService');
          memoryService.setSessionToResourceMapping(this.sessionId, resourceName);
        } catch (error) {
          console.error('❌ Error updating session-to-resource mapping:', error);
        }
        
        console.log(`✅ Updated context with ${formattedAppointments.length} appointments for customer: ${resourceName}`);
      }
      
      // Return result
      if (formattedAppointments.length === 0) {
        return JSON.stringify({
          message: "No previous appointments found for this customer.",
          appointments: [],
          cancelCount: appointmentData.cancelCount || 0,
          isAppointmentHistory: true
        });
      }

      // console.log(`formattedAppointments ${JSON.stringify(formattedAppointments, null, 2 )}`);
      
      return JSON.stringify({
        message: `Found ${formattedAppointments.length} previous appointment(s) for this customer.`,
        appointments: formattedAppointments,
        cancelCount: appointmentData.cancelCount || 0,
        isAppointmentHistory: true
      });
      
    } catch (error) {
      console.error("❌ Error in getCustomerAppointments tool:", error);
      
      // Return an error message with empty data rather than mock data
      return JSON.stringify({
        message: `Error retrieving appointment data: ${error.message}`,
        error: true,
        appointments: [],
        cancelCount: 0,
        isAppointmentHistory: true
      });
    }
  }
}

// Factory function for creating tool instances
function createGetCustomerAppointmentsTool(context, sessionId) {
  return new GetCustomerAppointmentsTool(context, sessionId);
}

// Use CommonJS exports
module.exports = {
  GetCustomerAppointmentsTool,
  createGetCustomerAppointmentsTool
}; 