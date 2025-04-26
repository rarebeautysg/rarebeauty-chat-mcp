import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  try {
    // Get token from request body
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json(
        { isValid: false, error: 'No token provided' },
        { status: 400 }
      );
    }
    
    // Get JWT_SECRET from environment variables
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      console.error('❌ JWT_SECRET environment variable not set');
      return NextResponse.json(
        { isValid: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Verify the JWT token
    try {
      const decoded = jwt.verify(token, secret);
      
      // Return verification result with decoded payload
      return NextResponse.json({
        isValid: true,
        decoded
      });
    } catch (verifyError) {
      console.error('❌ JWT verification failed:', verifyError);
      return NextResponse.json(
        { isValid: false, error: 'Invalid token' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('❌ Error in verify-token API:', error);
    return NextResponse.json(
      { isValid: false, error: 'Server error' },
      { status: 500 }
    );
  }
} 