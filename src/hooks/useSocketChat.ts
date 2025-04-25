import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Socket } from 'socket.io-client';

// Declare socket.io-client with a dynamic import for Next.js compatibility
let io: any;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

interface UseSocketChatReturn {
  messages: Message[];
  sendMessage: (content: string) => void;
  isLoading: boolean;
  isConnected: boolean;
  loadCustomer: (resourceName: string) => void;
  clearContext: () => void;
  resetChat: () => void;
}

export const useSocketChat = (isAdmin: boolean = false): UseSocketChatReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Initialize socket connection
  useEffect(() => {
    // Skip on server-side rendering
    if (typeof window === 'undefined') return;
    
    // Dynamically import socket.io-client
    const loadSocketIo = async () => {
      const socketIoModule = await import('socket.io-client');
      io = socketIoModule.io;
      
      // Get stored session ID if available
      const storedSessionId = localStorage.getItem('chatSessionId');
      
      // Create socket connection
      const socketIo = io({
        path: '/api/socketio',
        query: storedSessionId ? { sessionId: storedSessionId } : undefined,
      });
      
      // Store socket in state
      setSocket(socketIo);
      
      // Socket event listeners
      socketIo.on('connect', () => {
        console.log('🔌 Socket connected');
        setIsConnected(true);
        
        // If we don't have a stored session, request welcome message
        if (!storedSessionId) {
          socketIo.emit('welcome', { isAdmin });
        }
      });
      
      socketIo.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
        setIsConnected(false);
      });
      
      socketIo.on('connect_error', (error: Error) => {
        console.error('❌ Socket connection error:', error);
        setIsConnected(false);
      });
      
      socketIo.on('session', (data: { sessionId: string }) => {
        console.log('📝 Received session ID:', data.sessionId);
        setSessionId(data.sessionId);
        localStorage.setItem('chatSessionId', data.sessionId);
      });
      
      socketIo.on('message', (message: Message) => {
        console.log('📥 Received message:', message);
        setMessages((prev) => [...prev, message]);
      });
      
      socketIo.on('typing', (isTyping: boolean) => {
        setIsLoading(isTyping);
      });
      
      // Clean up on unmount
      return () => {
        socketIo.disconnect();
      };
    };
    
    loadSocketIo();
  }, [isAdmin]);

  // Load or reload messages from localStorage
  useEffect(() => {
    // Skip on server-side rendering
    if (typeof window === 'undefined') return;
    
    const storedSessionId = localStorage.getItem('chatSessionId');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      const storedMessages = localStorage.getItem(`chatMessages-${storedSessionId}`);
      if (storedMessages) {
        try {
          setMessages(JSON.parse(storedMessages));
        } catch (error) {
          console.error('❌ Error parsing stored messages:', error);
        }
      }
    }
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    // Skip on server-side rendering
    if (typeof window === 'undefined') return;
    
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chatMessages-${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  // Send a message to the server
  const sendMessage = useCallback((content: string) => {
    if (!socket || !content.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content,
      id: uuidv4(),
    };

    // Add message to local state
    setMessages((prev) => [...prev, userMessage]);
    
    // Send to server
    socket.emit('chat', {
      message: content,
      isAdmin,
    });
  }, [socket, isAdmin]);

  // Load a customer profile
  const loadCustomer = useCallback((resourceName: string) => {
    if (!socket) return;
    
    console.log('🔍 Loading customer:', resourceName);
    socket.emit('loadCustomer', {
      resourceName,
      isAdmin,
    });
  }, [socket, isAdmin]);

  // Clear context
  const clearContext = useCallback(() => {
    if (!socket) return;
    
    console.log('🧹 Clearing context');
    socket.emit('clearContext');
  }, [socket]);

  // Reset chat
  const resetChat = useCallback(() => {
    if (!socket) return;
    
    // Clear local storage
    if (sessionId) {
      localStorage.removeItem(`chatMessages-${sessionId}`);
    }
    
    // Reset messages
    setMessages([]);
    
    // Request new welcome message
    socket.emit('welcome', { isAdmin });
  }, [socket, sessionId, isAdmin]);

  return {
    messages,
    sendMessage,
    isLoading,
    isConnected,
    loadCustomer,
    clearContext,
    resetChat,
  };
}; 