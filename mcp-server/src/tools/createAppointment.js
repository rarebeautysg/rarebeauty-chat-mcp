const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const moment = require('moment-timezone');
const chrono = require('chrono-node');
const { getAllFormattedServices, getServiceDuration, getHighlightedServices } = require('./listServices');

// Set default timezone for Singapore
moment.tz.setDefault('Asia/Singapore');

const CreateAppointmentSchema = z.object({
  serviceIds: z.array(z.string()),
  datetime: z.string().describe("Date and time for the appointment. Supports formats like 'YYYYMMDDTHHmm' (e.g., '20250523T1100'), natural language like 'tomorrow 2pm', or ISO format."),
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
    duration: Number(bookingData.duration) || 60,
    totalAmount: Number(bookingData.totalAmount) || 0,
    additional: Number(bookingData.additional) || 0,
    discount: Number(bookingData.discount) || 0,
    toBeInformed: typeof bookingData.toBeInformed === 'string'
      ? bookingData.toBeInformed.toLowerCase() === 'true'
      : Boolean(bookingData.toBeInformed),
    deposit: Number(bookingData.deposit) || 0,
    force: bookingData.force || false    
  };
  
  // Return the complete GraphQL request
  return {
    query: mutationTemplate,
    variables: variables
  };
}

// Format date for display using Moment
function formatDisplayDate(dateObj) {
  return moment(dateObj).format('dddd, MMMM D, YYYY');
}

// Format time for display using Moment
function formatDisplayTime(dateObj) {
  return moment(dateObj).format('h:mm A');
}

