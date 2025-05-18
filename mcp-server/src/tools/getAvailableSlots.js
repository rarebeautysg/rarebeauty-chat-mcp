const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { calendar_v3 } = require('@googleapis/calendar');
const { JWT } = require('google-auth-library');
const axios = require('axios');
const { getServiceById } = require('./listServices');

// Cache for public holidays
let publicHolidaysCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Time slot interface
class TimeSlot {
  constructor(startTime, endTime) {
    this.startTime = startTime;
    this.endTime = endTime;
  }
}

// Calendar service on the server side
async function getCalendarService() {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('Google service account not configured');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const calendarId = process.env.CALENDAR_ID;
    
    if (!calendarId) {
      throw new Error('Calendar ID not configured');
    }

    const auth = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = new calendar_v3.Calendar({ auth });
    
    return { calendar, calendarId };
  } catch (error) {
    console.error('Error initializing calendar service:', error);
    throw error;
  }
}

// Function to fetch Singapore public holidays from data.gov.sg
async function fetchPublicHolidays() {
  // Check cache first
  const now = Date.now();
  if (publicHolidaysCache && (now - lastFetchTime < CACHE_DURATION)) {
    console.log('📅 Using cached public holidays data (getAvailableSlots)');
    return publicHolidaysCache;
  }
  
  try {
    console.log('📅 Fetching Singapore public holidays from data.gov.sg (getAvailableSlots)');
    const response = await axios.get('https://data.gov.sg/api/action/datastore_search?resource_id=d_3751791452397f1b1c80c451447e40b7');
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch public holidays: ${response.status}`);
    }
    
    const data = response.data;
    
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
    
    console.log(`📅 Fetched ${holidays.length} public holidays (getAvailableSlots)`);
    return holidays;
  } catch (error) {
    console.error('❌ Error fetching public holidays:', error);
    // Return empty array if there's an error, so the app still works
    return [];
  }
}

// Helper function to parse time string (format like "13:00" or "1:00 PM")
function parseTimeString(timeString) {
  if (!timeString) return null;
  
  let hours = 0;
  let minutes = 0;
  
  // Handle formats like "13:00"
  if (timeString.includes(':')) {
    const [hoursStr, minutesStr] = timeString.split(':');
    hours = parseInt(hoursStr, 10);
    minutes = parseInt(minutesStr, 10);
  } else {
    // Handle formats like "1pm"
    const isPM = timeString.toLowerCase().includes('pm');
    const numberPart = timeString.replace(/[^0-9]/g, '');
    hours = parseInt(numberPart, 10);
    if (isPM && hours < 12) hours += 12;
  }
  
  return { hours, minutes };
}

// Helper function to format time slot (returns string like "10:00")
function formatTimeSlot(slot) {
  const startTime = new Date(slot.startTime);
  return `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
}

// Helper function to find available time slots and slots before/after occupied times
async function findAvailableAndNearbyTimeSlots(
  startDate,
  endDate,
  existingEvents,
  duration,
  requestedTime
) {
  const availableSlots = [];
  const occupiedSlots = [];
  const nearbySlots = [];
  let currentTime = new Date(startDate);
  
  // Create busy time ranges from existing events
  const busyRanges = existingEvents.map(event => ({
    start: new Date(event.start.dateTime || event.start.date),
    end: new Date(event.end.dateTime || event.end.date)
  }));
  
  // Track all possible slots for the day to identify occupied ones
  const allPossibleSlots = [];
  
  // First identify all possible slots and mark which ones are occupied
  while (currentTime < endDate) {
    const slotEndTime = new Date(currentTime.getTime() + duration * 60000);
    
    if (slotEndTime > endDate) break;
    
    const slot = new TimeSlot(
      new Date(currentTime),
      new Date(slotEndTime)
    );
    
    allPossibleSlots.push(slot);
    
    // Check if slot overlaps with any existing event
    const isAvailable = !busyRanges.some(range => 
      (currentTime >= range.start && currentTime < range.end) || 
      (slotEndTime > range.start && slotEndTime <= range.end) ||
      (currentTime <= range.start && slotEndTime >= range.end)
    );
    
    if (isAvailable) {
      availableSlots.push(slot);
    } else {
      occupiedSlots.push(slot);
    }
    
    // Move to next 15-minute slot
    currentTime = new Date(currentTime.getTime() + 15 * 60000);
  }
  
  // For each occupied slot, find slots before and after it
  for (const occupiedSlot of occupiedSlots) {
    // Find slots that are up to 2 slots before the occupied slot
    const slotsBefore = allPossibleSlots.filter(slot => 
      slot.endTime <= occupiedSlot.startTime && 
      slot.startTime >= new Date(occupiedSlot.startTime.getTime() - (2 * 15 * 60000))
    );
    
    // Find slots that are up to 2 slots after the occupied slot
    const slotsAfter = allPossibleSlots.filter(slot => 
      slot.startTime >= occupiedSlot.endTime && 
      slot.startTime <= new Date(occupiedSlot.endTime.getTime() + (2 * 15 * 60000))
    );
    
    // Add available slots near occupied ones
    [...slotsBefore, ...slotsAfter].forEach(slot => {
      // Only add if the slot is available
      if (availableSlots.some(availableSlot => 
        availableSlot.startTime.getTime() === slot.startTime.getTime()
      )) {
        // Check if this nearby slot is already in the list
        const alreadyAdded = nearbySlots.some(nearbySlot => 
          nearbySlot.startTime.getTime() === slot.startTime.getTime()
        );
        
        if (!alreadyAdded) {
          nearbySlots.push(slot);
        }
      }
    });
  }
  
  // Sort nearby slots by time
  nearbySlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  return { availableSlots, nearbySlots };
}

// Convert slots to human-readable format
function convertSlotsToHumanReadable(slots) {
  if (!slots || !slots.length) return [];
  
  return slots.map(slot => {
    const startHour = slot.startTime.getHours();
    const startMinutes = slot.startTime.getMinutes();
    const isPM = startHour >= 12;
    const hour12 = startHour % 12 || 12;
    return `${hour12}:${startMinutes.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
  });
}

class GetAvailableSlotsTool extends Tool {
  constructor(context, sessionId) {
    super();
    this.name = "getAvailableSlots";
    this.description = "Get available appointment time slots for a specific date";
    this.schema = z.object({
      date: z.string().describe("Date to check for availability (YYYY-MM-DD or 'today', 'tomorrow')"),
      serviceIds: z.array(z.string()).optional().describe("Optional array of service IDs to check availability for"),
      requestedTime: z.string().optional().describe("Optional specific time to check (format: 'HH:MM' or 'H:MM AM/PM')")
    });
    
    // Store context and session ID
    this.context = context;
    this.sessionId = sessionId;
  }

  async _call(args) {
    const { date, serviceIds = [], requestedTime } = args;
    console.log(`🔍 Checking availability for date: ${date}, services: ${JSON.stringify(serviceIds)}, requestedTime: ${requestedTime || 'none'} (Session: ${this.sessionId})`);
    
    try {
      // IMPORTANT: Check if we're in update mode (i.e., an appointment ID exists in memory)
      // If so, we should skip availability checks for updates
      if (this.context && this.context.memory && this.context.memory.current_appointment_id) {
        console.log(`⚠️ Detected current_appointment_id in memory: ${this.context.memory.current_appointment_id}`);
        console.log(`⚠️ Skipping availability checks for update flow as requested`);
        
        // Return a response indicating we should skip availability checks for updates
        return JSON.stringify({
          success: true,
          message: "This is an appointment update. Availability checks are skipped for updates.",
          isUpdateFlow: true,
          appointmentId: this.context.memory.current_appointment_id,
          date: date,
          requestedTime: requestedTime || null,
          // Marking the requested time as available to allow updates to proceed
          exactTimeAvailable: true,
          hasAvailability: true,
          availableSlots: requestedTime ? [requestedTime] : ["Any time available for updates"],
        });
      }
      
      // Track tool usage in memory
      if (this.context && this.context.memory) {
        if (!this.context.memory.tool_usage) {
          this.context.memory.tool_usage = {};
        }
        
        if (!this.context.memory.tool_usage.getAvailableSlots) {
          this.context.memory.tool_usage.getAvailableSlots = [];
        }
        
        // Store the request in tool usage
        this.context.memory.tool_usage.getAvailableSlots.push({
          timestamp: new Date().toISOString(),
          params: { date, serviceIds, requestedTime }
        });
        
        // Update context memory with preferred date and service
        if (date) {
          this.context.memory.preferred_date = date;
        }
        
        if (serviceIds && serviceIds.length > 0) {
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
      }
      
      // Parse the date
      let requestedDate;
      if (date.toLowerCase() === 'today') {
        requestedDate = new Date();
      } else if (date.toLowerCase() === 'tomorrow') {
        requestedDate = new Date();
        requestedDate.setDate(requestedDate.getDate() + 1);
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
      
      // Format to YYYY-MM-DD
      const formattedDate = requestedDate.toISOString().split('T')[0];
      console.log(`📅 Formatted date for availability check: ${formattedDate}`);
      
      // Check if requested date is a Sunday
      const dayOfWeek = requestedDate.getDay();
      if (dayOfWeek === 0) {
        console.log('❌ Availability check attempted for Sunday, which is closed');
        return JSON.stringify({
          success: false,
          error: "Cannot check availability on Sunday",
          message: "I'm sorry, we're closed on Sundays. Please choose another day.",
          date: formattedDate,
          availableSlots: []
        });
      }
      
      // Check if requested date is a public holiday
      const publicHolidays = await fetchPublicHolidays();
      const holidayMatch = publicHolidays.find(holiday => holiday.date === formattedDate);
      
      if (holidayMatch) {
        console.log(`❌ Availability check attempted for ${holidayMatch.holiday} public holiday`);
        return JSON.stringify({
          success: false,
          error: "Cannot check availability on public holiday",
          message: `I'm sorry, we're closed on ${holidayMatch.holiday}. Please choose another day.`,
          date: formattedDate,
          availableSlots: []
        });
      }
      
      // Calculate service duration
      let serviceDuration = 60; // Default duration in minutes
      if (serviceIds && serviceIds.length > 0) {
        // Try to get the service duration from the first service
        try {
          const service = await getServiceById(serviceIds[0]);
          if (service && service.duration) {
            serviceDuration = service.duration;
            console.log(`📏 Using service duration: ${serviceDuration} minutes`);
          }
        } catch (error) {
          console.error('❌ Error getting service duration:', error);
          console.log('⚠️ Using default duration of 60 minutes');
        }
      }
      
      // Setup start/end dates for the business hours
      const startDate = new Date(requestedDate);
      startDate.setHours(10, 0, 0, 0); // 10 AM
      
      const endDate = new Date(requestedDate);
      endDate.setHours(19, 0, 0, 0); // 7 PM
      
      // Connect to Google Calendar
      try {
        const { calendar, calendarId } = await getCalendarService();
        
        // Get calendar events for the day
        const response = await calendar.events.list({
          calendarId,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
        });
        
        const events = response.data.items || [];
        console.log(`Found ${events.length} existing events for the day`);
        
        // Find available slots and nearby slots
        const { availableSlots, nearbySlots } = await findAvailableAndNearbyTimeSlots(
          startDate, endDate, events, serviceDuration, requestedTime
        );
        
        // Format all slots
        const formattedSlots = availableSlots.map(formatTimeSlot);
        const formattedNearbySlots = nearbySlots.map(formatTimeSlot);
        
        // Check for a specific requested time
        let exactTimeAvailable = false;
        let closestSlots = [];
        
        if (requestedTime) {
          // Parse the requested time
          const parsedTime = parseTimeString(requestedTime);
          
          if (parsedTime) {
            // Format as HH:MM for comparison
            const normalizedRequestedTime = `${parsedTime.hours.toString().padStart(2, '0')}:${parsedTime.minutes.toString().padStart(2, '0')}`;
            
            // Check if the specific time is available
            exactTimeAvailable = formattedSlots.includes(normalizedRequestedTime);
            
            // If not available, get slots before and after
            if (!exactTimeAvailable) {
              closestSlots = formattedNearbySlots.filter(slot => slot !== normalizedRequestedTime);
            }
          }
        }
        
        // Convert to 12-hour format for better readability
        const humanReadableSlots = formattedSlots.map(slot => {
          const [hours, minutes] = slot.split(':');
          const hour = parseInt(hours, 10);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        });
        
        const humanReadableNearbySlots = formattedNearbySlots.map(slot => {
          const [hours, minutes] = slot.split(':');
          const hour = parseInt(hours, 10);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        });
        
        // Prepare response with all gathered information
        return JSON.stringify({
          success: true,
          date: formattedDate,
          availableSlots: humanReadableSlots,
          hasAvailability: humanReadableSlots.length > 0,
          requestedTime: requestedTime || null,
          exactTimeAvailable: requestedTime ? exactTimeAvailable : null,
          nearbySlots: humanReadableNearbySlots,
          closestSlots: closestSlots.length > 0 ? closestSlots.map(slot => {
            const [hours, minutes] = slot.split(':');
            const hour = parseInt(hours, 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${ampm}`;
          }) : null
        });
        
      } catch (calendarError) {
        console.error('❌ Error accessing Google Calendar:', calendarError);
        return JSON.stringify({
          success: false,
          error: "Failed to access appointment calendar",
          message: calendarError.message || "We're experiencing technical difficulties with our booking system. Please try again later or contact us directly.",
          date: formattedDate
        });
      }
      
    } catch (error) {
      console.error('❌ Error in getAvailableSlots tool:', error);
      return JSON.stringify({
        success: false,
        error: "Failed to get available slots",
        message: error.message
      });
    }
  }
}

/**
 * Creates a getAvailableSlots tool instance with context
 * @param {Object} context - The MCP context for the session
 * @param {string} sessionId - The session ID
 * @returns {Tool} - The getAvailableSlots tool instance
 */
function createGetAvailableSlotsTool(context, sessionId) {
  return new GetAvailableSlotsTool(context, sessionId);
}

// Just export the factory function
module.exports = {
  createGetAvailableSlotsTool
}; 