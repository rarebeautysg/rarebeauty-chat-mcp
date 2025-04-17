import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getServicesData } from "../services/servicesData";

const BookAppointmentSchema = z.object({
  serviceIds: z.array(z.string()),
  date: z.string(),
  time: z.string(),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking")
});

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

    const processedServiceIds = [];
    let totalDuration = 0;
    let totalPrice = 0;
    const serviceNames = [];

    const servicesData = getServicesData();
    const allServices = await servicesData.getAllServices();

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
        const duration = await servicesData.getServiceDuration(matchedServiceId);
        totalDuration += duration;

        const matchedService = allServices.find(s => s.id === matchedServiceId);
        if (matchedService && matchedService.price) {
          const price = typeof matchedService.price === 'string'
            ? parseFloat(matchedService.price.replace(/[^0-9.]/g, ''))
            : parseFloat(matchedService.price);
          totalPrice += price;
        }
      } catch (e) {
        totalDuration += 60;
      }
    }

    // Make the API call to create the booking
    try {
      // Get the base URL
      let baseUrl = '';
      if (typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      } else {
        baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
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