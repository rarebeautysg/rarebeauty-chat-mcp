'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInterface, Message } from '@/components/ChatInterface';
import { Loading } from '@/components/Loading';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';

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
    } else {
      // If no existing session, get a welcome message
      fetchWelcomeMessage();
    }
  }, []);
  
  // Fetch welcome message from the API
  const fetchWelcomeMessage = async () => {
    setIsLoading(true);
    
    try {
      // Call the backend API to get initial welcome message
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: "__WELCOME__"  // Special token to indicate welcome message request
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Save the session ID
      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem('chatSessionId', data.sessionId);
        console.log('📝 New session ID received and stored:', data.sessionId);
      }
      
      // Add assistant welcome message
      setMessages([{ 
        role: 'assistant', 
        content: data.response,
        id: uuidv4()
      }]);
    } catch (error) {
      console.error('❌ Error fetching welcome message:', error);
      // Add default welcome message in case of error
      setMessages([{ 
        role: 'assistant', 
        content: 'Hello there! How are you doing today? Can I have your mobile number so I can better help you?',
        id: uuidv4()
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
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
      
      // Show reset message briefly, then fetch welcome message
      setTimeout(() => {
        setIsResetting(false);
        fetchWelcomeMessage(); // Get a welcome message for the new chat
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
    <main className="flex min-h-screen flex-col items-center justify-start p-0 m-0 bg-gray-100">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-30 px-2 pt-10 pb-2 bg-gradient-to-r from-pink-500 to-pink-600 border-b border-pink-700 flex justify-between items-center">
        <h1 className="text-lg font-bold text-white flex items-center">
          <img src="/rb-logo.png" alt="Rare Beauty Logo" className="w-6 h-6 mr-2" />
          Rare Beauty Assistant
        </h1>
        <div className="flex space-x-2">
          {sessionId && (
            <button 
              onClick={handleClearContext}
              disabled={isClearingContext || isResetting}
              className="px-2 py-1 text-xs bg-pink-700 hover:bg-pink-800 text-white rounded-md transition-colors shadow-sm"
            >
              {isClearingContext ? <Loading text="Clearing" size="sm" /> : 'Clear'}
            </button>
          )}
          <button 
            onClick={handleResetChat}
            disabled={isResetting}
            className="px-2 py-1 text-xs bg-pink-800 hover:bg-pink-900 text-white rounded-md transition-colors shadow-sm"
          >
            {isResetting ? <Loading text="Resetting" size="sm" /> : 'New'}
          </button>
        </div>
      </div>
      
      {/* Chat content area with fixed positioning */}
      <div className="fixed top-[70px] bottom-[80px] left-0 right-0 z-10 bg-white overflow-y-auto pt-2">
        {isResetting ? (
          <div className="h-full flex items-center justify-center">
            <Loading text="Starting new chat..." size="lg" />
          </div>
        ) : (
          <div className="h-full pb-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLastMessage={index === messages.length - 1 && isLoading}
                isFirstMessage={index === 0}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Fixed input area at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-gray-50 border-t p-3">
        <ChatInput
          onSubmit={handleSendMessage}
          isLoading={isLoading}
          placeholder="Type here..."
        />
        
        {errorMessage && (
          <div className="mt-2 p-2 bg-red-100 text-red-700 text-sm border-t border-red-200">
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
