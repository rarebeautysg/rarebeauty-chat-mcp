import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  // Create a sanitized copy of environment variables
  const sanitizedEnv: Record<string, string> = {};
  Object.keys(process.env).sort().forEach(key => {
    // Redact sensitive values
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN') || key.includes('PASSWORD')) {
      sanitizedEnv[key] = '[REDACTED]';
    } else {
      sanitizedEnv[key] = process.env[key] as string;
    }
  });
  
  // Get MCP URL from environment
  const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || process.env.MCP_SERVER_URL || 'http://localhost:3003';
  
  // Build response with useful debugging information
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    server: {
      mcp_url: MCP_URL,
      node_env: process.env.NODE_ENV || 'not set',
      next_version: process.env.npm_package_version || 'unknown'
    },
    environment: sanitizedEnv,
    connection_check: {
      mcp_reachable: null as boolean | null,
      error: null as string | null
    }
  };
  
  // Test if MCP server is reachable
  try {
    await axios.get(`${MCP_URL}/health`, { timeout: 2000 });
    healthData.connection_check.mcp_reachable = true;
  } catch (error) {
    healthData.connection_check.mcp_reachable = false;
    if (error instanceof Error) {
      healthData.connection_check.error = error.message;
    } else {
      healthData.connection_check.error = String(error);
    }
  }
  
  return NextResponse.json(healthData);
} 