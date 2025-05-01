import { NextRequest, NextResponse } from 'next/server';
import { AppointmentTools } from '@/tools';

/**
 * API endpoint to handle tool execution requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, params, sessionId } = body;
    
    console.log(`🔧 Tools API called with tool: ${tool}`);
    
    if (!tool) {
      return NextResponse.json(
        { success: false, message: 'No tool specified' },
        { status: 400 }
      );
    }
    
    // Find the requested tool
    const toolInstance = AppointmentTools.find(t => t.name === tool);
    
    if (!toolInstance) {
      return NextResponse.json(
        { success: false, message: `Tool '${tool}' not found` }, 
        { status: 404 }
      );
    }
    
    // Execute the tool
    try {
      const result = await toolInstance.invoke(params);
      
      console.log(`✅ Tool '${tool}' execution successful`);
      
      // Parse the result if it's a JSON string
      let parsedResult = result;
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result);
        } catch {
          // If parsing fails, keep the original string
          parsedResult = result;
        }
      }
      
      return NextResponse.json({
        success: true,
        tool,
        result: parsedResult
      });
    } catch (toolError: any) {
      console.error(`❌ Error executing tool '${tool}':`, toolError);
      
      return NextResponse.json({
        success: false,
        tool,
        error: toolError.message || 'Tool execution failed'
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ Error in tools API:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Server error',
      error: error.message
    }, { status: 500 });
  }
} 