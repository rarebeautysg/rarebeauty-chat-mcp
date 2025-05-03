const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { getAllFormattedServices, getServiceDuration, getHighlightedServices } = require('./listServices');

const BookAppointmentSchema = z.object({
  serviceIds: z.array(z.string()),
  date: z.string(),
  time: z.string(),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking"),
  force: z.boolean().optional().describe("Whether to force book the appointment even if there are conflicts"),
  duration: z.number().optional().describe("Duration of the appointment in minutes"),
  totalAmount: z.number().optional().describe("Total amount for the appointment"),
  additional: z.number().optional().describe("Additional amount"),
  discount: z.number().optional().describe("Discount amount"),
  toBeInformed: z.boolean().optional().describe("Whether to inform the customer"),
  deposit: z.number().optional().describe("Deposit amount"),
  notes: z.string().optional().describe("Notes for the appointment"),
  sessionId: z.string().optional().describe("Session ID for the booking")
});

// Cache for public holidays
let publicHolidaysCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Function to fetch Singapore public holidays from data.gov.sg
async function fetchPublicHolidays() {
  // Check cache first
  const now = Date.now();
  if (publicHolidaysCache && (now - lastFetchTime < CACHE_DURATION)) {
    console.log('📅 Using cached public holidays data (bookAppointment)');
    return publicHolidaysCache;
  }
  
  try {
    console.log('📅 Fetching Singapore public holidays from data.gov.sg (bookAppointment)');
    const response = await fetch('https://data.gov.sg/api/action/datastore_search?resource_id=d_3751791452397f1b1c80c451447e40b7');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch public holidays: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.result || !data.result.records) {
      throw new Error('Invalid response format from data.gov.sg API');
    }
    
    // Transform the data to a simpler format
    const holidays = data.result.records.map((record) => ({
      date: record.date,
      holiday: record.holiday
    }));
    
    // Update cache
    publicHolidaysCache = holidays;
    lastFetchTime = now;
    
    console.log(`📅 Fetched ${holidays.length} public holidays (bookAppointment)`);
    return holidays;
  } catch (error) {
    console.error('❌ Error fetching public holidays:', error);
    // Return empty array if there's an error, so the app still works
    return [];
  }
}

