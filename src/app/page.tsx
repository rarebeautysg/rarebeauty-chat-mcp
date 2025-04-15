'use client';

import Image from 'next/image';
import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    onError: (err) => {
      console.error('useChat Error Caught:', err);
      console.error('Error Name:', err.name);
      console.error('Error Message:', err.message);
      console.error('Error Cause:', 'cause' in err ? err.cause : 'N/A');
      console.log('Messages state on error:', messages);
    },
    onFinish: (message) => {
      console.log('Chat finished:', message);
    },
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Log when messages change
  useEffect(() => {
    console.log('Messages updated:', messages);
  }, [messages]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting message:', input);
    try {
      await handleSubmit(e);
    } catch (err) {
      console.error('Error submitting message:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Chat container */}
      <div className="flex-1 p-4 container mx-auto max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
          {/* Chat header */}
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Rare Beauty Chat</h2>
          </div>

          {/* Chat messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-2.5 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div className={`relative w-8 h-8 overflow-hidden ${
                  message.role === 'user' ? 'bg-blue-100' : 'bg-white'
                } rounded-full flex items-center justify-center`}>
                  {message.role === 'user' ? (
                    <span className="text-blue-600 text-sm font-semibold">U</span>
                  ) : (
                    <Image
                      src="/rb-logo.png"
                      alt="Rare Beauty logo"
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                  )}
                </div>
                <div className={`flex flex-col w-full max-w-[320px] leading-1.5 ${
                  message.role === 'user' ? 'items-end' : ''
                }`}>
                  <div className={`p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white rounded-s-xl rounded-ee-xl'
                      : 'bg-gray-100 text-gray-900 rounded-e-xl rounded-es-xl'
                  }`}>
                    <p className="text-sm font-normal">{message.content}</p>
                  </div>
                  <span className="text-xs text-gray-500 mt-1">
                    {message.role === 'user' ? 'You' : 'Bot'} • Just now
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
            
            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 text-red-500 rounded-lg">
                Error: {error.message || 'An error occurred'}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div className="p-4 border-t">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type your message..."
              />
              <button
                type="submit"
                disabled={isLoading}
                className={`px-4 py-2 bg-blue-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLoading 
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-blue-600'
                }`}
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
