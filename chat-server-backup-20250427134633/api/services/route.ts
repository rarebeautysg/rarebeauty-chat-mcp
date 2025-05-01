import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Get MCP Server URL from environment
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';

// Proxy to MCP server
export async function GET(request: NextRequest) {
  console.log('GET /api/services - proxying to MCP server');
  try {
    const { searchParams } = new URL(request.url);
    
    // Forward the request to MCP server
    const response = await axios.get(`${MCP_SERVER_URL}/api/services`, {
      params: Object.fromEntries(searchParams.entries())
    });
    
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error proxying services request to MCP server:', error);
    return NextResponse.json({ 
      error: 'Error fetching services',
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('POST /api/services - proxying to MCP server');
  try {
    const data = await request.json();
    
    // Forward the request to MCP server
    const response = await axios.post(`${MCP_SERVER_URL}/api/services`, data);
    
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error proxying services request to MCP server:', error);
    return NextResponse.json({ 
      error: 'Error processing service request',
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
} 