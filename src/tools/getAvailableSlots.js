import { Tool } from "@langchain/core/tools";
import { z } from "zod";

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
      
      // Get the base URL for API calls
      let baseUrl = '';
      if (typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      } else {
        baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
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