import React, { useEffect, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import { useSearchParams } from 'next/navigation';
import ChatInput from './ChatInput';

interface MCPChatProps {
  isAdmin?: boolean;
}

const MCPChat: React.FC<MCPChatProps> = ({ isAdmin = false }) => {
  const { messages, isTyping, isCustomerLoaded, connectionStatus } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // Check for resource in URL
  useEffect(() => {
    if (!searchParams) return;
    
    const resource = searchParams.get('resource');
    if (resource && !isCustomerLoaded) {
      console.log(`Found resource in URL: ${resource}`);
    }
  }, [searchParams, isCustomerLoaded]);

  return (
    <div className="flex flex-col h-full max-h-full">
      {/* Connection status banner */}
      {connectionStatus !== 'connected' && (
        <div className={`p-2 text-center text-sm ${
          connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
          connectionStatus === 'error' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {connectionStatus === 'connecting' && 'Connecting to chat server...'}
          {connectionStatus === 'disconnected' && 'Disconnected from chat server. Trying to reconnect...'}
          {connectionStatus === 'error' && 'Error connecting to chat server. Please refresh the page.'}
        </div>
      )}
      
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">
              {isTyping ? "Loading..." : "Start a conversation..."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-3xl ${
                  message.role === 'human'
                    ? 'ml-auto bg-blue-100 text-blue-900'
                    : 'mr-auto bg-gray-100 text-gray-900'
                } rounded-lg p-3 shadow`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            ))}
            {isTyping && (
              <div className="max-w-3xl mr-auto bg-gray-100 text-gray-900 rounded-lg p-3 animate-pulse shadow">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Input area */}
      <ChatInput isAdmin={isAdmin} />
    </div>
  );
};

export default MCPChat; 