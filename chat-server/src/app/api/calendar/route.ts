import { NextResponse } from 'next/server';
import { calendar_v3 } from '@googleapis/calendar';
import { JWT } from 'google-auth-library';
import { TimeSlot, ServiceAccount } from '@/types/calendar';

// Calendar service on the server side
async function getCalendarService() {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('Google service account not configured');
    }

    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
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

// API route handler for getting available slots
export async function POST(request: Request) {
  try {
    const { date, serviceId, duration, requestedTime } = await request.json();
    
    // Parse the date
    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    
    // Setup start/end dates
    const startDate = new Date(requestedDate);
    startDate.setHours(10, 0, 0, 0); // 10 AM
    
    const endDate = new Date(requestedDate);
    endDate.setHours(19, 0, 0, 0); // 7 PM
    
    // Get calendar service
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
      startDate, endDate, events, parseInt(duration) || 60, requestedTime
    );
    
    // Format all slots
    const formatTimeSlot = (slot: TimeSlot): string => {
      const startTime = new Date(slot.startTime);
      return `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
    };
    
    const formattedSlots = availableSlots.map(formatTimeSlot);
    const formattedNearbySlots = nearbySlots.map(formatTimeSlot);
    
    // Check for a specific requested time
    let exactTimeAvailable = false;
    let closestSlots: string[] = [];
    
    if (requestedTime) {
      // Parse requested time (format like "13:00" or "1:00 PM")
      let requestedHour = 0;
      let requestedMinute = 0;
      
      // Handle formats like "13:00"
      if (requestedTime.includes(':')) {
        const [hours, minutes] = requestedTime.split(':');
        requestedHour = parseInt(hours, 10);
        requestedMinute = parseInt(minutes, 10);
      } else {
        // Handle formats like "1pm"
        const isPM = requestedTime.toLowerCase().includes('pm');
        const numberPart = requestedTime.replace(/[^0-9]/g, '');
        requestedHour = parseInt(numberPart, 10);
        if (isPM && requestedHour < 12) requestedHour += 12;
      }
      
      // Format as HH:MM for comparison
      const normalizedRequestedTime = `${requestedHour.toString().padStart(2, '0')}:${requestedMinute.toString().padStart(2, '0')}`;
      
      // Check if the specific time is available
      exactTimeAvailable = formattedSlots.includes(normalizedRequestedTime);
      
      // If not available, get slots before and after
      if (!exactTimeAvailable) {
        closestSlots = formattedNearbySlots.filter(slot => slot !== normalizedRequestedTime);
      }
    }
    
    return NextResponse.json({ 
      available: formattedSlots.length > 0,
      date: requestedDate.toISOString().split('T')[0],
      slots: formattedSlots,
      // Include additional information
      requestedTime: requestedTime || null,
      exactTimeAvailable: requestedTime ? exactTimeAvailable : null,
      nearbySlots: formattedNearbySlots,
      closestSlots: closestSlots.length > 0 ? closestSlots : null
    });
  } catch (error) {
    console.error('Error in calendar API route:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch available slots',
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// Helper function to find available time slots and slots before/after occupied times
async function findAvailableAndNearbyTimeSlots(
  startDate: Date,
  endDate: Date,
  existingEvents: any[],
  duration: number,
  requestedTime?: string
): Promise<{ availableSlots: TimeSlot[], nearbySlots: TimeSlot[] }> {
  const availableSlots: TimeSlot[] = [];
  const occupiedSlots: TimeSlot[] = [];
  const nearbySlots: TimeSlot[] = [];
  let currentTime = new Date(startDate);
  
  // Create busy time ranges from existing events
  const busyRanges = existingEvents.map(event => ({
    start: new Date(event.start.dateTime || event.start.date),
    end: new Date(event.end.dateTime || event.end.date)
  }));
  
  // Track all possible slots for the day to identify occupied ones
  const allPossibleSlots: TimeSlot[] = [];
  
  // First identify all possible slots and mark which ones are occupied
  while (currentTime < endDate) {
    const slotEndTime = new Date(currentTime.getTime() + duration * 60000);
    
    if (slotEndTime > endDate) break;
    
    const slot = {
      startTime: new Date(currentTime),
      endTime: new Date(slotEndTime)
    };
    
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