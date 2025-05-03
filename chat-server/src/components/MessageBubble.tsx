import React from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Message } from './ChatInterface';
import { FaMicrophone } from 'react-icons/fa';
import { 
  TableRenderer, 
  TableHead, 
  TableBody, 
  TableRow, 
  TableHeader, 
  TableCell 
} from './TableRenderer';

// Utility function to check if content is a voice transcription
const isVoiceTranscription = (content: string): boolean => {
  // This pattern looks for long strings of random-looking characters typical of encoded voice data
  const voiceEncodingPattern = /[a-zA-Z0-9\/\+\-]{80,}/;
  return voiceEncodingPattern.test(content);
};

// Voice message component - separate from text messages
const VoiceMessage: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-white p-1.5 rounded-full">
        <FaMicrophone className="text-pink-500" />
      </div>
      <span className="text-white">Voice message</span>
    </div>
  );
};

// User message component
const UserMessage: React.FC<{content: string}> = ({ content }) => {
  if (isVoiceTranscription(content)) {
    return <VoiceMessage />;
  }
  
  return (
    <p className="text-sm sm:text-base font-semibold text-white">
      {content}
    </p>
  );
};

interface MessageBubbleProps {
  message: Message;
  isLastMessage?: boolean;
  isFirstMessage?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  isLastMessage = false,
  isFirstMessage = false
}) => {
  // Add a custom renderer for paragraphs to add more spacing
  const renderParagraphs = ({
    node,
    ...props
  }: React.HTMLAttributes<HTMLParagraphElement> & { node?: any }) => {
    // Check if this paragraph contains a category header
    const content = String(props.children || '');
    const isCategoryHeader = /^(\*\*)?(?:Lashes|Facial|Threading|Waxing|Skin)(\*\*)?$/.test(content.trim());
    return <p className={isCategoryHeader ? "font-bold text-base sm:text-lg mt-3 sm:mt-4 mb-1 sm:mb-2" : "my-2 sm:my-3"} {...props} />;
  };

  return (
    <div
      className={`flex items-start gap-2 sm:gap-3 px-3 py-2 ${
        message.role === 'user' ? 'flex-row-reverse' : ''
      } ${isFirstMessage ? 'mt-2' : ''}`}
    >
      <div
        className={`relative w-7 h-7 sm:w-9 sm:h-9 overflow-hidden ${
          message.role === 'user' ? 'bg-pink-100 ring-1 ring-pink-200' : 'bg-white ring-1 ring-gray-200'
        } rounded-full flex items-center justify-center shadow-sm`}
      >
        {message.role === 'user' ? (
          <span className="text-pink-600 text-xs sm:text-sm font-semibold">U</span>
        ) : (
          <Image
            src="/rb-logo.png"
            alt="Rare Beauty logo"
            width={36}
            height={36}
            className="object-contain"
          />
        )}
      </div>
      <div
        className={`flex flex-col w-full max-w-[85%] sm:max-w-[80%] leading-1.5 ${
          message.role === 'user' ? 'items-end' : ''
        }`}
      >
        <div
          className={`p-3 sm:p-4 ${
            message.role === 'user'
              ? 'bg-pink-500 text-white rounded-s-xl rounded-ee-xl shadow-sm'
              : 'bg-gray-100 text-gray-900 rounded-e-xl rounded-es-xl shadow-sm'
          }`}
        >
          {message.role === 'user' ? (
            <UserMessage content={message.content} />
          ) : (
            <div className="text-xs sm:text-sm font-medium markdown-content markdown-body">
              <ReactMarkdown
                remarkPlugins={[[remarkGfm, { tableCellPadding: true, tablePipeAlign: true }]]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  p: renderParagraphs,
                  h1: ({ node, ...props }) => (
                    <h1 className="text-base sm:text-xl font-bold mt-4 mb-2 text-gray-900" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-sm sm:text-lg font-bold mt-3 mb-2 text-gray-900" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-sm font-semibold mt-2 mb-1 text-gray-900" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc pl-4 my-2 sm:my-3 space-y-1 text-gray-900" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal pl-5 my-2 sm:my-3 space-y-1 text-gray-900" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="my-1 text-gray-900" {...props} />
                  ),
                  pre: ({ node, ...props }) => (
                    <pre className="bg-gray-200 p-2 rounded my-2 overflow-x-auto text-xs font-mono text-gray-900" {...props} />
                  ),
                  table: ({ node, ...props }) => (
                    <TableRenderer {...props} />
                  ),
                  thead: ({ node, ...props }) => (
                    <TableHead {...props} />
                  ),
                  tbody: ({ node, ...props }) => (
                    <TableBody {...props} />
                  ),
                  tr: ({ node, ...props }) => (
                    <TableRow {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <TableHeader {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <TableCell {...props} />
                  ),
                  strong: ({ node, children, ...props }) => {
                    const content = String(children || '');
                    const isCategoryHeader = /^(?:Lashes|Facial|Threading|Waxing|Skin)$/.test(
                      content.trim()
                    );
                    return isCategoryHeader ? (
                      <strong className="block text-sm sm:text-lg mt-3 sm:mt-4 mb-1 sm:mb-2" {...props}>
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
        <div className="flex items-center mt-0.5 sm:mt-1">
          <span className="text-[10px] sm:text-xs text-gray-500">
            {message.role === 'user' ? 'You' : 'Rare Beauty'}
          </span>
        </div>
      </div>
    </div>
  );
}; 