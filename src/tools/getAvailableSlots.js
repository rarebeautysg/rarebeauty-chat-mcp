import { DynamicStructuredTool } from "@langchain/core/tools";
import { getServicesData } from "../services/servicesData";

// Format a date as an ISO string date part (YYYY-MM-DD)
function formatDateString(date) {
  return date.toISOString().split('T')[0];
}

// Convert 12-hour time format to 24-hour format for comparison
function normalizeTimeFormat(timeStr) {
  // Handle cases like "1pm", "1:00pm", "1:00 PM", etc.
  timeStr = timeStr.toLowerCase().replace(/\s/g, '');
  
  let hours = 0;
  let minutes = 0;
  
  if (timeStr.includes(':')) {
    // Format like "1:00pm"
    const timeParts = timeStr.split(':');
    hours = parseInt(timeParts[0], 10);
    const minutesPart = timeParts[1].replace(/[^0-9]/g, '');
    minutes = parseInt(minutesPart, 10);
    
    if (timeStr.includes('pm') && hours < 12) {
      hours += 12;
    }
  } else {
    // Format like "1pm"
    hours = parseInt(timeStr.replace(/[^0-9]/g, ''), 10);
    if (timeStr.includes('pm') && hours < 12) {
      hours += 12;
    }
  }
  
  // Format as HH:MM for comparison
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export const getAvailableSlotsTool = new DynamicStructuredTool({
  name: "getAvailableSlots",
  description: "Get available appointment times for given services and date",
  schema: {
    type: "object",
    properties: {
      serviceIds: { 
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of service IDs or names to check availability for. For multiple services, pass all service IDs to find slots that accommodate all services combined."
      },
      date: { 
        type: "string",
        description: "The date to check for in YYYY-MM-DD format or a description like 'tomorrow', 'next week'"
      },
      time: {
        type: "string",
        description: "Optional specific time to check (e.g. '1pm', '13:00'). If provided, will check if this specific time is available."
      }
    },
    required: ["serviceIds", "date"]
  },
  func: async ({ serviceIds, date, time }) => {
    // Convert single serviceId to array if needed
    const serviceIdArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
    
    console.log(`📅 Checking slots for services: ${serviceIdArray.join(', ')} on ${date}${time ? ` at ${time}` : ''}`);
    
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
        
        // If invalid date, default to today
        if (isNaN(requestedDate.getTime())) {
          console.warn(`Invalid date format: ${date}, defaulting to today`);
          requestedDate = new Date();
        }
      }
      
      // Format date for API
      const formattedDate = formatDateString(requestedDate);
      console.log(`Formatted date for API: ${formattedDate}`);
      
      // Get service data
      const servicesData = getServicesData();
      
      // Process all service IDs
      const processedServiceIds = [];
      let totalDuration = 0;
      
      for (const serviceId of serviceIdArray) {
        // Try to match service name if not an ID
        let matchedServiceId = serviceId;
        if (!serviceId.startsWith('service:')) {
          // Normalize service name for matching
          const normalizedServiceName = serviceId.toLowerCase();
          console.log(`Normalizing service name: ${normalizedServiceName}`);
          
          if (normalizedServiceName.includes('dense lash')) {
            matchedServiceId = 'service:2-2024'; // Lashes - Full Set - Dense
            console.log(`Matched to: Lashes - Full Set - Dense (${matchedServiceId})`);
          } else if (normalizedServiceName.includes('natural lash')) {
            matchedServiceId = 'service:1-2024'; // Lashes - Full Set - Natural
            console.log(`Matched to: Lashes - Full Set - Natural (${matchedServiceId})`);
          } else if (normalizedServiceName.includes('russian lash')) {
            matchedServiceId = 'service:3-2024'; // Lashes - Full Set - Russian
            console.log(`Matched to: Lashes - Full Set - Russian (${matchedServiceId})`);
          }
          // Add more mappings as needed
        }
        
        processedServiceIds.push(matchedServiceId);
        
        // Get duration for this service
        try {
          const duration = await servicesData.getServiceDuration(matchedServiceId);
          console.log(`Service "${matchedServiceId}" duration: ${duration} minutes`);
          totalDuration += duration;
        } catch (durationError) {
          console.error(`Error getting duration for service ${matchedServiceId}:`, durationError);
          // Fallback durations based on service type
          let fallbackDuration = 60; // Default duration
          
          if (matchedServiceId.includes('2-2024') || serviceId.toLowerCase().includes('dense lash')) {
            fallbackDuration = 70; // Dense lashes
          } else if (matchedServiceId.includes('1-2024') || serviceId.toLowerCase().includes('natural lash')) {
            fallbackDuration = 70; // Natural lashes
          }
          
          console.log(`Using fallback duration: ${fallbackDuration} minutes`);
          totalDuration += fallbackDuration;
        }
      }
      
      console.log(`Total duration for all services: ${totalDuration} minutes`);
      
      // Use the API route instead of directly calling Calendar API
      console.log(`Fetching calendar data with params:`, {
        date: formattedDate,
        serviceIds: processedServiceIds,
        duration: totalDuration
      });
      
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: formattedDate,
          serviceIds: processedServiceIds,
          duration: totalDuration
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Calendar API error: ${response.status} - ${errorText}`);
        throw new Error(`Calendar API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`Calendar API result:`, result);
      
      // Check if a specific time was requested
      if (time) {
        const normalizedRequestedTime = normalizeTimeFormat(time);
        console.log(`Normalized requested time: ${normalizedRequestedTime}`);
        console.log(`Available slots:`, result.slots);
        
        const isTimeAvailable = result.slots && result.slots.some(slot => 
          slot === normalizedRequestedTime
        );
        
        console.log(`Is time ${normalizedRequestedTime} available:`, isTimeAvailable);
        
        // Return time-specific availability
        if (result.available && result.slots.length > 0) {
          // If the time is not available, get only the two closest slots
          let alternativeSlots = [];
          if (!isTimeAvailable) {
            // Use the closestSlots if available from the API
            if (result.closestSlots && result.closestSlots.length > 0) {
              // Limit to only 2 closest slots
              alternativeSlots = result.closestSlots.slice(0, 2);
            } else if (result.nearbySlots && result.nearbySlots.length > 0) {
              // Fallback to nearbySlots if closestSlots not provided
              alternativeSlots = result.nearbySlots.slice(0, 2);
            } else {
              // Last resort: use all available slots but sorted by proximity to requested time
              const requestedHours = parseInt(normalizedRequestedTime.split(':')[0], 10);
              const requestedMinutes = parseInt(normalizedRequestedTime.split(':')[1], 10);
              const requestedTimeInMinutes = requestedHours * 60 + requestedMinutes;
              
              // Sort slots by how close they are to the requested time
              alternativeSlots = [...result.slots].sort((a, b) => {
                const aHours = parseInt(a.split(':')[0], 10);
                const aMinutes = parseInt(a.split(':')[1], 10);
                const aTimeInMinutes = aHours * 60 + aMinutes;
                
                const bHours = parseInt(b.split(':')[0], 10);
                const bMinutes = parseInt(b.split(':')[1], 10);
                const bTimeInMinutes = bHours * 60 + bMinutes;
                
                return Math.abs(aTimeInMinutes - requestedTimeInMinutes) - 
                       Math.abs(bTimeInMinutes - requestedTimeInMinutes);
              }).slice(0, 2);
            }
          }
          
          const responseData = {
            available: isTimeAvailable,
            date: result.date,
            requestedTime: normalizedRequestedTime,
            timeAvailable: isTimeAvailable,
            slots: isTimeAvailable ? [normalizedRequestedTime] : alternativeSlots,
            message: isTimeAvailable 
              ? `The requested time ${time} is available on ${formattedDate}.` 
              : `The requested time ${time} is not available on ${formattedDate}.`
          };
          console.log(`Returning time-specific response:`, responseData);
          return JSON.stringify(responseData);
        }
      }
      
      // Return a fallback if no slots are available
      if (!result.available || result.slots.length === 0) {
        console.log('No available slots found for the given date and service');
        
        // Suggest the next day
        const nextDay = new Date(requestedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayFormatted = formatDateString(nextDay);
        
        const noSlotsResponse = {
          available: false,
          date: formattedDate,
          message: `No available slots on ${formattedDate}. Please try ${nextDayFormatted} or another date.`,
          suggestedDate: nextDayFormatted
        };
        console.log(`Returning no slots response:`, noSlotsResponse);
        return JSON.stringify(noSlotsResponse);
      }
      
      console.log(`Found ${result.slots.length} available slots`);
      
      // Limit to a maximum of 6 slots spread throughout the day
      let displaySlots = result.slots;
      if (result.slots.length > 6) {
        // Try to select slots that are spread throughout the day
        const morningSlots = result.slots.filter(slot => {
          const hour = parseInt(slot.split(':')[0], 10);
          return hour < 12;
        }).slice(0, 2);
        
        const afternoonSlots = result.slots.filter(slot => {
          const hour = parseInt(slot.split(':')[0], 10);
          return hour >= 12 && hour < 16;
        }).slice(0, 2);
        
        const eveningSlots = result.slots.filter(slot => {
          const hour = parseInt(slot.split(':')[0], 10);
          return hour >= 16;
        }).slice(0, 2);
        
        displaySlots = [...morningSlots, ...afternoonSlots, ...eveningSlots];
        
        // If we don't have 6 slots, fill with others until we do
        if (displaySlots.length < 6) {
          // Add more slots from the original list that aren't already included
          const additionalSlots = result.slots.filter(slot => !displaySlots.includes(slot));
          displaySlots = displaySlots.concat(additionalSlots.slice(0, 6 - displaySlots.length));
        }
        
        // Sort by time
        displaySlots.sort();
      }
      
      const availableSlotsResponse = {
        available: true,
        date: result.date,
        slots: displaySlots,
        totalAvailableSlots: result.slots.length
      };
      console.log(`Returning available slots response:`, availableSlotsResponse);
      return JSON.stringify(availableSlotsResponse);
    } catch (error) {
      console.error('Error getting available slots:', error);
      
      const errorResponse = {
        available: false,
        error: true,
        message: 'Unable to check availability at this time. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
      
      return JSON.stringify(errorResponse);
    }
  }
}); 