import React, { useState, KeyboardEvent, FormEvent } from 'react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  isLoading,
  placeholder = 'Type your message...'
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSubmit(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          className="w-full p-4 pr-16 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-pink-200 focus:outline-none resize-none"
          rows={2}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        ></textarea>
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className={`absolute right-3 bottom-3 p-2 rounded-lg ${
            isLoading || !inputValue.trim() 
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
              : 'bg-pink-500 text-white hover:bg-pink-600'
          } transition-colors duration-200`}
        >
          {isLoading ? (
            <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              ></path>
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}; 