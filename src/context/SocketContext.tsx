import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Socket } from 'socket.io-client';

// Types
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

// Connection status enum for better state management
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// Chat initialization state
enum ChatState {
  UNINITIALIZED = 'uninitialized',
  WELCOME_REQUESTED = 'welcome_requested',
  WELCOME_RECEIVED = 'welcome_received',
  CUSTOMER_REQUESTED = 'customer_requested',
  CUSTOMER_LOADED = 'customer_loaded'
}

// Context type
interface SocketContextType {
  socket: Socket | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  isConnected: boolean;
  sessionId: string;
  sendMessage: (content: string) => void;
  loadCustomer: (resourceName: string) => void;
  clearContext: () => void;
  resetChat: () => void;
}

// Create context with default values
const SocketContext = createContext<SocketContextType>({
  socket: null,
  messages: [],
  setMessages: () => {},
  isLoading: false,
  isConnected: false,
  sessionId: '',
  sendMessage: () => {},
  loadCustomer: () => {},
  clearContext: () => {},
  resetChat: () => {},
});

// Provider component
export const SocketProvider: React.FC<{ 
  children: React.ReactNode;
  isAdmin: boolean;
}> = ({ children, isAdmin }) => {
  // Core state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('');
  
  // Status tracking with proper state machines
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [chatState, setChatState] = useState<ChatState>(ChatState.UNINITIALIZED);
  
  // Store isAdmin in ref to ensure it's not stale in effects
  const isAdminRef = useRef(isAdmin);
  
  // Update ref when isAdmin changes
  useEffect(() => {
    isAdminRef.current = isAdmin;
    console.log('👤 Admin status:', isAdmin);
  }, [isAdmin]);
  
  // Initialize socket only once
  useEffect(() => {
    // Skip during server-side rendering
    if (typeof window === 'undefined') return;
    
    // Only initialize if we're disconnected
    if (connectionStatus !== ConnectionStatus.DISCONNECTED) return;
    
    // Set connecting state
    setConnectionStatus(ConnectionStatus.CONNECTING);
    
    const setupSocket = async () => {
      try {
        const io = (await import('socket.io-client')).io;
        const storedSessionId = localStorage.getItem('chatSessionId');
        
        const socketIo = io({
          path: '/api/socketio',
          query: storedSessionId ? { sessionId: storedSessionId } : undefined,
        });
        
        // Set socket instance
        setSocket(socketIo);
        
        // Connect event
        socketIo.on('connect', () => {
          console.log('🔌 Socket connected');
          setConnectionStatus(ConnectionStatus.CONNECTED);
        });
        
        // Disconnect event
        socketIo.on('disconnect', () => {
          console.log('🔌 Socket disconnected');
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
        });
        
        // Connection error
        socketIo.on('connect_error', (error: Error) => {
          console.error('❌ Socket connection error:', error);
          setConnectionStatus(ConnectionStatus.ERROR);
        });
        
        // Session assignment
        socketIo.on('session', (data: { sessionId: string }) => {
          console.log('📝 Received session ID:', data.sessionId);
          setSessionId(data.sessionId);
          localStorage.setItem('chatSessionId', data.sessionId);
        });
        
        // Message receipt
        socketIo.on('message', (message: Message) => {
          console.log('📥 Received message:', message);
          
          // Update chat state when welcome message arrives
          if (chatState === ChatState.WELCOME_REQUESTED) {
            setChatState(ChatState.WELCOME_RECEIVED);
          }
          
          // Update chat state when customer is loaded
          if (chatState === ChatState.CUSTOMER_REQUESTED) {
            setChatState(ChatState.CUSTOMER_LOADED);
          }
          
          // Add message to state, avoiding duplicates
          setMessages(prev => {
            // Check if message already exists
            const isDuplicate = prev.some(m => 
              m.role === message.role && m.content === message.content
            );
            
            return isDuplicate ? prev : [...prev, message];
          });
        });
        
        // Typing indicator
        socketIo.on('typing', (isTyping: boolean) => {
          setIsLoading(isTyping);
        });
        
        // Load stored messages
        if (storedSessionId) {
          setSessionId(storedSessionId);
          const storedMessages = localStorage.getItem(`chatMessages-${storedSessionId}`);
          if (storedMessages) {
            try {
              const parsedMessages = JSON.parse(storedMessages);
              setMessages(parsedMessages);
              
              // If we have stored messages, mark chat as initialized
              if (parsedMessages.length > 0) {
                setChatState(ChatState.WELCOME_RECEIVED);
              }
            } catch (error) {
              console.error('❌ Error parsing stored messages:', error);
            }
          }
        }
        
        // Return cleanup function
        return () => {
          socketIo.disconnect();
        };
      } catch (error) {
        console.error('❌ Failed to initialize socket:', error);
        setConnectionStatus(ConnectionStatus.ERROR);
      }
    };
    
    setupSocket();
  }, [connectionStatus]); // Only re-run if connection status changes
  
  // Initialize chat - either with welcome message or customer data
  useEffect(() => {
    // Skip if not in browser
    if (typeof window === 'undefined') return;
    
    // Only proceed if we're connected and chat is not initialized
    if (connectionStatus !== ConnectionStatus.CONNECTED || !socket) return;
    if (chatState !== ChatState.UNINITIALIZED) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const resourceNumber = urlParams.get('resourceNumber');
    
    // Either load customer or request welcome message
    if (resourceNumber) {
      console.log('🔍 Initializing chat with customer data');
      console.log('👤 Using admin status for customer load:', isAdminRef.current);
      setChatState(ChatState.CUSTOMER_REQUESTED);
      
      const formattedNumber = resourceNumber.startsWith('c') ? resourceNumber : `c${resourceNumber}`;
      const fullResourceName = `people/${formattedNumber}`;
      
      socket.emit('loadCustomer', {
        resourceName: fullResourceName,
        isAdmin: isAdminRef.current // Use current admin status value
      });
    } else if (messages.length === 0) {
      console.log('👋 Initializing chat with welcome message');
      console.log('👤 Using admin status for welcome:', isAdminRef.current);
      setChatState(ChatState.WELCOME_REQUESTED);
      socket.emit('welcome', { isAdmin: isAdminRef.current });
    } else {
      // If we have messages but no other state, consider chat initialized
      setChatState(ChatState.WELCOME_RECEIVED);
    }
  }, [connectionStatus, socket, chatState, messages.length]); // isAdmin removed from deps to use ref instead
  
  // Save messages to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chatMessages-${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);
  
  // Message sending function
  const sendMessage = useCallback((content: string) => {
    if (!socket || !content.trim()) return;
    
    const userMessage: Message = {
      role: 'user',
      content,
      id: uuidv4()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    socket.emit('chat', {
      message: content,
      isAdmin: isAdminRef.current // Use current admin status value
    });
  }, [socket]);
  
  // Load customer profile
  const loadCustomer = useCallback((resourceName: string) => {
    if (!socket) return;
    
    console.log('🔍 Loading customer:', resourceName);
    console.log('👤 Using admin status for loadCustomer:', isAdminRef.current);
    setChatState(ChatState.CUSTOMER_REQUESTED);
    
    socket.emit('loadCustomer', {
      resourceName,
      isAdmin: isAdminRef.current // Use current admin status value
    });
  }, [socket]);
  
  // Clear context
  const clearContext = useCallback(() => {
    if (!socket) return;
    
    console.log('🧹 Clearing context');
    socket.emit('clearContext');
  }, [socket]);
  
  // Reset chat
  const resetChat = useCallback(() => {
    if (!socket) return;
    
    // Reset chat state
    setChatState(ChatState.UNINITIALIZED);
    
    // Clear local storage
    if (sessionId) {
      localStorage.removeItem(`chatMessages-${sessionId}`);
    }
    
    // Reset messages
    setMessages([]);
    
    // Let the initialization effect handle the rest
  }, [socket, sessionId]);
  
  // Derive isConnected from connection status
  const isConnected = connectionStatus === ConnectionStatus.CONNECTED;
  
  return (
    <SocketContext.Provider
      value={{
        socket,
        messages,
        setMessages,
        isLoading,
        isConnected,
        sessionId,
        sendMessage,
        loadCustomer,
        clearContext,
        resetChat
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext); 