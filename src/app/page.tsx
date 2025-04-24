'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatInterface, Message } from '@/components/ChatInterface';
import { Loading } from '@/components/Loading';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import jwt from 'jsonwebtoken';

// Interface for decoded JWT token
interface DecodedToken {
  role?: string;
  [key: string]: any;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isClearingContext, setIsClearingContext] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Helper function to check if admin mode should be active
  const checkAdminMode = (): boolean => {
    // Check if we're on localhost
    const isLocalhost = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('127.0.0.1');
    
    // If on localhost, use the query parameter
    if (isLocalhost) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('admin') === 'true') {
        return true;
      }
    }
    
    // Otherwise use the state from JWT verification
    return isAdmin;
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check if user is admin by verifying JWT token (only in production)
  useEffect(() => {
    const checkAdminPermission = async () => {
      // Check for admin=true query parameter in localhost for testing
      const isLocalhost = window.location.hostname.includes('localhost') || 
                          window.location.hostname.includes('127.0.0.1');
      
      // If we're on localhost, check for admin query parameter
      if (isLocalhost) {
        const urlParams = new URLSearchParams(window.location.search);
        const adminParam = urlParams.get('admin');
        
        if (adminParam === 'true') {
          console.log('🔒 Admin mode enabled via query parameter');
          setIsAdmin(true);
          return;
        }
        
        console.log('🔒 Admin check skipped in development environment');
        return;
      }

      try {
        // Get the token from cookies
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
        
        const token = cookies['token'];
        
        if (!token) {
          console.log('🔒 No JWT token found in cookies');
          return;
        }
        
        // Get the JWT_SECRET from environment variables
        // For client-side validation, we'll need to make an API call to verify
        const response = await fetch('/api/verify-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token })
        });
        
        if (!response.ok) {
          console.log('🔒 Token verification failed');
          return;
        }
        
        const { isValid, decoded } = await response.json();
        
        if (isValid && decoded && decoded.role === 'admin') {
          console.log('🔒 Admin role verified');
          setIsAdmin(true);
        } else {
          console.log('🔒 User does not have admin role:', decoded?.role);
        }
      } catch (error) {
        console.error('❌ Error verifying JWT token:', error);
      }
    };
    
    checkAdminPermission();
  }, []);
  
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
  
    // Check if a resourceNumber is provided in the URL
    const checkResourceNumber = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const resourceNumber = urlParams.get('resourceNumber');
      
      if (resourceNumber) {
        console.log('🔍 Found resourceNumber in URL:', resourceNumber);
        // Format the complete resourceName with 'people/' prefix
        const fullResourceName = `people/${resourceNumber}`;
        
        // Create a special initial message to load this customer
        const initialMessage = `__LOAD_CUSTOMER__${fullResourceName}`;
        
        // Call the API to load this user
        try {
          setIsLoading(true);
          const adminMode = checkAdminMode();
          
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: initialMessage,
              isAdmin: adminMode
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
          
          setIsLoading(false);
          return true; // Signal that we've handled the customer loading
        } catch (error) {
          console.error('❌ Error loading customer from resourceNumber:', error);
          setIsLoading(false);
          return false;
        }
      } else {
        // No resourceNumber, so fetch the standard welcome message
        try {
          setIsLoading(true);
          const adminMode = checkAdminMode();
          
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: "__WELCOME__",
              isAdmin: adminMode
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
          
          setIsLoading(false);
        } catch (error) {
          console.error('❌ Error fetching welcome message:', error);
          setIsLoading(false);
        }
      }
      
      return false; // No resourceNumber found
    };

    const storedSessionId = localStorage.getItem('chatSessionId');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }

    checkServerRestart();
    checkResourceNumber();
  }, []);
  
  // Fetch welcome message from the API
  const fetchWelcomeMessage = async () => {
    setIsLoading(true);
    
    // Get admin mode status
    const adminMode = checkAdminMode();
    
    try {
      // Call the backend API to get initial welcome message
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: "__WELCOME__",  // Special token to indicate welcome message request
          isAdmin: adminMode  // Include admin role information
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
    
    // Get admin mode status
    const adminMode = checkAdminMode();
    
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
          message: content,
          isAdmin: adminMode // Include admin role information
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
          {isAdmin ? 'Rare Beauty Admin' : 'Rare Beauty Assistant'}
        </h1>
        <div className="flex space-x-2">
          {isAdmin && sessionId && (
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
      
      {/* Admin badge - only shown if user is admin */}
      {isAdmin && (
        <div className="fixed top-[90px] right-2 z-40 bg-yellow-100 text-yellow-800 px-2 py-1 text-xs rounded-md border border-yellow-300 shadow-sm">
          Admin Mode
        </div>
      )}
      
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Fixed input area at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-gray-50 border-t p-3">
        <ChatInput
          onSubmit={handleSendMessage}
          isLoading={isLoading}
          placeholder={isAdmin ? "Enter admin command..." : "Type here..."}
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
