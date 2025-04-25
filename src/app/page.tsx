'use client';

import { useState, useRef, useEffect } from 'react';
import { Loading } from '@/components/Loading';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { SocketProvider, useSocket } from '@/context/SocketContext';

// Interface for decoded JWT token
interface DecodedToken {
  role?: string;
  [key: string]: any;
}

// Client component that uses the socket context
function ChatApp() {
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isClearingContext, setIsClearingContext] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get socket functionality from context
  const {
    messages,
    sendMessage,
    isLoading,
    isConnected,
    clearContext,
    resetChat
  } = useSocket();
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    setErrorMessage('');
    sendMessage(content);
  };
  
  const handleResetChat = () => {
    if (window.confirm('Are you sure you want to reset the chat? This will clear all messages and start a new session.')) {
      setIsResetting(true);
      resetChat();
      
      // After a brief delay, show new chat interface
      setTimeout(() => {
        setIsResetting(false);
      }, 1000);
    }
  };

  const handleClearContext = async () => {
    if (window.confirm(`Are you sure you want to clear the server-side context? This will remove any stored user information.`)) {
      setIsClearingContext(true);
      
      try {
        // Clear context via WebSocket
        clearContext();
        alert('Server context cleared successfully.');
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
          Rare Beauty Admin
          {!isConnected && <span className="ml-2 text-xs bg-red-700 px-1 py-0.5 rounded">Offline</span>}
        </h1>
        <div className="flex space-x-2">
          <button 
            onClick={handleClearContext}
            disabled={isClearingContext || isResetting || !isConnected}
            className="px-2 py-1 text-xs bg-pink-700 hover:bg-pink-800 text-white rounded-md transition-colors shadow-sm disabled:opacity-50"
          >
            {isClearingContext ? <Loading text="Clearing" size="sm" /> : 'Clear'}
          </button>
          <button 
            onClick={handleResetChat}
            disabled={isResetting || !isConnected}
            className="px-2 py-1 text-xs bg-pink-800 hover:bg-pink-900 text-white rounded-md transition-colors shadow-sm disabled:opacity-50"
          >
            {isResetting ? <Loading text="Resetting" size="sm" /> : 'New'}
          </button>
        </div>
      </div>
      
      {/* Admin badge */}
      <div className="fixed top-[90px] right-2 z-40 bg-yellow-100 text-yellow-800 px-2 py-1 text-xs rounded-md border border-yellow-300 shadow-sm">
        Admin Mode
      </div>
      
      {/* Chat content area with fixed positioning */}
      <div className="fixed top-[70px] bottom-[80px] left-0 right-0 z-10 bg-white overflow-y-auto pt-2">
        {isResetting ? (
          <div className="h-full flex items-center justify-center">
            <Loading text="Starting new chat..." size="lg" />
          </div>
        ) : !isConnected ? (
          <div className="h-full flex items-center justify-center flex-col">
            <div className="text-red-500 mb-2">Not connected to server</div>
            <button 
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-pink-600 text-white rounded-md"
            >
              Reconnect
            </button>
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
          disabled={!isConnected}
          placeholder="Enter admin command..."
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

// Main component that wraps the app with the provider
export default function Home() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Helper function to check if admin mode should be active
  const checkAdminMode = (): boolean => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return false; // Default to false on server-side rendering
    }
    
    // Check if we're on localhost
    const isLocalhost = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('127.0.0.1');
    
    // If on localhost, use the query parameter
    if (isLocalhost) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('admin') === 'true') {
        return true;
      }
      return false; // Explicitly return false for localhost without admin param
    }
    
    // In production, use the state from JWT verification
    return isAdmin;
  };
  
  // Check if user is admin by verifying JWT token (only in production)
  useEffect(() => {
    // Skip in server-side rendering
    if (typeof window === 'undefined') return;
    
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

  return (
    <SocketProvider isAdmin={checkAdminMode()}>
      <ChatApp />
    </SocketProvider>
  );
}
