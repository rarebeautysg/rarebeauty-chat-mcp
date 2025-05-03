import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { useSocket } from '@/context/SocketContext';
import { FaMicrophone } from 'react-icons/fa';
import VoiceRecorder from './VoiceRecorder';

interface ChatInputProps {
  isAdmin?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  onSubmit?: (message: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  isAdmin = false, 
  placeholder = "Type your message...",
  isLoading = false,
  onSubmit
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const { sendMessage, isConnected, connectionStatus, isTyping } = useSocket();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Set mounted state after hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !isRecording) {
      inputRef.current.focus();
    }
  }, [isRecording]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    if (onSubmit) {
      onSubmit(message.trim());
    } else {
      sendMessage(message.trim(), isAdmin);
    }
    
    setMessage('');
    
    // Reset height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      // Convert audio blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        
        // Remove the data URL prefix to get just the base64 string
        const base64Data = base64Audio.split(',')[1];
        
        // Send the base64 audio data to the server
        if (onSubmit) {
          onSubmit(`[AUDIO_DATA:${base64Data}]`);
        } else {
          sendMessage(`[AUDIO_DATA:${base64Data}]`, isAdmin);
        }
      };
      
      // Hide the recorder
      setIsRecording(false);
    } catch (error) {
      console.error('Error processing audio:', error);
      alert('There was an error processing your recording.');
      setIsRecording(false);
    }
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      {/* Connection status indicator - only render on client */}
      {isMounted && connectionStatus !== 'connected' && !onSubmit && (
        <div className="mb-2 text-sm text-center">
          {connectionStatus === 'connecting' && 
            <span className="text-yellow-800 font-medium">Connecting to server...</span>}
          {connectionStatus === 'disconnected' && 
            <span className="text-red-800 font-medium">Disconnected. Trying to reconnect...</span>}
          {connectionStatus === 'error' && 
            <span className="text-red-800 font-medium">Connection error. Please refresh the page.</span>}
        </div>
      )}
      
      {/* Typing indicator - only render on client */}
      {isMounted && (isTyping || isLoading) && (
        <div className="mb-2 text-sm text-gray-900 font-medium">
          Assistant is typing...
        </div>
      )}
      
      {isRecording ? (
        <VoiceRecorder 
          onRecordingComplete={handleRecordingComplete}
          onCancel={() => setIsRecording(false)}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={placeholder}
            disabled={(!isConnected && !onSubmit) || isLoading}
            className="flex-1 resize-none rounded-md border border-gray-400 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px] max-h-[120px] bg-white text-black font-medium text-base"
            rows={1}
          />
          <button
            type="button"
            onClick={() => setIsRecording(true)}
            disabled={(!isConnected && !onSubmit) || isLoading}
            className="bg-gray-200 text-gray-800 rounded-md px-2 py-2 hover:bg-gray-300 disabled:bg-gray-300 disabled:cursor-not-allowed"
            title="Record audio message"
          >
            <FaMicrophone />
          </button>
          <button
            type="submit"
            disabled={(!isConnected && !onSubmit) || !message.trim() || isLoading}
            className="bg-blue-500 text-white rounded-md px-4 py-2 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatInput; 