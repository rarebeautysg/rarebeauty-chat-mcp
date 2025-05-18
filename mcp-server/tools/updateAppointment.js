const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");
const { getAllFormattedServices, getServiceDuration } = require('../src/tools/listServices');

// Define the schema for the updateAppointment tool
const UpdateAppointmentSchema = z.object({
  appointmentId: z.string().describe("ID of the appointment to update"),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking"),
  date: z.string().describe("New date for the appointment"),
  time: z.string().describe("New time for the appointment"),
  serviceIds: z.array(z.string()).describe("Service IDs for the appointment"),
  duration: z.number().optional().describe("Duration of the appointment in minutes"),
  totalAmount: z.number().optional().describe("Total amount for the appointment"),
  additional: z.number().optional().describe("Additional amount"),
  discount: z.number().optional().describe("Discount amount"),
  deposit: z.number().optional().describe("Deposit amount"),
  toBeInformed: z.boolean().optional().describe("Whether to inform the customer")
});

// Format the start time for SOHO API (YYYYMMDDTHHmm)
function formatStartTime(date, time) {
  try {
    // Handle date formats
    let dateObj = new Date();
    
    if (date.toLowerCase() === 'today') {
      // Use today's date
    } else if (date.toLowerCase() === 'tomorrow') {
      dateObj.setDate(dateObj.getDate() + 1);
    } else {
      dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return { error: `Invalid date format: ${date}` };
      }
    }
    
    // Parse the time
    const parsedTime = time.toLowerCase().replace(/\s/g, '');
    let hours = 0, minutes = 0;
    
    if (parsedTime.includes(':')) {
      const timeParts = parsedTime.split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1].replace(/[^0-9]/g, ''), 10);
      if (parsedTime.includes('pm') && hours < 12) hours += 12;
      if (parsedTime.includes('am') && hours === 12) hours = 0;
    } else {
      hours = parseInt(parsedTime.replace(/[^0-9]/g, ''), 10);
      if (parsedTime.includes('pm') && hours < 12) hours += 12;
    }
    
    dateObj.setHours(hours, minutes, 0, 0);
    
    // Format in YYYYMMDDTHHmm format as required by SOHO API
    const formattedStart = `${dateObj.getFullYear()}${(dateObj.getMonth()+1).toString().padStart(2, '0')}${dateObj.getDate().toString().padStart(2, '0')}T${dateObj.getHours().toString().padStart(2, '0')}${dateObj.getMinutes().toString().padStart(2, '0')}`;
    
    console.log(`📅 Formatted start time: ${formattedStart}`);
    return { formattedStart, dateObj };
    
  } catch (error) {
    console.error('❌ Error formatting date-time:', error);
    return { error: 'Invalid date or time format' };
  }
}

// Prepare the GraphQL request for updating an appointment
function prepareUpdateGraphQLRequest(updateData, formattedStart) {
  // Define the exact GraphQL mutation as required by SOHO API
  const mutationTemplate = `mutation($id: String!, $name: String!, $mobile:String!, $resourceName:String, $start:String!, $serviceIds:[String]!, $duration:Int!, $totalAmount:Float, $additional:Float, $discount:Float, $deposit:Float, $toBeInformed:Boolean) {
    updateAppointment(id:$id, name:$name, mobile:$mobile, resourceName:$resourceName, start:$start, serviceIds:$serviceIds, duration:$duration, totalAmount:$totalAmount, additional:$additional, discount:$discount, deposit:$deposit, toBeInformed:$toBeInformed) {
        id
        event { 
            id,
            name
            mobile,
            start,
            end,
            serviceIds,
            informed
        }
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
  }`;
  
  // Create variables object
  const variables = {
    id: updateData.appointmentId,
    name: updateData.name,
    mobile: updateData.mobile,
    resourceName: updateData.resourceName,
    start: formattedStart,
    serviceIds: updateData.serviceIds,
    duration: updateData.duration || 60,
    totalAmount: updateData.totalAmount || 0,
    additional: updateData.additional || 0,
    discount: updateData.discount || 0,
    deposit: updateData.deposit || 0,
    toBeInformed: updateData.toBeInformed !== undefined ? updateData.toBeInformed : false
  };
  
  // Return the complete GraphQL request
  return {
    query: mutationTemplate,
    variables: variables
  };
}

