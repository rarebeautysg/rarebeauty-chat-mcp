import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getAllFormattedServices, getServiceDuration } from "../services/servicesData";

const BookAppointmentSchema = z.object({
  serviceIds: z.array(z.string()),
  date: z.string(),
  time: z.string(),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking")
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

export class BookAppointmentTool extends StructuredTool {
  constructor() {
    super();
    this.name = "bookAppointment";
    this.description = "Book appointment for one or more services at a given time. Checks availability too.";
    this.schema = BookAppointmentSchema;
  }

  async _call(inputs) {
    const { serviceIds, date, time, name, mobile, resourceName } = inputs;

    // Check required fields
    if (!name || !mobile || !resourceName) {
      console.log('❌ Missing required booking fields:', { name, mobile, resourceName });
      return JSON.stringify({
        success: false,
        error: "Missing value for input variable resourceName, name, mobile",
        troubleshootingUrl: 'https://js.langchain.com/docs/troubleshooting/errors/INVALID_PROMPT_INPUT/'
      });
    }

    console.log('📅 Booking appointment with inputs:', { serviceIds, date, time, name, mobile, resourceName });
    
    const serviceIdArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];

    // Process date
    let requestedDate;
    if (date.toLowerCase() === 'today') {
      requestedDate = new Date();
    } else if (date.toLowerCase() === 'tomorrow') {
      requestedDate = new Date();
      requestedDate.setDate(requestedDate.getDate() + 1);
    } else if (date.toLowerCase().includes('next')) {
      requestedDate = new Date();
      if (date.toLowerCase().includes('week')) {
        requestedDate.setDate(requestedDate.getDate() + 7);
      } else if (date.toLowerCase().includes('month')) {
        requestedDate.setMonth(requestedDate.getMonth() + 1);
      } else {
        requestedDate.setDate(requestedDate.getDate() + 1);
      }
    } else {
      requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        console.log(`❌ Invalid date format: ${date}`);
        return JSON.stringify({
          success: false,
          error: `Invalid date format: ${date}`
        });
      }
    }

    const formattedDate = requestedDate.toISOString().split('T')[0];
    console.log(`📅 Formatted date: ${formattedDate}`);

    // Check if requested date is a Sunday
    const dayOfWeek = requestedDate.getDay();
    if (dayOfWeek === 0) {
      console.log('❌ Booking attempted for Sunday, which is closed');
      return JSON.stringify({
        success: false,
        error: "Cannot book on Sunday",
        message: "I'm sorry, we're closed on Sundays. Please choose another day."
      });
    }
    
    // Check if requested date is a public holiday
    const publicHolidays = await fetchPublicHolidays();
    const holidayMatch = publicHolidays.find(holiday => holiday.date === formattedDate);
    
    if (holidayMatch) {
      console.log(`❌ Booking attempted for ${holidayMatch.holiday} public holiday`);
      return JSON.stringify({
        success: false,
        error: "Cannot book on public holiday",
        message: `I'm sorry, we're closed on ${holidayMatch.holiday}. Please choose another day.`
      });
    }

    const processedServiceIds = [];
    let totalDuration = 0;
    let totalPrice = 0;
    const serviceNames = [];

    try {
      // Get all services using the consolidated API
      const allServices = await getAllFormattedServices();

      // Find the primary service to book (using first service in array)
      let primaryService = serviceIdArray[0]; 
      
      for (const serviceId of serviceIdArray) {
        let matchedServiceId = serviceId;
        let serviceName = serviceId;

        if (!serviceId.startsWith('service:')) {
          const matchedService = allServices.find(s =>
            s.name.toLowerCase() === serviceId.toLowerCase() ||
            s.name.toLowerCase().includes(serviceId.toLowerCase())
          );

          if (matchedService) {
            matchedServiceId = matchedService.id;
            serviceName = matchedService.name;
          }
        } else {
          const matchedService = allServices.find(s => s.id === serviceId);
          if (matchedService) {
            serviceName = matchedService.name;
          }
        }

        processedServiceIds.push(matchedServiceId);
        serviceNames.push(serviceName);

        try {
          // Get duration using the consolidated API
          const duration = await getServiceDuration(matchedServiceId);
          totalDuration += duration;

          const matchedService = allServices.find(s => s.id === matchedServiceId);
          if (matchedService && matchedService.price) {
            totalPrice += matchedService.price;
          }
        } catch (e) {
          console.error(`❌ Error getting service duration for ${matchedServiceId}:`, e);
          totalDuration += 60; // Default to 60 minutes if there's an error
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

    // Make the API call to create the booking
    try {
      // Get the base URL
      let baseUrl = '';
      if (typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      } else {
        baseUrl = process.env.VERCEL_URL 
          ? `${process.env.VERCEL_URL}`
          : 'http://localhost:3002';
      }
      
      // Create the request that matches our new API format
      const bookingRequest = {
        services: serviceNames, // Use the services array field
        date: formattedDate,
        time: time, // Use original time format, API will handle parsing
        resourceName, // Pass through the resourceName
        serviceIds: processedServiceIds, // Pass all service IDs for reference
        name, // Include customer name
        mobile, // Include mobile number
        duration: totalDuration, // Pass duration in minutes
        totalAmount: totalPrice, // Pass total price
        additional: 0,
        discount: 0,
        toBeInformed: true,
        deposit: 0,
        force: false,
        notes: `Booked via chat assistant for ${name}`
      };
      
      const apiUrl = `${baseUrl}/api/booking`;
      console.log(`🔄 Making booking API call to ${apiUrl}`);
      console.log('📝 New booking request format:', bookingRequest);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.SOHO_AUTH_TOKEN || ''
        },
        body: JSON.stringify(bookingRequest)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Booking API error: ${response.status} - ${errorText}`);
        
        return JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: errorText
        });
      }
      
      const result = await response.json();
      console.log(`✅ Booking successful:`, result);
      
      // Format response based on API result
      let serviceMessage = result.service;
      if (result.additionalServices && result.additionalServices.length > 0) {
        serviceMessage += ` and ${result.additionalServices.join(', ')}`;
      }
      
      return JSON.stringify({
        success: true,
        message: `✅ Appointment successfully booked for ${serviceMessage} on ${result.date} at ${result.time} for ${name}.`,
        appointmentId: result.appointmentId,
        service: result.service,
        additionalServices: result.additionalServices || [],
        date: result.date,
        time: result.time,
        customer: result.customer,
        status: result.status
      });
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