// Format the start time for SOHO API (YYYYMMDDTHHmm)
function formatStartTime(date, time) {
  try {
    // Handle date formats
    let dateObj = new Date();
    
    if (date.toLowerCase() === 'today') {
      // Use today's date
    } else if (date.toLowerCase() === 'tomorrow') {
      dateObj.setDate(dateObj.getDate() + 1);
    } else if (date.toLowerCase().includes('next')) {
      if (date.toLowerCase().includes('week')) {
        dateObj.setDate(dateObj.getDate() + 7);
      } else if (date.toLowerCase().includes('month')) {
        dateObj.setMonth(dateObj.getMonth() + 1);
      } else {
        dateObj.setDate(dateObj.getDate() + 1);
      }
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

// Prepare the GraphQL request
function prepareGraphQLRequest(bookingData, formattedStart) {
  // Define the exact GraphQL mutation as required by SOHO API
  const mutationTemplate = `mutation($name: String!, $mobile:String!, $resourceName:String, $start:String!, $serviceIds:[String]!, $duration:Int!, $totalAmount:Float, $additional:Float, $discount:Float, $toBeInformed:Boolean, $deposit:Float, $force:Boolean) {
    createAppointment(name:$name, mobile:$mobile, resourceName:$resourceName, start:$start, serviceIds:$serviceIds, duration:$duration, totalAmount:$totalAmount, additional:$additional, discount:$discount, toBeInformed:$toBeInformed, deposit:$deposit, force:$force) {
        id,
        createdNewContact
    }
  }`;
  
  // Create variables object
  const variables = {
    name: bookingData.name,
    mobile: bookingData.mobile,
    resourceName: bookingData.resourceName,
    start: formattedStart,
    serviceIds: bookingData.serviceIds,
    duration: bookingData.duration || 60,
    totalAmount: bookingData.totalAmount || 0,
    additional: bookingData.additional || 0,
    discount: bookingData.discount || 0,
    toBeInformed: bookingData.toBeInformed !== undefined ? bookingData.toBeInformed : true,
    deposit: bookingData.deposit || 0,
    force: bookingData.force || false    
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

class BookAppointmentTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "bookAppointment";
    this.description = "Book appointment for one or more services at a given time. Checks availability too.";
    this.schema = BookAppointmentSchema;
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(inputs) {
    const { serviceIds, date, time, name, mobile, resourceName, force, duration, totalAmount, additional, discount, toBeInformed, deposit, notes } = inputs;

    console.log(`🔄 Book appointment request for session: ${this.sessionId}`);
    console.log(`📋 Original service IDs provided by AI: ${JSON.stringify(serviceIds)}`);
    
    // Track tool usage in memory
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.bookAppointment) {
        this.context.memory.tool_usage.bookAppointment = [];
      }
      
      // Log this booking attempt
      this.context.memory.tool_usage.bookAppointment.push({
        timestamp: new Date().toISOString(),
        serviceIds,
        date,
        time
      });
      
      // Check if any services in serviceIds match highlighted services
      if (this.context.memory.highlightedServices && this.context.memory.highlightedServices.length > 0) {
        const highlightedIds = this.context.memory.highlightedServices.map(s => s.id);
        const matchingIds = serviceIds.filter(id => highlightedIds.includes(id));
        
        if (matchingIds.length > 0) {
          console.log(`✅ Booking includes ${matchingIds.length} highlighted services previously mentioned by user`);
          
          // Add booking intent to each highlighted service
          matchingIds.forEach(id => {
            const highlightedService = this.context.memory.highlightedServices.find(s => s.id === id);
            if (highlightedService) {
              highlightedService.bookedAt = new Date().toISOString();
              highlightedService.bookingDetails = { date, time, name, mobile };
            }
          });
        }
      }
      
      // Update context memory
      if (serviceIds && serviceIds.length > 0) {
        this.context.memory.last_selected_service = serviceIds[0];
      }
      if (date) this.context.memory.preferred_date = date;
      if (time) this.context.memory.preferred_time = time;
    }
    
    // Process service IDs and add validation/fallback mechanism
    let serviceIdArray = [];
    let serviceIdsFromAI = [];
    
    if (serviceIds) {
      // Check if serviceIds is an array or comma-separated string
      if (Array.isArray(serviceIds)) {
        serviceIdsFromAI = serviceIds;
      } else {
        serviceIdsFromAI = serviceIds.split(',').map(id => id.trim());
      }
    }
    
    // Log original service IDs from the AI
    console.log(`📋 Original service IDs provided by AI: "${serviceIds}"`);
    
    // Check if we have detected service IDs in the context (local context only)
    let contextServiceIds = [];
    if (this.context?.detectedServiceIds?.length > 0) {
      contextServiceIds = this.context.detectedServiceIds;
      console.log(`🔍 Found ${contextServiceIds.length} detected service IDs in local context: ${JSON.stringify(contextServiceIds)}`);
    }
    
    // Validate the service IDs from AI against known services
    if (serviceIdsFromAI.length > 0) {
      // Only use service IDs from AI if they match our detected services or are in valid format
      serviceIdArray = serviceIdsFromAI.filter(id => {
        // Check if the ID is in our context's detected services
        if (contextServiceIds.includes(id)) {
          console.log(`✅ Using AI-provided service ID ${id} that matches a detected service`);
          return true;
        }
        
        // Check if it's a valid service ID format
        if (id.startsWith('service:') || /^\d+(-\d+)?$/.test(id)) {
          console.log(`✅ Using AI-provided service ID ${id} with valid format`);
          return true;
        }
        
        console.log(`⚠️ Ignoring invalid AI-provided service ID: ${id}`);
        return false;
      });
    }
    
    // If none of the AI-provided IDs are valid, use the detected service IDs from context
    if (serviceIdArray.length === 0 && contextServiceIds.length > 0) {
      console.log(`🔄 Using ${contextServiceIds.length} service IDs from context instead of invalid AI inputs`);
      serviceIdArray = contextServiceIds;
    }
    
    // If we still don't have any service IDs, check for highlighted services
    if (serviceIdArray.length === 0) {
      const highlightedServices = this.context?.memory?.highlightedServices || [];
      if (highlightedServices.length > 0) {
        serviceIdArray = highlightedServices.map(s => s.id);
        console.log(`🔄 Using ${serviceIdArray.length} service IDs from highlighted services: ${JSON.stringify(serviceIdArray)}`);
      }
    }
    
    // If we still don't have any service IDs, return an error
    if (serviceIdArray.length === 0) {
      console.error('❌ No service IDs provided or found in context');
      return JSON.stringify({
        success: false,
        error: 'No service IDs provided or found in context',
        message: 'Please specify which service(s) you would like to book.'
      });
    }
    
    console.log(`🔄 Processing service IDs: ${JSON.stringify(serviceIdArray)}`);
    
    // Validate contact information
    if (!name) {
      console.error('❌ Contact name is required');
      return JSON.stringify({
        success: false,
        error: 'Name is required',
        message: 'Please provide a name for the booking.'
      });
    }
    
    if (!mobile) {
      console.error('❌ Contact mobile number is required');
      return JSON.stringify({
        success: false,
        error: 'Mobile number is required',
        message: 'Please provide a mobile number for the booking.'
      });
    }

    // ADDED: Improved check for invalid resourceName
    if (!resourceName || 
        resourceName === 'contact:1234' || 
        resourceName === 'people/C123' || 
        resourceName.includes('placeholder') || 
        resourceName === 'customers/XYZ' ||
        resourceName === 'customer' ||
        !resourceName.match(/^[a-zA-Z]+\/[a-zA-Z0-9]+$/)) {
      console.warn(`⚠️ Detected invalid resourceName: "${resourceName}". This will cause booking failures.`);
      return JSON.stringify({
        success: false,
        error: "Invalid customer resourceName",
        message: "Please use the lookupUser tool first to find the customer's exact resourceName before booking."
      });
    }

    // Try to get the correct resourceName from context if needed
    try {
      // Check if we have user info in the current context
      if (this.context?.memory?.user_info?.mobile && mobile) {
        const contextUserInfo = this.context.memory.user_info;
        const normalizedMobile = mobile.replace(/\D/g, '').slice(-8);
        
        if (contextUserInfo.mobile.replace(/\D/g, '').endsWith(normalizedMobile)) {
          console.log(`✅ Found matching user with resourceName: ${contextUserInfo.resourceName}`);
          inputs.resourceName = contextUserInfo.resourceName;
        }
      }
    } catch (error) {
      console.error('⚠️ Error when trying to fix resourceName:', error);
    }

    console.log('📅 Booking appointment with inputs:', inputs);
    
    // Respect service IDs - don't try to find duplicates early
    // Each ID is important and might be intended, even if they look similar

    // Check if requested date is a Sunday
    const requestedDate = new Date(date);
    if (!isNaN(requestedDate.getTime()) && requestedDate.getDay() === 0) {
      console.log('❌ Booking attempted for Sunday, which is closed');
      return JSON.stringify({
        success: false,
        error: "Cannot book on Sunday",
        message: "I'm sorry, we're closed on Sundays. Please choose another day."
      });
    }
    
    // Check if requested date is a public holiday
    const formattedDateStr = requestedDate.toISOString().split('T')[0];
    const publicHolidays = await fetchPublicHolidays();
    const holidayMatch = publicHolidays.find(holiday => holiday.date === formattedDateStr);
    
    if (holidayMatch) {
      console.log(`❌ Booking attempted for ${holidayMatch.holiday} public holiday`);
      return JSON.stringify({
        success: false,
        error: "Cannot book on public holiday",
        message: `I'm sorry, we're closed on ${holidayMatch.holiday}. Please choose another day.`
      });
    }

    // Format start time for SOHO API
    const timeResult = formatStartTime(date, time);
    if (timeResult.error) {
      return JSON.stringify({
        success: false,
        error: timeResult.error
      });
    }
    
    const { formattedStart, dateObj } = timeResult;

    const processedServiceIds = [];
    let totalDuration = duration || 0;
    let totalPrice = totalAmount || 0;
    const serviceNames = [];

    try {
      // Get all services using the consolidated API
      const allServices = await getAllFormattedServices();

      // Process service IDs and calculate duration if not provided
      for (const serviceId of serviceIdArray) {
        // Keep original serviceId as provided by the AI
        let matchedServiceId = serviceId;
        let serviceName = "Unknown Service";

        // Log the service ID for debugging
        console.log(`🔍 Using service ID as provided: ${serviceId}`);
        
        // Make sure the service ID has the correct prefix
        if (!matchedServiceId.startsWith('service:')) {
          // Try to validate the ID format
          if (/^\d+(-\d+)?$/.test(matchedServiceId)) {
            // Add the service: prefix
            matchedServiceId = `service:${matchedServiceId}`;
            console.log(`✅ Added service: prefix to ID: ${matchedServiceId}`);
          }
        }

        // Try to find service information for display and duration calculation
        let matchedService = allServices.find(s => s.id === matchedServiceId);
        if (!matchedService) {
          // Try to match by normalized ID format
          const normalizedId = matchedServiceId.replace(/^service:/, '');
          matchedService = allServices.find(s => s.id.replace(/^service:/, '') === normalizedId);
          
          if (matchedService) {
            matchedServiceId = matchedService.id; // Use the correctly formatted ID
            console.log(`✅ Found service with normalized ID match: ${matchedService.name} (${matchedService.id})`);
          }
        }
        
        if (matchedService) {
          serviceName = matchedService.name;
          console.log(`✅ Found service information: ${serviceName} (${matchedServiceId})`);
        } else {
          // We will still use the ID as provided, but log a warning
          console.log(`⚠️ Using service ID ${matchedServiceId} as provided (service information not found)`);
        }

        // Store the service ID and name
        processedServiceIds.push(matchedServiceId);
        serviceNames.push(serviceName);

        // Calculate duration and price only if not explicitly provided
        if (!duration && matchedService) {
          try {
            const serviceDuration = matchedService.duration || 60;
            console.log(`✅ Service ${matchedServiceId} duration: ${serviceDuration} minutes`);
            totalDuration += serviceDuration;

            if (matchedService.price && !totalAmount) {
              totalPrice += matchedService.price;
            }
          } catch (e) {
            console.error(`❌ Error getting service duration for ${matchedServiceId}:`, e);
            // Default to 60 minutes if there's an error
            console.log(`⚠️ Using default duration (60 minutes) for ${matchedServiceId}`);
            totalDuration += 60; 
          }
        } else if (!duration) {
          // Default duration for unknown services
          console.log(`⚠️ Using default duration (60 minutes) for ${matchedServiceId}`);
          totalDuration += 60;
        }
      }
    } catch (error) {
      console.error('❌ Error processing services:', error);
      return JSON.stringify({
        success: false,
        error: 'Failed to process services',
        message: error.message
      });
    }

    // Create booking payload for SOHO API
    const bookingData = {
      name,
      mobile,
      resourceName,
      serviceIds: processedServiceIds,
      duration: totalDuration,
      totalAmount: totalPrice,
      additional: additional || 0,
      discount: discount || 0,
      toBeInformed: toBeInformed !== undefined ? toBeInformed : true,
      deposit: deposit || 0,
      force: force === true,
      notes: notes || `Booked via chat assistant for ${name}`
    };

    // Log the final list of services being booked
    console.log(`📋 Final service IDs to book: ${JSON.stringify(processedServiceIds)}`);
    console.log(`📋 Service names being booked: ${JSON.stringify(serviceNames)}`);

    // Prepare GraphQL request
    const graphqlRequest = prepareGraphQLRequest(bookingData, formattedStart);
    console.log('📝 GraphQL request:', JSON.stringify(graphqlRequest));

    // Make the API call to create the booking
    try {
      // Get the SOHO API URL from environment
      const apiUrl = process.env.SOHO_API_URL || '';
      if (!apiUrl) {
        throw new Error('SOHO_API_URL environment variable is not set');
      }

      const authToken = process.env.SOHO_AUTH_TOKEN || '';
      if (!authToken) {
        throw new Error('SOHO_AUTH_TOKEN environment variable is not set');
      }

      console.log(`🔄 Calling SOHO API at ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken
        },
        body: JSON.stringify(graphqlRequest)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ SOHO API error: ${response.status} - ${errorText}`);
        
        return JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: errorText
        });
      }
      
      const result = await response.json();
      console.log('✅ SOHO API response:', result);
      
      // Check for GraphQL errors
      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        return JSON.stringify({
          success: false,
          error: 'GraphQL errors',
          details: result.errors
        });
      }
      
      // Check if appointment was created successfully
      if (result.data?.createAppointment) {
        const appointment = result.data.createAppointment;
        const formattedDate = formatDisplayDate(dateObj);
        const formattedTime = formatDisplayTime(dateObj);
        
        // Format the service list for the response message
        const serviceList = serviceNames.length > 1 
          ? `${serviceNames[0]} and ${serviceNames.slice(1).join(', ')}`
          : serviceNames[0];
        
        return JSON.stringify({
          success: true,
          message: `✅ Appointment successfully booked for ${serviceList} on ${formattedDate} at ${formattedTime} for ${name}.`,
          appointmentId: appointment.id,
          service: serviceNames[0],
          additionalServices: serviceNames.slice(1),
          date: formattedDate,
          time: formattedTime,
          customer: name,
          createdNewContact: appointment.createdNewContact || false,
          status: 'confirmed'
        });
      } else {
        return JSON.stringify({
          success: false,
          error: 'Failed to create appointment',
          details: result
        });
      }
    } catch (error) {
      console.error('❌ Error in booking API call:', error);
      
      return JSON.stringify({
        success: false,
        error: 'Failed to complete booking',
        message: error.message
      });
    }
  }
}

// Function to get highlighted services from context (for AI assistant to suggest)
function getSuggestedServices(context) {
  try {
    if (!context || !context.memory || !context.memory.highlightedServices) {
      return [];
    }
    
    // Get highlighted services that haven't been booked yet
    const suggestedServices = context.memory.highlightedServices
      .filter(service => !service.bookedAt)
      .map(service => ({
        id: service.id,
        name: service.name,
        category: service.category,
        price: service.price,
        highlightedAt: service.highlightedAt
      }));
    
    return suggestedServices;
  } catch (error) {
    console.error('❌ Error getting suggested services:', error);
    return [];
  }
}

/**
 * Creates a bookAppointment tool instance with context
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {StructuredTool} - The bookAppointment tool instance
 */
function createBookAppointmentTool(context, sessionId) {
  return new BookAppointmentTool(context, sessionId);
}

module.exports = {
  BookAppointmentTool,
  createBookAppointmentTool,
  getSuggestedServices
}; 