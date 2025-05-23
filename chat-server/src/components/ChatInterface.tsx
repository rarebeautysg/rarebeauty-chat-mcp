import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';

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
  isTyping?: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading,
  placeholder,
  isTyping = false
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

  // Scroll to bottom whenever messages change or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Expose updateSessionId to parent components
  const updateSessionId = (newId: string) => {
    setSessionId(newId);
  };

  return (
    <div className="flex flex-col h-full border rounded-none shadow-sm overflow-hidden bg-gray-50">
      <div 
        className="flex-1 overflow-y-auto p-0 space-y-0 max-h-[45vh] sm:max-h-[calc(100vh-250px)] bg-white"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center px-4 py-6">
              Send a message to start the conversation with our beauty assistant.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.length > 0 && (
              <div className="sticky top-0 z-10 p-3 bg-white">
                <MessageBubble
                  key={messages[0].id}
                  message={messages[0]}
                  isFirstMessage={true}
                  isLastMessage={messages.length === 1 && isLoading}
                />
              </div>
            )}
            {messages.length > 1 && (
              <div className="p-3 pt-0">
                {messages.slice(1).map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isLastMessage={index === messages.length - 2 && isLoading}
                  />
                ))}
                <TypingIndicator visible={isTyping || isLoading} />
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-3 border-t bg-gray-50 mt-auto">
        <ChatInput
          onSubmit={onSendMessage}
          isLoading={isLoading}
          placeholder={placeholder || "Type here..."}
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