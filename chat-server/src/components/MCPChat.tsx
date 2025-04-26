import { useState, useRef, useEffect, useCallback } from 'react';
import { useMCP } from '@/hooks/useMCP';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatInput } from '@/components/ChatInput';
import { Loading } from '@/components/Loading';

interface MCPChatProps {
  isAdmin?: boolean;
  serverUrl?: string;
}

export function MCPChat({ isAdmin = false, serverUrl }: MCPChatProps) {
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isClearingContext, setIsClearingContext] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get MCP functionality
  const {
    messages,
    sendMessage,
    loadCustomer,
    isLoading,
    isConnected,
    clearContext,
    resetChat,
    userContext
  } = useMCP({ isAdmin, serverUrl });
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Load customer from URL if present
  useEffect(() => {
    if (!isConnected) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const resourceNumber = urlParams.get('resourceNumber');
    
    if (resourceNumber) {
      const formattedNumber = resourceNumber.startsWith('c') ? resourceNumber : `c${resourceNumber}`;
      const fullResourceName = `people/${formattedNumber}`;
      loadCustomer(fullResourceName);
    }
  }, [isConnected, loadCustomer]);
  
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    setErrorMessage('');
    sendMessage(content);
  }, [sendMessage]);
  
  const handleResetChat = useCallback(() => {
    if (window.confirm('Are you sure you want to reset the chat? This will clear all messages and start a new session.')) {
      setIsResetting(true);
      resetChat();
      
      // After a brief delay, show new chat interface
      setTimeout(() => {
        setIsResetting(false);
      }, 1000);
    }
  }, [resetChat]);

  const handleClearContext = useCallback(async () => {
    if (window.confirm(`Are you sure you want to clear the server-side context? This will remove any stored user information.`)) {
      setIsClearingContext(true);
      
      try {
        clearContext();
        alert('Server context cleared successfully.');
      } catch (error) {
        console.error('❌ Error clearing context:', error);
        alert(`Error clearing context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsClearingContext(false);
      }
    }
  }, [clearContext]);
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-0 m-0 bg-gray-100">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-30 px-2 pt-10 pb-2 bg-gradient-to-r from-pink-500 to-pink-600 border-b border-pink-700 flex justify-between items-center">
        <h1 className="text-lg font-bold text-white flex items-center">
          <img src="/rb-logo.png" alt="Rare Beauty Logo" className="w-6 h-6 mr-2" />
          Rare Beauty {isAdmin ? 'Admin' : ''}
          {!isConnected && (
            <span className="ml-2 text-xs bg-red-700 px-1 py-0.5 rounded">Offline</span>
          )}
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
      {isAdmin && (
        <div className="fixed top-[90px] right-2 z-40 bg-yellow-100 text-yellow-800 px-2 py-1 text-xs rounded-md border border-yellow-300 shadow-sm">
          Admin Mode
        </div>
      )}
      
      {/* User context badge */}
      {userContext && (
        <div className="fixed top-[90px] left-2 z-40 bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded-md border border-blue-300 shadow-sm">
          Customer: {userContext.name}
        </div>
      )}
      
      {/* Chat content area with fixed positioning */}
      <div className="fixed top-[70px] bottom-[80px] left-0 right-0 z-10 bg-white overflow-y-auto pt-2">
        {isResetting ? (
          <div className="h-full flex items-center justify-center">
            <Loading text="Starting new chat..." size="lg" />
          </div>
        ) : !isConnected ? (
          <div className="h-full flex items-center justify-center flex-col">
            <div className="text-red-500 mb-2">Not connected to MCP server</div>
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
          placeholder={isAdmin ? "Enter admin command..." : "Type a message..."}
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