// Format date for display
function formatDisplayDate(dateObj) {
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format time for display
function formatDisplayTime(dateObj) {
  const hours24 = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const isPM = hours24 >= 12;
  const hours12 = hours24 % 12 || 12;
  
  return `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
}

class UpdateAppointmentTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "updateAppointment";
    this.description = "Update an existing appointment with new date, time, or services";
    this.schema = UpdateAppointmentSchema;
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(inputs) {
    const { appointmentId, date, time, name, mobile, resourceName, serviceIds, duration, totalAmount, additional, discount, deposit, toBeInformed } = inputs;

    console.log(`🔄 Update appointment request for session: ${this.sessionId}`);
    console.log(`📋 Appointment ID: ${appointmentId}`);
    console.log(`📋 New date and time: ${date} at ${time}`);
    console.log(`📋 Service IDs: ${JSON.stringify(serviceIds)}`);
    
    // Track tool usage in memory
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.updateAppointment) {
        this.context.memory.tool_usage.updateAppointment = [];
      }
      
      this.context.memory.tool_usage.updateAppointment.push({
        timestamp: new Date().toISOString(),
        appointmentId,
        date,
        time,
        name,
        resourceName,
        serviceIds
      });
    }
    
    try {
      // Format the start time for the API
      const timeResult = formatStartTime(date, time);
      if (timeResult.error) {
        return JSON.stringify({
          success: false,
          error: timeResult.error
        });
      }
      
      const { formattedStart, dateObj } = timeResult;
      
      // Calculate total duration if not provided
      let totalDuration = duration;
      if (!totalDuration && serviceIds && serviceIds.length > 0) {
        totalDuration = 0;
        for (const serviceId of serviceIds) {
          const serviceDuration = await getServiceDuration(serviceId);
          if (serviceDuration > 0) {
            totalDuration += serviceDuration;
          } else {
            totalDuration += 60; // Default to 60 minutes if unknown
          }
        }
      }
      
      // Get service names for display
      const allServices = await getAllFormattedServices();
      const serviceNames = serviceIds.map(id => {
        const service = allServices.find(s => s.id === id);
        return service ? service.name : 'Unknown Service';
      });
      
      console.log(`📋 Calculated duration: ${totalDuration} minutes`);
      console.log(`📋 Services: ${serviceNames.join(', ')}`);
      
      // Prepare the update request
      const updateRequest = prepareUpdateGraphQLRequest(
        {
          appointmentId,
          name,
          mobile,
          resourceName,
          serviceIds,
          duration: totalDuration,
          totalAmount,
          additional,
          discount,
          deposit,
          toBeInformed
        },
        formattedStart
      );
      
      // Get API credentials
      const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
      const authToken = process.env.SOHO_AUTH_TOKEN;
      
      if (!authToken) {
        console.error('❌ Missing SOHO_AUTH_TOKEN environment variable');
        return JSON.stringify({
          success: false,
          error: 'API authentication not configured',
          message: 'The system is not properly configured to update appointments'
        });
      }
      
      console.log('📤 Sending update request to API...');
      
      // Make the API call to update the appointment
      const response = await axios.post(apiUrl, updateRequest, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        }
      });
      
      const result = response.data;
      
      // Check if appointment was updated successfully
      if (result.data?.updateAppointment) {
        const updatedAppointment = result.data.updateAppointment;
        const event = updatedAppointment.event || {};
        const transaction = updatedAppointment.transaction || {};
        
        const formattedDate = formatDisplayDate(dateObj);
        const formattedTime = formatDisplayTime(dateObj);
        
        // Get service names from the transaction items if available
        const transactionItems = transaction.items || [];
        const serviceNamesFromTransaction = transactionItems.map(item => item.name);
        const displayServiceNames = serviceNamesFromTransaction.length > 0 ? 
                                   serviceNamesFromTransaction : serviceNames;
        
        return JSON.stringify({
          success: true,
          message: `✅ Appointment successfully updated to ${formattedDate} at ${formattedTime}.`,
          appointmentId: updatedAppointment.id,
          details: {
            customer: {
              name: event.name || name,
              mobile: event.mobile || mobile
            },
            datetime: {
              date: formattedDate,
              time: formattedTime
            },
            services: displayServiceNames,
            transaction: {
              totalAmount: transaction.totalAmount || totalAmount || 0,
              discount: transaction.discount || discount || 0,
              additional: transaction.additional || additional || 0,
              deposit: transaction.deposit || deposit || 0
            }
          }
        });
      } else if (result.errors) {
        // Handle GraphQL errors
        const errorMessage = result.errors[0]?.message || 'Unknown error occurred';
        console.error('❌ GraphQL error:', errorMessage);
        
        return JSON.stringify({
          success: false,
          error: 'Failed to update appointment',
          message: errorMessage
        });
      } else {
        console.error('❌ Unexpected API response:', JSON.stringify(result).substring(0, 200));
        
        return JSON.stringify({
          success: false,
          error: 'Unexpected API response',
          message: 'The server returned an unexpected response'
        });
      }
    } catch (error) {
      console.error('❌ Error in update API call:', error);
      
      return JSON.stringify({
        success: false,
        error: 'Failed to update appointment',
        message: error.message || 'An unknown error occurred'
      });
    }
  }
}

function createUpdateAppointmentTool(context, sessionId) {
  return new UpdateAppointmentTool(context, sessionId);
}

module.exports = {
  UpdateAppointmentTool,
  createUpdateAppointmentTool
}; 