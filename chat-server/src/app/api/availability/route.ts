import { NextResponse } from 'next/server';
import { calendar_v3 } from '@googleapis/calendar';
import { JWT } from 'google-auth-library';
import { TimeSlot, ServiceAccount } from '@/types/calendar';

// Define types for the request
interface AvailabilityRequest {
  date: string;
  serviceIds?: string[];
  [key: string]: any;
}

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

export async function POST(request: Request): Promise<Response> {
  console.log('📅 Availability API route called');
  
  try {
    // Set a timeout for the request
    const timeoutPromise = new Promise<Response>((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), 30000)
    );
    
    // Handle the actual request logic
    const requestPromise = handleAvailabilityRequest(request);
    
    // Race between the request and the timeout
    return await Promise.race([requestPromise, timeoutPromise]);
  } catch (error) {
    console.error('❌ Availability API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function handleAvailabilityRequest(request: Request): Promise<Response> {
  try {
    // Parse the request body
    const data: AvailabilityRequest = await request.json();
    console.log('📝 Availability request data:', data);
    
    // Validate required fields
    if (!data.date) {
      console.error('❌ Missing required field: date');
      return NextResponse.json(
        { error: 'Missing required field: date' },
        { status: 400 }
      );
    }
    
    // Format date if needed (ensure it's in YYYY-MM-DD format)
    let dateToUse = data.date;
    if (data.date === 'today') {
      dateToUse = new Date().toISOString().split('T')[0];
    } else if (data.date === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateToUse = tomorrow.toISOString().split('T')[0];
    }

    // Parse the date
    const requestedDate = new Date(dateToUse);
    if (isNaN(requestedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    
    // Setup start/end dates
    const startDate = new Date(requestedDate);
    startDate.setHours(10, 0, 0, 0); // 10 AM
    
    const endDate = new Date(requestedDate);
    endDate.setHours(19, 0, 0, 0); // 7 PM
    
    console.log(`🔎 Checking calendar availability for ${dateToUse}`);
    
    try {
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
      
      // Calculate duration based on first service in serviceIds if available
      let duration = 60; // Default 60 minutes
      if (data.serviceIds && data.serviceIds.length > 0) {
        // You can implement service duration logic here if needed
        console.log(`Service IDs provided: ${data.serviceIds.join(', ')}`);
      }
      
      // Find available slots
      const { availableSlots } = await findAvailableTimeSlots(
        startDate, endDate, events, duration
      );
      
      // Format all slots
      const formattedSlots = availableSlots.map(formatTimeSlot);
      
      console.log(`✅ Found ${formattedSlots.length} available time slots`);
      
      return NextResponse.json({
        success: true,
        date: dateToUse,
        availableSlots: formattedSlots
      });
    } catch (calendarError) {
      console.error('❌ Calendar API error:', calendarError);
      console.log('⚠️ Falling back to mock data for availability');
      
      // Fall back to mock data if calendar API fails
      const mockData = generateMockAvailability(dateToUse);
      
      return NextResponse.json({
        success: true,
        date: dateToUse,
        availableSlots: mockData.slots || []
      });
    }
  } catch (error) {
    console.error('❌ Error processing availability request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Format time slot to string
function formatTimeSlot(slot: TimeSlot): string {
  const startTime = new Date(slot.startTime);
  return `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`;
}

// Helper function to find available time slots
async function findAvailableTimeSlots(
  startDate: Date,
  endDate: Date,
  existingEvents: any[],
  duration: number
): Promise<{ availableSlots: TimeSlot[] }> {
  const availableSlots: TimeSlot[] = [];
  let currentTime = new Date(startDate);
  
  // Create busy time ranges from existing events
  const busyRanges = existingEvents.map(event => ({
    start: new Date(event.start.dateTime || event.start.date),
    end: new Date(event.end.dateTime || event.end.date)
  }));
  
  // Identify all possible slots and mark which ones are available
  while (currentTime < endDate) {
    const slotEndTime = new Date(currentTime.getTime() + duration * 60000);
    
    if (slotEndTime > endDate) break;
    
    const slot = {
      startTime: new Date(currentTime),
      endTime: new Date(slotEndTime)
    };
    
    // Check if slot overlaps with any existing event
    const isAvailable = !busyRanges.some(range => 
      (currentTime >= range.start && currentTime < range.end) || 
      (slotEndTime > range.start && slotEndTime <= range.end) ||
      (currentTime <= range.start && slotEndTime >= range.end)
    );
    
    if (isAvailable) {
      availableSlots.push(slot);
    }
    
    // Move to next 30-minute slot
    currentTime = new Date(currentTime.getTime() + 30 * 60000);
  }
  
  return { availableSlots };
}

// Helper function to generate mock availability data for development
function generateMockAvailability(date: string) {
  const slots = [];
  const requestedDate = new Date(date);
  const currentTime = new Date();
  
  // Generate slots every 30 minutes from 9 AM to 5 PM
  for (let hour = 9; hour < 17; hour++) {
    for (let minute of [0, 30]) {
      const slotTime = new Date(requestedDate);
      slotTime.setHours(hour, minute, 0, 0);
      
      // If the slot is in the past, skip it
      if (slotTime <= currentTime && 
          requestedDate.getDate() === currentTime.getDate() && 
          requestedDate.getMonth() === currentTime.getMonth() && 
          requestedDate.getFullYear() === currentTime.getFullYear()) {
        continue;
      }
      
      // Random availability (70% chance of being available)
      const isAvailable = Math.random() < 0.7;
      
      if (isAvailable) {
        // Format as HH:MM
        const hours = slotTime.getHours().toString().padStart(2, '0');
        const minutes = slotTime.getMinutes().toString().padStart(2, '0');
        slots.push(`${hours}:${minutes}`);
      }
    }
  }
  
  return {
    date,
    slots
  };
} 