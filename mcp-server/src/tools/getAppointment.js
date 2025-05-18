const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");

// Define the schema for the getAppointment tool
const GetAppointmentSchema = z.object({
  appointmentId: z.string().describe("ID of the appointment to retrieve")
});

// Function to fetch details of an existing appointment
async function fetchAppointmentDetails(appointmentId) {
  console.log(`🔍 Fetching details for appointment ID: ${appointmentId}`);
  
  // Get API credentials
  const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
  const authToken = process.env.SOHO_AUTH_TOKEN;
  
  if (!authToken) {
    console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
    return null;
  }
  
  // Define the query to fetch appointment details
  const query = {
    query: `
      query($id: String!) {
        appointment(id: $id) {
          id,
          event { 
            id,
            name,
            mobile,
            start,
            end,
            serviceIds,
            resourceName
          },
          transaction {
            id,
            items { id, type, name, price },
            totalAmount,
            service,
            product,
            discount,
            additional,
            deposit
          }
        }
      }
    `,
    variables: {
      id: appointmentId
    }
  };
  
  try {
    const response = await axios.post(apiUrl, query, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      }
    });
    
    const result = response.data;
    
    if (result.data?.appointment) {
      console.log('✅ Successfully fetched appointment details');
      return result.data.appointment;
    } else if (result.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(result.errors));
      return null;
    } else {
      console.error('❌ Invalid response format');
      return null;
    }
  } catch (error) {
    console.error('❌ Error fetching appointment details:', error.message);
    return null;
  }
}

// Format date for display (YYYY-MM-DD)
function formatDate(dateString) {
  if (!dateString) return "";
  
  // Parse ISO format date
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  return date.toISOString().split('T')[0];
}

// Format time for display (HH:MM format)
function formatTime(dateString) {
  if (!dateString) return "";
  
  // Parse ISO format date
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

class GetAppointmentTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "getAppointment";
    this.description = "Get details of an existing appointment by ID";
    this.schema = GetAppointmentSchema;
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(inputs) {
    const { appointmentId } = inputs;

    console.log(`🔍 Get appointment request for session: ${this.sessionId}`);
    console.log(`📋 Appointment ID: ${appointmentId}`);
    
    // Track tool usage in memory
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.getAppointment) {
        this.context.memory.tool_usage.getAppointment = [];
      }
      
      this.context.memory.tool_usage.getAppointment.push({
        timestamp: new Date().toISOString(),
        appointmentId
      });
      
      // Store appointmentId in memory as current_appointment_id
      this.context.memory.current_appointment_id = appointmentId;
      console.log(`📋 Stored appointment ID ${appointmentId} in memory.current_appointment_id`);
    }
    
    try {
      // Fetch appointment details
      const appointmentDetails = await fetchAppointmentDetails(appointmentId);
      
      if (!appointmentDetails) {
        return JSON.stringify({
          success: false,
          error: "Appointment not found",
          message: "Could not find appointment with the provided ID"
        });
      }
      
      const event = appointmentDetails.event || {};
      const transaction = appointmentDetails.transaction || {};
      
      // Format the date and time
      const startDate = formatDate(event.start);
      const startTime = formatTime(event.start);
      
      // Extract service IDs and names
      const serviceIds = Array.isArray(event.serviceIds) ? event.serviceIds : 
                         (event.serviceIds ? [event.serviceIds] : []);
      
      // Get service names from transaction items
      const serviceNames = (transaction.items || [])
        .filter(item => item.type === 'SERVICE')
        .map(item => item.name);
      
      return JSON.stringify({
        success: true,
        appointmentId: appointmentDetails.id,
        details: {
          customer: {
            name: event.name || "",
            mobile: event.mobile || ""
          },
          resourceName: event.resourceName || "",
          datetime: {
            date: startDate,
            time: startTime
          },
          services: {
            serviceIds: serviceIds,
            serviceNames: serviceNames
          },
          transaction: {
            totalAmount: transaction.totalAmount || 0,
            discount: transaction.discount || 0,
            additional: transaction.additional || 0,
            deposit: transaction.deposit || 0
          }
        }
      });
    } catch (error) {
      console.error('❌ Error in getAppointment tool:', error);
      
      return JSON.stringify({
        success: false,
        error: "Failed to get appointment details",
        message: error.message || "An unknown error occurred"
      });
    }
  }
}

function createGetAppointmentTool(context, sessionId) {
  return new GetAppointmentTool(context, sessionId);
}

module.exports = {
  GetAppointmentTool,
  createGetAppointmentTool,
  fetchAppointmentDetails
}; 