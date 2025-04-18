import { NextResponse } from 'next/server';

// Define the consistent interface for booking requests
interface BookingRequest {
  // Required fields
  name: string;
  mobile: string;
  date: string;
  time: string;
  serviceIds: string[];    // Service IDs for booking
  
  // Optional fields
  resourceName?: string;
  duration?: number;
  totalAmount?: number;
  additional?: number;
  discount?: number;
  toBeInformed?: boolean;
  deposit?: number;
  force?: boolean;
  notes?: string;
  
  // Allow additional fields
  [key: string]: any;
}

// Main POST handler with timeout
export async function POST(request: Request): Promise<Response> {
  console.log('🗓️ Booking API route called');
  
  // Set a timeout for the request (30 seconds)
  const timeoutPromise = new Promise<Response>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), 30000);
  });
  
  try {
    // Race the request handling against the timeout
    return await Promise.race([
      handleBookingRequest(request),
      timeoutPromise
    ]) as Response;
  } catch (error) {
    console.error('❌ Booking request failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    );
  }
}

// Main booking request handler
async function handleBookingRequest(request: Request): Promise<Response> {
  try {
    // Get the authorization token
    const authToken = request.headers.get('Authorization') || '';
    
    // Parse the request body
    const data = await request.json();
    
    // Normalize the data for consistency
    const bookingData = normalizeBookingData(data);
    console.log('📝 Normalized booking request data:', bookingData);
    
    // Validate the request data
    const validationError = validateBookingData(bookingData);
    if (validationError) {
      return validationError;
    }
    
    // Format the start time in the format required by SOHO API (YYYYMMDDTHHmm)
    const formattedStart = formatStartTime(bookingData.date, bookingData.time);
    if (typeof formattedStart === 'object') {
      // If an error response was returned
      return formattedStart;
    }
    
    // Prepare the GraphQL request
    const graphqlRequest = prepareGraphQLRequest(bookingData, formattedStart);
    console.log('📝 GraphQL request:', JSON.stringify(graphqlRequest));
    
    // Get the SOHO API URL
    const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
    
    // Call the SOHO API
    const result = await callSOHOAPI(apiUrl, authToken, graphqlRequest);
    if (result.error) {
      return result.error;
    }
    
    // Format and return the response
    return formatSuccessResponse(result.data, bookingData, formattedStart);
    
  } catch (error) {
    console.error('❌ Error processing booking request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Normalize booking data to ensure consistency
function normalizeBookingData(data: any): BookingRequest {
  // Create a copy of the data
  const normalized = { ...data };
  
  // Handle legacy fields for backward compatibility
  if (!normalized.serviceIds || !normalized.serviceIds.length) {
    // Handle services array conversion to serviceIds
    if (normalized.services && normalized.services.length) {
      normalized.serviceIds = normalized.services.map((serviceName: string) => getServiceId(serviceName));
      console.log('⚠️ Using deprecated "services" field. Please update to use "serviceIds" array.');
    } 
    // Handle single service conversion
    else if (normalized.service) {
      const services = Array.isArray(normalized.service) ? normalized.service : [normalized.service];
      normalized.serviceIds = services.map((serviceName: string) => getServiceId(serviceName));
      console.log('⚠️ Using deprecated "service" field. Please update to use "serviceIds" array.');
    }
    // If still no serviceIds, provide an empty array
    if (!normalized.serviceIds) {
      normalized.serviceIds = [];
    }
  }
  
  // Ensure serviceIds is always an array
  if (!Array.isArray(normalized.serviceIds)) {
    normalized.serviceIds = [normalized.serviceIds];
  }
  
  // Set default values for optional fields
  normalized.duration = normalized.duration || 60; // Default 60 minutes
  normalized.totalAmount = normalized.totalAmount || 0;
  normalized.additional = normalized.additional || 0;
  normalized.discount = normalized.discount || 0;
  normalized.toBeInformed = normalized.toBeInformed !== undefined ? normalized.toBeInformed : false;
  normalized.deposit = normalized.deposit || 0;
  normalized.force = normalized.force || false;
  
  return normalized;
}

// Validate booking data
function validateBookingData(data: BookingRequest): NextResponse | null {
  // Required fields check
  const requiredFields = ['name', 'mobile', 'date', 'time', 'serviceIds'];
  const missingFields = requiredFields.filter(field => {
    if (field === 'serviceIds') {
      return !data.serviceIds || data.serviceIds.length === 0;
    }
    return !data[field];
  });
  
  if (missingFields.length > 0) {
    const errorMessage = `Missing required fields: ${missingFields.join(', ')}`;
    console.error(`❌ ${errorMessage}`);
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    );
  }
  
  // Check if resourceName exists and warn if not
  if (!data.resourceName) {
    console.warn('⚠️ No resourceName provided for booking');
  }
  
  // No validation errors
  return null;
}

// Format the start time
function formatStartTime(date: string, time: string): string | NextResponse {
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
        return NextResponse.json(
          { error: `Invalid date format: ${date}` },
          { status: 400 }
        );
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
    return formattedStart;
    
  } catch (error) {
    console.error('❌ Error formatting date-time:', error);
    return NextResponse.json(
      { error: 'Invalid date or time format' },
      { status: 400 }
    );
  }
}

// Prepare the GraphQL request
function prepareGraphQLRequest(bookingData: BookingRequest, formattedStart: string) {
  // The serviceIds are now always available as a required field
  const serviceIds = bookingData.serviceIds;
  
  console.log(`🔑 Service IDs:`, serviceIds);
  
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
    serviceIds: serviceIds,
    duration: bookingData.duration,
    totalAmount: bookingData.totalAmount,
    additional: bookingData.additional,
    discount: bookingData.discount,
    toBeInformed: bookingData.toBeInformed,
    deposit: bookingData.deposit,
    force: bookingData.force
  };
  
  // Return the complete GraphQL request
  return {
    query: mutationTemplate,
    variables: variables
  };
}

