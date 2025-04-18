import { NextResponse } from 'next/server';

// Main POST handler with detailed logging
export async function POST(request: Request) {
  console.log('🔍 DEBUG: Booking-Debug API route called');
  
  try {
    // Parse the request body
    const rawBody = await request.text();
    console.log('🔍 DEBUG: Raw request body:', rawBody);
    
    let data;
    try {
      data = JSON.parse(rawBody);
      console.log('🔍 DEBUG: Parsed request data:', data);
    } catch (parseError) {
      console.error('🔍 DEBUG: JSON parse error:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON',
        details: (parseError as Error).message,
        rawBody: rawBody.substring(0, 200) // First 200 chars for debugging
      }, { status: 400 });
    }
    
    // Log important environment variables (without revealing actual values)
    console.log('🔍 DEBUG: Environment variables check:');
    console.log('SOHO_API_URL exists:', !!process.env.SOHO_API_URL);
    console.log('SOHO_API_KEY exists:', !!process.env.SOHO_API_KEY);
    console.log('SOHO_AUTH_TOKEN exists:', !!process.env.SOHO_AUTH_TOKEN);
    
    // Mock successful response for testing
    return NextResponse.json({
      success: true,
      message: "This is a debug response - not an actual booking",
      appointmentId: "debug-123",
      serviceIds: data.serviceIds || [],
      serviceNames: ['Debug Service'],
      date: data.date || 'tomorrow',
      time: data.time || '2:00 PM',
      customer: data.name || 'Test Customer',
      rawRequest: data
    });
    
  } catch (error) {
    console.error('🔍 DEBUG: Unhandled error in booking debug API:', error);
    
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('🔍 DEBUG: Error stack:', error.stack);
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      errorType: error?.constructor?.name || 'Unknown',
    }, { status: 500 });
  }
} 