import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

// Define Message type here directly instead of importing to avoid circular dependency
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading,
  placeholder
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string>('');

  // Load session ID from localStorage on component mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('chatSessionId');
    if (savedSessionId) {
      setSessionId(savedSessionId);
      console.log('📝 Loaded saved session ID:', savedSessionId);
    }
  }, []);

  // Save session ID to localStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('chatSessionId', sessionId);
    }
  }, [sessionId]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Expose updateSessionId to parent components
  const updateSessionId = (newId: string) => {
    setSessionId(newId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>
              Ask Rare Beauty about services, pricing, or book an appointment...
            </p>
          </div>
        ) : (
          <div>
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLastMessage={index === messages.length - 1 && isLoading}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <ChatInput
          onSubmit={onSendMessage}
          isLoading={isLoading}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
};

// Add type definition for the global window object
declare global {
  interface Window {
    updateChatSessionId?: (sessionId: string) => void;
  }
} 