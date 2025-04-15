import { DynamicStructuredTool } from "@langchain/core/tools";
import { getServicesData } from "../services/servicesData";

// Format a date as an ISO string date part (YYYY-MM-DD)
function formatDateString(date) {
  return date.toISOString().split('T')[0];
}


export const bookAppointmentTool = new DynamicStructuredTool({
  name: "bookAppointment",
  description: "Book an appointment for one or more services at a specific time",
  schema: {
    type: "object",
    properties: {
      serviceIds: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of service IDs or names to book. For multiple services in one appointment, provide all service IDs."
      },
      date: {
        type: "string",
        description: "The date for the appointment in YYYY-MM-DD format or a natural description like 'tomorrow'"
      },
      time: {
        type: "string",
        description: "The time for the appointment (e.g. '3pm', '15:00')"
      },
      name: {
        type: "string",
        description: "Optional customer name. If not provided, will use 'Test Customer'"
      },
      email: {
        type: "string",
        description: "Optional customer email. If not provided, will use a placeholder email"
      },
      phone: {
        type: "string",
        description: "Optional customer phone number. If not provided, will use a placeholder"
      }
    },
    required: ["serviceIds", "date", "time"]
  },
  func: async ({ serviceIds, date, time, name, email, phone }) => {
    // Convert single serviceId to array if needed
    const serviceIdArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
    
    console.log(`🚨 BOOKING TOOL TRIGGERED 🚨`);
    console.log(`====== BOOKING APPOINTMENT START ======`);
    console.log(`🔖 Services: ${serviceIdArray.join(', ')}`);
    console.log(`📅 Date: ${date}`);
    console.log(`🕒 Time: ${time}`);
    console.log(`👤 Name: ${name || 'Not provided'}`);
    console.log(`📧 Email: ${email || 'Not provided'}`);
    console.log(`📱 Phone: ${phone || 'Not provided'}`);
    
    try {
      // Parse the date - handle natural language
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
          // Default to next day
          requestedDate.setDate(requestedDate.getDate() + 1);
        }
      } else {
        // Try to parse as YYYY-MM-DD
        requestedDate = new Date(date);
        
        // If invalid date, throw error
        if (isNaN(requestedDate.getTime())) {
          console.error(`❌ BOOKING FAILED: Invalid date format: ${date}`);
          throw new Error(`Invalid date format: ${date}. Please use YYYY-MM-DD format or natural language like 'tomorrow'.`);
        }
      }
      
      // Format date for API
      const formattedDate = formatDateString(requestedDate);
      console.log(`📆 Parsed date for booking: ${formattedDate}`);
      
      // Process service IDs
      const processedServiceIds = [];
      let totalDuration = 0;
      let totalPrice = 0;
      const serviceNames = [];
      
      // Get service data
      const servicesData = getServicesData();
      const allServices = await servicesData.getAllServices();
      
      for (const serviceId of serviceIdArray) {
        // Try to match service name if not an ID
        let matchedServiceId = serviceId;
        let serviceName = serviceId;
        
        if (!serviceId.startsWith('service:')) {
          // Normalize service name for matching
          const normalizedServiceName = serviceId.toLowerCase();
          
          // Try to find the service by name in all services
          const matchedService = allServices.find(service => 
            service.name.toLowerCase().includes(normalizedServiceName)
          );
          
          if (matchedService) {
            matchedServiceId = matchedService.id;
            serviceName = matchedService.name;
            console.log(`✅ Matched "${serviceId}" to service ID: ${matchedServiceId} (${serviceName})`);
          } else {
            // Fallback mappings if not found
            if (normalizedServiceName.includes('dense lash')) {
              matchedServiceId = 'service:2-2024'; // Lashes - Full Set - Dense
              serviceName = 'Lashes - Full Set - Dense';
              console.log(`✅ Fallback match for "dense lash" to service ID: ${matchedServiceId}`);
            } else if (normalizedServiceName.includes('natural lash')) {
              matchedServiceId = 'service:1-2024'; // Lashes - Full Set - Natural
              serviceName = 'Lashes - Full Set - Natural';
              console.log(`✅ Fallback match for "natural lash" to service ID: ${matchedServiceId}`);
            } else if (normalizedServiceName.includes('russian lash')) {
              matchedServiceId = 'service:3-2024'; // Lashes - Full Set - Russian
              serviceName = 'Lashes - Full Set - Russian';
              console.log(`✅ Fallback match for "russian lash" to service ID: ${matchedServiceId}`);
            }
          }
        } else {
          // If it's already a service ID, try to find the name
          const matchedService = allServices.find(service => service.id === serviceId);
          if (matchedService) {
            serviceName = matchedService.name;
            console.log(`✅ Found service name for ID ${serviceId}: ${serviceName}`);
          }
        }
        
        processedServiceIds.push(matchedServiceId);
        serviceNames.push(serviceName);
        
        // Get duration and price for this service
        try {
          const duration = await servicesData.getServiceDuration(matchedServiceId);
          console.log(`⏱️ Service "${serviceName}" duration: ${duration} minutes`);
          totalDuration += duration;
          
          // Try to get price
          const matchedService = allServices.find(service => service.id === matchedServiceId);
          if (matchedService && matchedService.price) {
            const price = typeof matchedService.price === 'string' 
              ? parseFloat(matchedService.price.replace(/[^0-9.]/g, ''))
              : parseFloat(matchedService.price);
            totalPrice += price;
            console.log(`💰 Service "${serviceName}" price: $${price}`);
          }
        } catch (durationError) {
          console.error(`❌ Error getting details for service ${matchedServiceId}:`, durationError);
          // Fallback durations based on service type
          let fallbackDuration = 60; // Default duration
          
          if (matchedServiceId.includes('2-2024') || serviceId.toLowerCase().includes('dense lash')) {
            fallbackDuration = 70; // Dense lashes
          } else if (matchedServiceId.includes('1-2024') || serviceId.toLowerCase().includes('natural lash')) {
            fallbackDuration = 70; // Natural lashes
          }
          
          console.log(`⚠️ Using fallback duration: ${fallbackDuration} minutes`);
          totalDuration += fallbackDuration;
        }
      }
      
      // Use default customer info if not provided
      const customerName = name || "Test Customer";
      const customerPhone = phone || "555-123-4567";
      console.log(`👤 Using customer name: ${customerName}`);
      console.log(`📱 Using phone number: ${customerPhone}`);

      
      // Format the start time in YYYYMMDDTHHmm format required by the booking API
      const parsedTime = time.toLowerCase().replace(/\s/g, '');
      let hours = 0;
      let minutes = 0;
      
      if (parsedTime.includes(':')) {
        // Format like "1:00pm"
        const timeParts = parsedTime.split(':');
        hours = parseInt(timeParts[0], 10);
        const minutesPart = timeParts[1].replace(/[^0-9]/g, '');
        minutes = parseInt(minutesPart, 10);
        
        if (parsedTime.includes('pm') && hours < 12) {
          hours += 12;
        }
      } else {
        // Format like "1pm"
        hours = parseInt(parsedTime.replace(/[^0-9]/g, ''), 10);
        if (parsedTime.includes('pm') && hours < 12) {
          hours += 12;
        }
        minutes = 0;
      }
      
      // Create the date with specified time
      const bookingDateTime = new Date(requestedDate);
      bookingDateTime.setHours(hours, minutes, 0, 0);
      
      // Format as YYYYMMDDTHHmm
      const formattedStart = bookingDateTime.getFullYear().toString() +
        (bookingDateTime.getMonth() + 1).toString().padStart(2, '0') +
        bookingDateTime.getDate().toString().padStart(2, '0') + 'T' +
        bookingDateTime.getHours().toString().padStart(2, '0') +
        bookingDateTime.getMinutes().toString().padStart(2, '0');
      
      console.log(`🕒 Formatted start time for booking API: ${formattedStart}`);
      
      // Prepare booking request
      const bookingRequest = {
        name: customerName,
        mobile: customerPhone,
        resourceName: resourceName,
        start: formattedStart,
        serviceIds: processedServiceIds,
        duration: totalDuration,
        totalAmount: totalPrice
      };
      
      console.log(`📝 SENDING BOOKING REQUEST:`, bookingRequest);
      console.log(`🔄 Making API call to /api/booking...`);
      
      // Make the actual booking API call
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookingRequest),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ BOOKING API ERROR: ${response.status} - ${errorText}`);
        console.log(`====== BOOKING APPOINTMENT FAILED ======`);
        throw new Error(`Booking API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ BOOKING API SUCCESS:`, result);
      console.log(`====== BOOKING APPOINTMENT COMPLETE ======`);
      
      if (result.success) {
        // Format services for display
        const serviceDisplay = serviceNames.join(', ');
        
        // Format price for display if available
        let priceDisplay = '';
        if (totalPrice > 0) {
          priceDisplay = ` ($${totalPrice.toFixed(2)})`;
        }
        
        return {
          success: true,
          message: `✅ Appointment successfully booked for ${serviceDisplay}${priceDisplay} on ${formattedDate} at ${time} for ${customerName}. The appointment will last approximately ${totalDuration} minutes.`,
          date: formattedDate,
          time,
          serviceIds: processedServiceIds,
          serviceNames,
          duration: totalDuration,
          customerName,
          customerPhone,
          resourceName,
          bookingId: result.id || 'unknown'
        };
      } else {
        console.error(`❌ BOOKING RESPONSE INDICATES FAILURE:`, result);
        throw new Error(result.error || "Unknown error during booking");
      }
    } catch (error) {
      console.error("❌ BOOKING TOOL ERROR:", error);
      console.log(`====== BOOKING APPOINTMENT FAILED ======`);
      return {
        success: false,
        error: error.message || "Unknown error occurred while booking the appointment"
      };
    }
  }
}); 