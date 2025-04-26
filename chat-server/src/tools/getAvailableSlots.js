import { Tool } from "@langchain/core/tools";
import { z } from "zod";

// Cache for public holidays
let publicHolidaysCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
    
    console.log(`📅 Fetched ${holidays.length} public holidays (getAvailableSlots)`);
    return holidays;
  } catch (error) {
    console.error('❌ Error fetching public holidays:', error);
    // Return empty array if there's an error, so the app still works
    return [];
  }
}

export class GetAvailableSlotsTool extends Tool {
  constructor() {
    super();
    this.name = "getAvailableSlots";
    this.description = "Get available appointment time slots for a specific date";
    this.schema = z.object({
      date: z.string().describe("Date to check for availability (YYYY-MM-DD or 'today', 'tomorrow')"),
      serviceIds: z.array(z.string()).optional().describe("Optional array of service IDs to check availability for")
    });
  }

  async _call(args) {
    const { date, serviceIds = [] } = args;
    console.log(`🔍 Checking availability for date: ${date}, services: ${JSON.stringify(serviceIds)}`);
    
    try {
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
      
      // Get the base URL for API calls
      let baseUrl = '';
      if (typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      } else {
        baseUrl = process.env.VERCEL_URL 
          ? `${process.env.VERCEL_URL}`
          : 'http://localhost:3002';
      }
      
      // Call the availability API
      const apiUrl = `${baseUrl}/api/availability`;
      console.log(`🔄 Making API call to ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.SOHO_AUTH_TOKEN || ''
        },
        body: JSON.stringify({
          date: formattedDate,
          serviceIds: serviceIds
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Availability API error: ${response.status} - ${errorText}`);
        
        return JSON.stringify({
          success: false,
          error: `API error: ${response.status}`,
          details: errorText
        });
      }
      
      const result = await response.json();
      console.log(`✅ Availability API success:`, result);
      
      // Format time slots for better readability if needed
      let availableSlots = result.slots || result.availableSlots || [];
      
      // Convert to 12-hour format if they're in 24-hour format
      if (availableSlots.length > 0 && availableSlots[0].match(/^\d{2}:\d{2}$/)) {
        availableSlots = availableSlots.map(slot => {
          const [hours, minutes] = slot.split(':');
          const hour = parseInt(hours, 10);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        });
      }
      
      return JSON.stringify({
        success: true,
        date: formattedDate,
        availableSlots: availableSlots
      });
      
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

// Export an instance of the tool
export const getAvailableSlotsTool = new GetAvailableSlotsTool(); 