// Call the SOHO API
async function callSOHOAPI(endpointUrl: string, authToken: string, requestBody: any) {
  console.log(`🔄 Calling SOHO API at ${endpointUrl}`);
  
  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        'X-Api-Key': process.env.SOHO_API_KEY || ''
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ SOHO API error: ${response.status} - ${errorText}`);
      return {
        error: NextResponse.json(
          { error: `API error: ${response.status}`, details: errorText },
          { status: response.status }
        )
      };
    }
    
    // Parse the response
    const result = await response.json();
    console.log('✅ SOHO API response:', result);
    
    // Check for GraphQL errors
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return {
        error: NextResponse.json(
          { error: 'GraphQL errors', details: result.errors },
          { status: 400 }
        )
      };
    }
    
    return { data: result };
    
  } catch (error) {
    console.error('❌ Error calling SOHO API:', error);
    return {
      error: NextResponse.json(
        { error: 'Error calling SOHO API', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      )
    };
  }
}

// Format the success response
function formatSuccessResponse(result: any, bookingData: BookingRequest, formattedStart: string) {
  if (result.data?.createAppointment) {
    const appointment = result.data.createAppointment;
    
    // Format dates for display
    const formattedDate = formatDisplayDate(formattedStart);
    const formattedTime = formatDisplayTime(formattedStart);
    
    // Get service names for display (optional)
    const serviceNames = bookingData.serviceIds.map(serviceId => {
      // Try to get the service name from our service map
      const entry = Object.entries(getServiceMap()).find(([key, id]) => id === serviceId);
      return entry ? entry[0] : serviceId;
    });
    
    return NextResponse.json({
      success: true,
      appointmentId: appointment.id,
      serviceIds: bookingData.serviceIds,
      serviceNames: serviceNames,
      date: formattedDate,
      time: formattedTime,
      customer: bookingData.name,
      createdNewContact: appointment.createdNewContact || false,
      status: 'confirmed'
    });
  } else {
    return NextResponse.json({
      success: false,
      error: 'Failed to create appointment',
      details: result
    }, { status: 500 });
  }
}

// Format date for display
function formatDisplayDate(formattedStart: string): string {
  const year = parseInt(formattedStart.substring(0, 4), 10);
  const month = parseInt(formattedStart.substring(4, 6), 10) - 1;
  const day = parseInt(formattedStart.substring(6, 8), 10);
  
  const dateObj = new Date(year, month, day);
  
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format time for display
function formatDisplayTime(formattedStart: string): string {
  const hours24 = parseInt(formattedStart.substring(9, 11), 10);
  const minutes = formattedStart.substring(11, 13);
  const isPM = hours24 >= 12;
  const hours12 = hours24 % 12 || 12;
  
  return `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
}

// Helper function to get service ID from service name
function getServiceId(serviceName: string): string {
  const serviceMap = getServiceMap();
  
  // Normalize the service name for case-insensitive matching
  const normalizedName = serviceName.toLowerCase();
  
  // Find a matching service or fallback to a default
  for (const [key, id] of Object.entries(serviceMap)) {
    if (normalizedName.includes(key)) {
      return id;
    }
  }
  
  // If no match found, return a generic service ID
  return 'service:2-2024'; // Default to facial
}

// Helper function to get the service map
function getServiceMap(): Record<string, string> {
  return {
    'facial': 'service:2-2024',
    'massage': 'service:3-2024',
    'lashes': 'service:4-2024',
    'dense lashes': 'service:5-2024',
    'brows': 'service:6-2024',
    'waxing': 'service:7-2024',
    'beauty': 'service:8-2024',
    'nails': 'service:9-2024',
    'haircut': 'service:10-2024',
    'blowout': 'service:11-2024',
    'hair color': 'service:12-2024',
    'extensions': 'service:13-2024',
    'hair': 'service:14-2024'
  };
} 