import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Generate a timestamp when the server starts
const SERVER_START_TIME = Date.now().toString();

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Get the response
  const response = NextResponse.next();
  
  // Add the server start timestamp as a header
  response.headers.set('X-Server-Start-Time', SERVER_START_TIME);
  
  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match all pages
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 