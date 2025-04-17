import { NextResponse } from 'next/server';

// Define types for the request
interface AvailabilityRequest {
  date: string;
  serviceIds?: string[];
  [key: string]: any;
}

export async function POST(request: Request) {
  console.log('📅 Availability API route called');
  
  try {
    // Set a timeout for the request
    const timeoutPromise = new Promise((_, reject) => 
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

async function handleAvailabilityRequest(request: Request) {
  try {
    // Get the authorization token
    const authToken = request.headers.get('Authorization') || '';
    
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
    
    // Define the GraphQL query for fetching availability
    const graphqlQuery = {
      query: `
        query GetAvailableSlots($date: String!, $serviceIds: [String]) {
          availableSlots(date: $date, serviceIds: $serviceIds) {
            date
            slots
          }
        }
      `,
      variables: {
        date: dateToUse,
        serviceIds: data.serviceIds || []
      }
    };
    
    // Make the request to the actual API
    const apiUrl = process.env.SOHO_API_URL || 'https://api.soho.sg/graphql';
    console.log(`🔄 Calling SOHO API at ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
        'X-Api-Key': process.env.SOHO_API_KEY || ''
      },
      body: JSON.stringify(graphqlQuery)
    });
    
    // Handle API response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ SOHO API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    console.log('✅ SOHO API response:', result);
    
    // Handle GraphQL errors if any
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return NextResponse.json(
        { error: 'GraphQL errors', details: result.errors },
        { status: 400 }
      );
    }
    
    // If no real API is available, generate mock data for development
    let availabilityData;
    if (result.data?.availableSlots) {
      availabilityData = result.data.availableSlots;
    } else {
      console.log('⚠️ Using mock data for availability');
      availabilityData = generateMockAvailability(dateToUse);
    }
    
    return NextResponse.json({
      success: true,
      date: dateToUse,
      availableSlots: availabilityData.slots || []
    });
    
  } catch (error) {
    console.error('❌ Error processing availability request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
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