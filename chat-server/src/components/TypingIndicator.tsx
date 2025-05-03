import React from 'react';
import Image from 'next/image';

interface TypingIndicatorProps {
  visible: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="flex items-start gap-2 sm:gap-3 px-3 py-2 mb-2">
      <div className="relative w-7 h-7 sm:w-9 sm:h-9 overflow-hidden bg-white ring-1 ring-gray-200 rounded-full flex items-center justify-center shadow-sm">
        <Image
          src="/rb-logo.png"
          alt="Rare Beauty logo"
          width={36}
          height={36}
          className="object-contain"
        />
      </div>
      <div className="flex-col w-full max-w-[85%] sm:max-w-[80%] leading-1.5">
        <div className="p-3 sm:p-4 bg-gray-100 text-gray-900 rounded-e-xl rounded-es-xl shadow-sm">
          <div className="flex space-x-2 items-center">
            <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            <span className="text-xs sm:text-sm text-gray-500 ml-2">Rare Beauty is typing...</span>
          </div>
        </div>
        <div className="flex items-center mt-0.5 sm:mt-1">
          <span className="text-[10px] sm:text-xs text-gray-500">
            Rare Beauty
          </span>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator; 