'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInterface, Message } from '@/components/ChatInterface';
import { Loading } from '@/components/Loading';

// Function to extract service name from current input or recent chat history
function extractServiceFromHistory(currentInput: string, messages: Message[]) {
  // List of service names to check for
  const serviceNames = [
    'facial', 'massage', 'lashes', 'dense lashes', 'brows', 
    'waxing', 'beauty', 'nails', 'haircut', 'blowout', 'hair color'
  ];
  
  // First, check the current input
  const normalizedInput = currentInput.toLowerCase();
  for (const service of serviceNames) {
    if (normalizedInput.includes(service)) {
      console.log(`📋 Found service in current input: ${service}`);
      return service;
    }
  }
  
  // If not found in current input, check the last 5 messages
  const recentMessages = messages.slice(-5);
  for (const message of recentMessages) {
    const normalizedContent = message.content.toLowerCase();
    for (const service of serviceNames) {
      if (normalizedContent.includes(service)) {
        console.log(`📋 Found service in chat history: ${service}`);
        return service;
      }
    }
  }
  
  // No service found
  console.log('📋 No service found in input or history');
  return null;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isClearingContext, setIsClearingContext] = useState<boolean>(false);
  
  // Retrieve stored session ID on component mount
  useEffect(() => {
    // Check if the server has restarted by comparing timestamps
    const checkServerRestart = async () => {
      try {
        // Fetch the current page to get the server timestamp header
        const response = await fetch('/', { 
          method: 'HEAD',
          cache: 'no-store' // Prevent caching to ensure we get fresh headers
        });
        
        // Get the server start timestamp from response headers
        const serverStartTime = response.headers.get('X-Server-Start-Time');
        const storedStartTime = localStorage.getItem('serverStartTime');
        
        // If server has restarted (timestamp changed or no stored timestamp)
        if (!storedStartTime || serverStartTime !== storedStartTime) {
          console.log('🔄 Server restart detected, clearing localStorage');
          
          // Clear all chat related data
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('chat') || key === 'sessionId') {
              localStorage.removeItem(key);
            }
          });
          
          // Store the new timestamp
          localStorage.setItem('serverStartTime', serverStartTime || '');
          
          // Reset state
          setSessionId('');
          setMessages([]);
          return;
        }
      } catch (error) {
        console.error('Error checking server restart:', error);
      }
    };
    
    // Check for server restart first
    checkServerRestart();
    
    // Then load stored session data if it exists
    const storedSessionId = localStorage.getItem('chatSessionId');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      console.log('📝 Retrieved stored session ID:', storedSessionId);
      
      // Load stored messages if they exist
      const storedMessages = localStorage.getItem(`chatMessages-${storedSessionId}`);
      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages);
          setMessages(parsedMessages);
          console.log('📝 Loaded stored chat history:', parsedMessages.length, 'messages');
        } catch (e) {
          console.error('Failed to parse stored messages:', e);
        }
      }
    }
  }, []);
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chatMessages-${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);
  
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    setIsLoading(true);
    setErrorMessage('');
    
    // Add user message to chat
    const userMessage: Message = { 
      role: 'user', 
      content, 
      id: uuidv4() 
    };
    setMessages(prev => [...prev, userMessage]);
    
    try {
      // Call the backend API with the session ID if available
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId ? { 'x-session-id': sessionId } : {})
        },
        body: JSON.stringify({
          message: content
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Save the session ID if we got one back
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem('chatSessionId', data.sessionId);
        console.log('📝 New session ID received and stored:', data.sessionId);
      }
      
      // Add assistant response
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response,
        id: uuidv4()
      }]);
    } catch (error) {
      console.error('❌ Error in chat execution:', error);
      setErrorMessage('Something went wrong. Please try again.');
      
      // Add error message to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        id: uuidv4()
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleResetChat = () => {
    if (window.confirm('Are you sure you want to reset the chat? This will clear all messages and start a new session.')) {
      setIsResetting(true);
      
      // Clear local storage
      if (sessionId) {
        localStorage.removeItem(`chatMessages-${sessionId}`);
        localStorage.removeItem('chatSessionId');
      }
      
      // Reset state
      setMessages([]);
      setSessionId('');
      setErrorMessage('');
      
      // Show reset message briefly
      setTimeout(() => {
        setIsResetting(false);
      }, 1000);
    }
  };

  const handleClearContext = async () => {
    if (!sessionId) {
      alert('No active session to clear.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to clear the server-side context for session ${sessionId}? This will remove any stored user information.`)) {
      setIsClearingContext(true);
      
      try {
        // Call the admin API to clear the context for this session
        const response = await fetch(`/api/admin/context?sessionId=${sessionId}`, {
          method: 'DELETE',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('❌ Non-JSON response when clearing context:', contentType);
          const text = await response.text();
          console.error('❌ Response text:', text.substring(0, 200));
          throw new Error('Received non-JSON response from server');
        }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('✅ Successfully cleared server context:', data);
          alert('Server context cleared successfully.');
        } else {
          console.error('❌ Failed to clear context:', data);
          alert(`Failed to clear context: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('❌ Error clearing context:', error);
        alert(`Error clearing context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsClearingContext(false);
      }
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div className="z-10 w-full max-w-4xl bg-white rounded-lg shadow-xl overflow-hidden h-[calc(100vh-2rem)]">
        <div className="p-4 bg-pink-100 border-b border-pink-200 flex justify-between items-center">
          <h1 className="text-xl font-bold text-pink-900">Rare Beauty Chat</h1>
          <div className="flex space-x-2">
            {sessionId && (
              <button 
                onClick={handleClearContext}
                disabled={isClearingContext || isResetting}
                className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-md transition-colors"
              >
                {isClearingContext ? <Loading text="Clearing" size="sm" /> : 'Clear Context'}
              </button>
            )}
            <button 
              onClick={handleResetChat}
              disabled={isResetting}
              className="px-3 py-1 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-md transition-colors"
            >
              {isResetting ? <Loading text="Resetting" size="sm" /> : 'New Chat'}
            </button>
          </div>
        </div>
        
        {isResetting ? (
          <div className="h-[calc(100%-4rem)] flex items-center justify-center">
            <Loading text="Starting new chat..." size="lg" />
          </div>
        ) : (
          <div className="h-[calc(100%-4rem)]">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              placeholder="Ask about services or book an appointment..."
            />
          </div>
        )}
        
        {errorMessage && (
          <div className="p-2 bg-red-100 text-red-700 text-sm">
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
