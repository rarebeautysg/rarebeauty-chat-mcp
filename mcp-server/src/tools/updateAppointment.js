const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios");
const { getAllFormattedServices, getServiceDuration } = require('./listServices');
const { fetchAppointmentDetails } = require('./getAppointment');

// Define the schema for the updateAppointment tool
const UpdateAppointmentSchema = z.object({
  appointmentId: z.string().describe("ID of the appointment to update"),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking"),
  date: z.string().describe("New date for the appointment"),
  time: z.string().describe("New time for the appointment"),
  serviceIds: z.union([
    z.array(z.string()),
    z.string()
  ]).describe("Service IDs for the appointment - can be an array or comma-separated string"),
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
    duration: Number(updateData.duration) || 60,
    totalAmount: Number(updateData.totalAmount) || 0,
    additional: Number(updateData.additional) || 0,
    discount: Number(updateData.discount) || 0,
    deposit: Number(updateData.deposit) || 0,
    toBeInformed: typeof updateData.toBeInformed === 'string' 
      ? updateData.toBeInformed.toLowerCase() === 'true'
      : Boolean(updateData.toBeInformed)
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
    this.description = "Update an existing appointment with new date, time, or services. DO NOT check for availability or conflicts. MUST include appointmentId in the call.";
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
        serviceIds,
        force: false
      });
      
      // Store appointmentId in memory as current_appointment_id
      this.context.memory.current_appointment_id = appointmentId;
      console.log(`📋 Stored appointment ID ${appointmentId} in memory.current_appointment_id`);
    }
    
    try {
      // Try to fetch existing appointment details first
      const existingAppointment = await fetchAppointmentDetails(appointmentId);
      
      // Default values from inputs
      let customerName = name;
      let customerMobile = mobile;
      let customerResourceName = resourceName;
      let serviceIdsArray = [];
      let appointmentDuration = duration;
      let appointmentTotalAmount = totalAmount;
      let appointmentAdditional = additional;
      let appointmentDiscount = discount;
      let appointmentDeposit = deposit;
      
      // Check if we got existing appointment data
      if (existingAppointment) {
        console.log('✅ Using data from existing appointment');
        
        // Extract event and transaction data
        const event = existingAppointment.event || {};
        const transaction = existingAppointment.transaction || {};
        
        // Override inputs with existing appointment data if not explicitly provided
        customerName = customerName || event.name;
        customerMobile = customerMobile || event.mobile;
        customerResourceName = customerResourceName || event.resourceName;
        
        // Use existing serviceIds if not explicitly provided
        if (!serviceIds && event.serviceIds) {
          serviceIdsArray = Array.isArray(event.serviceIds) ? event.serviceIds : [event.serviceIds];
          console.log(`📋 Using service IDs from existing appointment: ${JSON.stringify(serviceIdsArray)}`);
        }
        
        // Use existing financial info if not explicitly provided
        appointmentTotalAmount = appointmentTotalAmount || transaction.totalAmount;
        appointmentAdditional = appointmentAdditional || transaction.additional;
        appointmentDiscount = appointmentDiscount || transaction.discount;
        appointmentDeposit = appointmentDeposit || transaction.deposit;
      } else {
        console.log('⚠️ Could not fetch existing appointment details, using provided data');
      }
      
      // Format the start time for the API
      const timeResult = formatStartTime(date, time);
      if (timeResult.error) {
        return JSON.stringify({
          success: false,
          error: timeResult.error
        });
      }
      
      const { formattedStart, dateObj } = timeResult;
      
      // Process service IDs if not already done
      if (serviceIdsArray.length === 0 && serviceIds) {
        if (Array.isArray(serviceIds)) {
          serviceIdsArray = serviceIds;
        } else if (typeof serviceIds === 'string') {
          // Handle comma-separated string
          if (serviceIds.includes(',')) {
            serviceIdsArray = serviceIds.split(',').map(id => id.trim());
          } else {
            // Single service ID
            serviceIdsArray = [serviceIds.trim()];
          }
        }
      }
      
      console.log(`📋 Final service IDs: ${JSON.stringify(serviceIdsArray)}`);
      
      // Calculate total duration if not provided
      if (!appointmentDuration && serviceIdsArray.length > 0) {
        appointmentDuration = 0;
        for (const serviceId of serviceIdsArray) {
          const serviceDuration = await getServiceDuration(serviceId);
          if (serviceDuration > 0) {
            appointmentDuration += serviceDuration;
          } else {
            appointmentDuration += 60; // Default to 60 minutes if unknown
          }
        }
      }
      
      // Get service names for display
      const allServices = await getAllFormattedServices();
      const serviceNames = serviceIdsArray.map(id => {
        const service = allServices.find(s => s.id === id);
        return service ? service.name : 'Unknown Service';
      });
      
      console.log(`📋 Calculated duration: ${appointmentDuration} minutes`);
      console.log(`📋 Services: ${serviceNames.join(', ')}`);
      
      // Prepare the update request
      const updateRequest = prepareUpdateGraphQLRequest(
        {
          appointmentId,
          name: customerName,
          mobile: customerMobile,
          resourceName: customerResourceName,
          serviceIds: serviceIdsArray,
          duration: appointmentDuration,
          totalAmount: appointmentTotalAmount,
          additional: appointmentAdditional,
          discount: appointmentDiscount,
          deposit: appointmentDeposit,
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
              name: event.name || customerName,
              mobile: event.mobile || customerMobile
            },
            datetime: {
              date: formattedDate,
              time: formattedTime
            },
            services: displayServiceNames,
            transaction: {
              totalAmount: transaction.totalAmount || appointmentTotalAmount || 0,
              discount: transaction.discount || appointmentDiscount || 0,
              additional: transaction.additional || appointmentAdditional || 0,
              deposit: transaction.deposit || appointmentDeposit || 0
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