import { NextResponse } from 'next/server';
import { executors, toolResults } from '@/app/api/chat/route';

// Handle DELETE requests to clear context for a specific session
export async function DELETE(request: Request) {
  try {
    // Extract session ID from the URL query
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'Session ID is required'
      }, { status: 400 });
    }
    
    console.log(`🧹 Clearing context for session ${sessionId}`);
    
    // Clear data for this session
    let cleared = 0;
    
    if (executors.has(sessionId)) {
      executors.delete(sessionId);
      cleared++;
    }
    
    if (toolResults.has(sessionId)) {
      toolResults.delete(sessionId);
      cleared++;
    }
    
    console.log(`✅ Cleared ${cleared} context items for session ${sessionId}`);
    
    return NextResponse.json({
      success: true,
      message: `Context cleared for session ${sessionId}`,
      itemsCleared: cleared
    });
    
  } catch (error) {
    console.error('❌ Error clearing context:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 