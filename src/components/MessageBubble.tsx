import React from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from './ChatInterface';

interface MessageBubbleProps {
  message: Message;
  isLastMessage?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  isLastMessage = false 
}) => {
  // Add a custom renderer for paragraphs to add more spacing
  const renderParagraphs = ({
    node,
    ...props
  }: React.HTMLAttributes<HTMLParagraphElement> & { node?: any }) => {
    // Check if this paragraph contains a category header
    const content = String(props.children || '');
    const isCategoryHeader = /^(\*\*)?(?:Lashes|Facial|Threading|Waxing|Skin)(\*\*)?$/.test(content.trim());
    return <p className={isCategoryHeader ? "font-bold text-lg mt-4 mb-2" : "my-3"} {...props} />;
  };

  return (
    <div
      className={`flex items-start gap-2.5 mb-4 ${
        message.role === 'user' ? 'flex-row-reverse' : ''
      }`}
    >
      <div
        className={`relative w-8 h-8 overflow-hidden ${
          message.role === 'user' ? 'bg-pink-100' : 'bg-white'
        } rounded-full flex items-center justify-center`}
      >
        {message.role === 'user' ? (
          <span className="text-pink-600 text-sm font-semibold">U</span>
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
      <div
        className={`flex flex-col w-full max-w-[80%] leading-1.5 ${
          message.role === 'user' ? 'items-end' : ''
        }`}
      >
        <div
          className={`p-4 ${
            message.role === 'user'
              ? 'bg-pink-500 text-white rounded-s-xl rounded-ee-xl'
              : 'bg-gray-100 text-gray-900 rounded-e-xl rounded-es-xl'
          }`}
        >
          {message.role === 'user' ? (
            <p className="text-sm font-normal">{message.content}</p>
          ) : (
            <div className="text-sm font-normal markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: renderParagraphs,
                  h1: ({ node, ...props }) => (
                    <h1 className="text-xl font-bold mt-4 mb-2" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-lg font-bold mt-4 mb-2" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-md font-bold mt-3 mb-1" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-none pl-0 my-3" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal pl-5 my-3" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="my-2" {...props} />
                  ),
                  pre: ({ node, ...props }) => (
                    <pre className="bg-gray-100 p-2 rounded my-3 overflow-x-auto" {...props} />
                  ),
                  table: ({ node, ...props }) => (
                    <table className="border-collapse w-full my-4" {...props} />
                  ),
                  thead: ({ node, ...props }) => (
                    <thead className="bg-gray-100" {...props} />
                  ),
                  tbody: ({ node, ...props }) => (
                    <tbody {...props} />
                  ),
                  tr: ({ node, ...props }) => (
                    <tr className="border-b border-gray-200" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th className="py-2 px-3 text-left font-bold" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="py-2 px-3" {...props} />
                  ),
                  strong: ({ node, children, ...props }) => {
                    const content = String(children || '');
                    const isCategoryHeader = /^(?:Lashes|Facial|Threading|Waxing|Skin)$/.test(
                      content.trim()
                    );
                    return isCategoryHeader ? (
                      <strong className="block text-lg mt-4 mb-2" {...props}>
                        {children}
                      </strong>
                    ) : (
                      <strong {...props}>{children}</strong>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className="flex items-center mt-1">
          <span className="text-xs text-gray-500">
            {message.role === 'user' ? 'You' : 'Rare Beauty'}
          </span>
          
          {isLastMessage && (
            <div className="flex items-center gap-1 ml-2">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 