class CreateAppointmentTool extends StructuredTool {
  constructor(context, sessionId) {
    super();
    this.name = "createAppointment";
    this.description = "Create an appointment for one or more services at a given time. Checks availability too.";
    this.schema = CreateAppointmentSchema;
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(inputs) {
    const { serviceIds, datetime, name, mobile, resourceName, force, duration, totalAmount, additional, discount, toBeInformed, deposit, notes } = inputs;

    console.log(`🔄 Create appointment request for session: ${this.sessionId}`);
    console.log(`📋 Original service IDs provided by AI: ${JSON.stringify(serviceIds)}`);
    
    // Track tool usage in memory
    if (this.context && this.context.memory) {
      if (!this.context.memory.tool_usage) {
        this.context.memory.tool_usage = {};
      }
      
      if (!this.context.memory.tool_usage.createAppointment) {
        this.context.memory.tool_usage.createAppointment = [];
      }
      
      // Log this booking attempt
      this.context.memory.tool_usage.createAppointment.push({
        timestamp: new Date().toISOString(),
        serviceIds,
        datetime,
        name,
        mobile
      });
      
      // Check if any services in serviceIds match highlighted services
      if (this.context.memory.highlightedServices && this.context.memory.highlightedServices.length > 0) {
        const highlightedIds = this.context.memory.highlightedServices.map(s => s.id);
        const matchingIds = Array.isArray(serviceIds) 
          ? serviceIds.filter(id => highlightedIds.includes(id))
          : serviceIds.split(',').map(id => id.trim()).filter(id => highlightedIds.includes(id));
        
        if (matchingIds.length > 0) {
          console.log(`✅ Booking includes ${matchingIds.length} highlighted services previously mentioned by user`);
          
          // Add booking intent to each highlighted service
          matchingIds.forEach(id => {
            const highlightedService = this.context.memory.highlightedServices.find(s => s.id === id);
            if (highlightedService) {
              highlightedService.bookedAt = new Date().toISOString();
              highlightedService.bookingDetails = { datetime, name, mobile };
            }
          });
        }
      }
      
      // Update context memory
      if (serviceIds) {
        // Track last selected services as an array
        if (!this.context.memory.last_selected_services) {
          this.context.memory.last_selected_services = [];
        }
        
        // Convert to array if it's a string
        const parsedIds = Array.isArray(serviceIds) 
          ? serviceIds 
          : serviceIds.split(',').map(id => id.trim());
        
        // Store the entire array of selected services
        this.context.memory.last_selected_services = parsedIds;
      }
      if (datetime) this.context.memory.preferred_datetime = datetime;
    }
    
    // Process service IDs and add validation/fallback mechanism
    let serviceIdArray = [];
    
    // Check if we have detected service IDs in the context (local context only)
    let contextServiceIds = [];
    if (this.context?.detectedServiceIds?.length > 0) {
      contextServiceIds = [...this.context.detectedServiceIds]; // Create a copy of the array
      console.log(`🔍 Found ${contextServiceIds.length} detected service IDs in context: ${JSON.stringify(contextServiceIds)}`);
    }
    
    // Store datetime in memory for future reference if available
    if (datetime) {
      this.context.memory.last_datetime = datetime;
    }
    
    // NEW: Enhanced service ID processing with automatic service name mapping
    if (serviceIds) {
      // Parse serviceIds from AI (could be array or string)
      const parsedServiceIds = Array.isArray(serviceIds) 
        ? serviceIds 
        : serviceIds.split(',').map(id => id.trim());
      
      // Log original service IDs from the AI
      console.log(`📋 Parsed service IDs from AI input: ${JSON.stringify(parsedServiceIds)}`);
      
      // Check if these look like service names instead of IDs
      const lookLikeServiceNames = parsedServiceIds.some(id => 
        !id.startsWith('service:') && 
        (id.includes(' ') || id.includes('-') && !id.match(/^service:\d+(-\d+)?$/))
      );
      
      if (lookLikeServiceNames) {
        console.log(`🔄 Detected service names instead of IDs, attempting to map them...`);
        
        try {
          // Get all available services to map names to IDs
          const allServices = await getAllFormattedServices();
          console.log(`📋 Loaded ${allServices.length} services for mapping`);
          
          const mappedServiceIds = [];
          
          for (const serviceName of parsedServiceIds) {
            // Find matching service by name (case-insensitive, partial match)
            const matchedService = allServices.find(service => {
              const serviceLower = serviceName.toLowerCase().trim();
              const serviceNameLower = (service.name || '').toLowerCase();
              const serviceDescLower = (service.description || '').toLowerCase();
              
              return serviceNameLower.includes(serviceLower) || 
                     serviceDescLower.includes(serviceLower) ||
                     serviceLower.includes(serviceNameLower);
            });
            
            if (matchedService) {
              mappedServiceIds.push(matchedService.id);
              console.log(`✅ Mapped "${serviceName}" to service ID: ${matchedService.id} (${matchedService.name})`);
            } else {
              console.warn(`❌ Could not map service name "${serviceName}" to a service ID`);
            }
          }
          
          if (mappedServiceIds.length > 0) {
            serviceIdArray = mappedServiceIds;
            console.log(`✅ Successfully mapped ${mappedServiceIds.length} service names to IDs: ${JSON.stringify(serviceIdArray)}`);
          } else {
            return JSON.stringify({
              success: false,
              error: 'Failed to map service names to IDs',
              message: `Could not find service IDs for the provided service names: ${parsedServiceIds.join(', ')}. Please ensure the service names are correct.`
            });
          }
          
        } catch (error) {
          console.error('❌ Error mapping service names to IDs:', error);
          return JSON.stringify({
            success: false,
            error: 'Failed to map service names',
            message: 'There was an error mapping the service names to service IDs. Please try again.'
          });
        }
      } else {
        // These look like proper service IDs, but still validate them
        console.log(`📋 Processing service IDs (not names): ${JSON.stringify(parsedServiceIds)}`);
        
        // Check if any of the provided service IDs are in an invalid format
        const invalidServiceIds = parsedServiceIds.filter(id => 
          !id.startsWith('service:') && 
          !/^service:\d+(-\d+)?$/.test(id)
        );
        
        if (invalidServiceIds.length > 0) {
          console.warn(`❌ Invalid service ID format detected: ${JSON.stringify(invalidServiceIds)}`);
          console.warn(`Expected format: "service:XX-YYYY" (e.g., "service:2-2024")`);
          
          return JSON.stringify({
            success: false,
            error: 'Invalid service ID format',
            message: `The service IDs provided (${invalidServiceIds.join(', ')}) are not in the correct format. Expected format: service:XXX`
          });
        }
        
        // RELAXED VALIDATION: Allow properly formatted service IDs even if not in context
        // This allows the system to work when service names are mapped directly
        serviceIdArray = parsedServiceIds;
        console.log(`📋 Using provided service IDs: ${JSON.stringify(serviceIdArray)}`);
        
        // Optional: Still validate against context if available
        if (contextServiceIds.length > 0) {
          const validatedIds = parsedServiceIds.filter(id => contextServiceIds.includes(id));
          if (validatedIds.length > 0) {
            console.log(`✅ ${validatedIds.length} service IDs validated against context`);
          } else {
            console.log(`⚠️ Service IDs not found in context, but proceeding with properly formatted IDs`);
          }
        }
      }
    }
    
    // If no service IDs from AI input, fall back to context or memory
    if (serviceIdArray.length === 0 && contextServiceIds.length > 0) {
      console.log(`🔄 Using all ${contextServiceIds.length} detected service IDs from context`);
      serviceIdArray = contextServiceIds;
    }
    
    // If still no service IDs, check for previously selected services in memory
    if (serviceIdArray.length === 0 && this.context?.memory?.last_selected_services?.length > 0) {
      const previousServices = this.context.memory.last_selected_services;
      console.log(`🔄 No services detected in current context. Using ${previousServices.length} previously selected services from memory`);
      serviceIdArray = previousServices;
    }
    
    // If we still don't have any service IDs, return an error
    if (serviceIdArray.length === 0) {
      console.error('❌ No service IDs provided or detected in context');
      return JSON.stringify({
        success: false,
        error: 'No service IDs provided or detected in context',
        message: 'No services were detected in our conversation. Please mention which specific service(s) you would like to book.'
      });
    }
    
    console.log(`🔄 Final service IDs for booking: ${JSON.stringify(serviceIdArray)}`);
    
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
    console.log(`📅 Original datetime input: "${datetime}"`);
    
    // Validate datetime using Moment.js and Chrono
    let momentDate;
    let isNaturalLanguage = false;
    
    // Try parsing with chrono (natural language)
    try {
      const chronoParsed = chrono.parseDate(datetime);
      if (chronoParsed) {
        console.log(`📅 Parsed with chrono natural language: ${chronoParsed.toISOString()}`);
        momentDate = moment(chronoParsed);
        isNaturalLanguage = true;
      }
    } catch (e) {
      console.log(`❌ Failed to parse with chrono: ${e.message}`);
    }
    
    // If not natural language, try our other parsing methods
    if (!isNaturalLanguage) {
      // Check if datetime is in YYYYMMDDTHHmm format
      if (/^\d{8}T\d{4}$/.test(datetime)) {
        // Parse with Moment using a custom format
        momentDate = moment(datetime, "YYYYMMDD[T]HHmm");
        console.log(`📅 Parsed as YYYYMMDDTHHmm format: ${momentDate.format()}`);
      } else {
        // Try standard formats with Moment
        momentDate = moment(datetime);
        console.log(`📅 Parsed with Moment flexible parsing: ${momentDate.format()}`);
      }
    }
    
    // Check if the date is valid
    if (!momentDate.isValid()) {
      console.log('❌ Invalid datetime format');
      return JSON.stringify({
        success: false,
        error: 'Invalid datetime format',
        message: 'Please provide a valid date and time for your appointment.'
      });
    }
    
    // Check if the appointment is in the past
    const now = moment();
    if (momentDate.isBefore(now)) {
      console.log('❌ Appointment time is in the past:', momentDate.format());
      return JSON.stringify({
        success: false,
        error: 'Invalid appointment time',
        message: 'Appointments cannot be made in the past. Please choose a future date and time.'
      });
    }
    
    // Convert to JavaScript Date object for compatibility
    const validDateObj = momentDate.toDate();
    
    // Check if requested date is a Sunday
    if (momentDate.day() === 0) {
      console.log('❌ Booking attempted for Sunday, which is closed');
      return JSON.stringify({
        success: false,
        error: "Cannot book on Sunday",
        message: "I'm sorry, we're closed on Sundays. Please choose another day."
      });
    }
    
    // Check if requested date is a public holiday
    const formattedDateStr = momentDate.format('YYYY-MM-DD');
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

    // Format start time for SOHO API using Moment
    const formattedStart = momentDate.format('YYYYMMDD[T]HHmm');
    const dateObj = validDateObj;
    
    console.log(`📅 Formatted start time: ${formattedStart}`);

    // Use servicIdArray directly - no more modifications to IDs
    const processedServiceIds = serviceIdArray;
    let totalDuration = duration || 0;
    let totalPrice = totalAmount || 0;
    const serviceNames = [];

    try {
      // Get all services using the consolidated API
      const allServices = await getAllFormattedServices();

      // Process service IDs and calculate duration if not provided
      for (const serviceId of serviceIdArray) {
        let serviceName = "Unknown Service";

        // Find service information for display and duration calculation
        const matchedService = allServices.find(s => s.id === serviceId);
        
        if (matchedService) {
          serviceName = matchedService.name;
          console.log(`✅ Found service information: ${serviceName} (${serviceId})`);
        } else {
          // We will still use the ID as provided, but log a warning
          console.log(`⚠️ Service ID ${serviceId} not found in services data`);
        }

        // Store the service name
        serviceNames.push(serviceName);

        // Calculate duration and price only if not explicitly provided
        if (!duration && matchedService) {
          try {
            const serviceDuration = matchedService.duration || 60;
            console.log(`✅ Service ${serviceId} duration: ${serviceDuration} minutes`);
            totalDuration += serviceDuration;

            if (matchedService.price && !totalAmount) {
              totalPrice += matchedService.price;
            }
          } catch (e) {
            console.error(`❌ Error getting service duration for ${serviceId}:`, e);
            // Default to 60 minutes if there's an error
            console.log(`⚠️ Using default duration (60 minutes) for ${serviceId}`);
            totalDuration += 60; 
          }
        } else if (!duration) {
          // Default duration for unknown services
          console.log(`⚠️ Using default duration (60 minutes) for ${serviceId}`);
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
      toBeInformed: typeof toBeInformed === 'string'
        ? toBeInformed.toLowerCase() === 'true'
        : Boolean(toBeInformed),
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
 * Creates a createAppointment tool instance with context
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {StructuredTool} - The createAppointment tool instance
 */
function createCreateAppointmentTool(context, sessionId) {
  return new CreateAppointmentTool(context, sessionId);
}

module.exports = {
  CreateAppointmentTool,
  createCreateAppointmentTool,
  getSuggestedServices
};
