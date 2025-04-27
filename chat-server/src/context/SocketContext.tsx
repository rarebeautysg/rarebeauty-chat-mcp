import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { Message, UserContext, ConnectionStatus } from '@/types/socket';

interface SocketContextType {
  socket: Socket | null;
  messages: Message[];
  isConnected: boolean;
  isTyping: boolean;
  sessionId: string | null;
  sendMessage: (content: string, isAdmin?: boolean) => void;
  loadCustomer: (resourceName: string, isAdmin?: boolean) => void;
  clearContext: () => void;
  connectionStatus: ConnectionStatus;
  isCustomerLoaded: boolean;
}

interface SocketProviderProps {
  children: ReactNode;
  isAdmin?: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<SocketProviderProps> = ({ 
  children, 
  isAdmin = false 
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isCustomerLoaded, setIsCustomerLoaded] = useState(false);
  const customerLoadAttemptedRef = useRef(false);
  const welcomeMessageRequestedRef = useRef(false);
  const isAdminRef = useRef(isAdmin);
  const socketInitializedRef = useRef(false);

  // Update admin ref when prop changes
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Initialize socket connection only once
  useEffect(() => {
    // Prevent multiple socket connections
    if (socketInitializedRef.current) return;
    socketInitializedRef.current = true;

    // Get MCP URL from environment or use default
    const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:3003';
    console.log(`🔌 Connecting to MCP server at: ${MCP_URL}`);
    setConnectionStatus('connecting');

    try {
      // Get stored session ID or create a new one
      const storedSessionId = typeof window !== 'undefined' 
        ? localStorage.getItem('sessionId') || uuidv4()
        : uuidv4();
      
      // Initialize socket with session ID
      const socketInstance = io(MCP_URL, {
        query: { sessionId: storedSessionId },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      // Set session ID and store it
      setSessionId(storedSessionId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sessionId', storedSessionId);
      }

      // Set up event handlers
      socketInstance.on('connect', () => {
        console.log('🔌 Socket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
      });

      socketInstance.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
      });

      socketInstance.on('connect_error', (err) => {
        console.error('🔌 Socket connection error:', err);
        setConnectionStatus('error');
      });

      socketInstance.on('error', (err) => {
        console.error('🔌 Socket error:', err);
        setConnectionStatus('error');
      });

      socketInstance.on('session', (data) => {
        console.log('📝 Session data received:', data);
        if (data.sessionId) {
          setSessionId(data.sessionId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('sessionId', data.sessionId);
          }
        }
      });

      socketInstance.on('message', (message) => {
        console.log('📩 Message received:', message);
        setMessages((prev) => [...prev, message]);
      });

      socketInstance.on('typing', (isTyping) => {
        setIsTyping(isTyping);
      });

      // Store socket instance
      setSocket(socketInstance);

      // Clean up on unmount
      return () => {
        socketInstance.disconnect();
        setSocket(null);
        socketInitializedRef.current = false;
      };
    } catch (error) {
      console.error('🔌 Error initializing socket:', error);
      setConnectionStatus('error');
      socketInitializedRef.current = false;
    }
  }, []); // Empty dependency array to run only once

  // Handle customer loading from URL parameters
  useEffect(() => {
    if (!socket || !isConnected || customerLoadAttemptedRef.current) return;

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const resourceName = urlParams.get('resource');
      
      if (resourceName) {
        console.log(`🔍 Loading customer from URL parameter: ${resourceName}`);
        loadCustomer(resourceName);
        customerLoadAttemptedRef.current = true;
      } else if (!welcomeMessageRequestedRef.current) {
        // Only request welcome message if no resource parameter is provided
        // and we haven't already requested it
        console.log('🌟 Requesting welcome message after connection');
        setTimeout(() => {
          requestWelcomeMessage();
          welcomeMessageRequestedRef.current = true;
        }, 500); // Short delay to ensure socket is ready
      }
    }
  }, [isConnected]); // Only dependency is connection status

  // Methods for socket communication
  const requestWelcomeMessage = () => {
    if (!socket || !isConnected) {
      console.warn('⚠️ Cannot request welcome message: Socket not connected');
      return;
    }

    console.log('🌟 Requesting welcome message');
    socket.emit('welcome', { isAdmin: isAdminRef.current });
  };

  const sendMessage = (content: string, msgIsAdmin = isAdminRef.current) => {
    if (!socket || !isConnected) {
      console.warn('⚠️ Cannot send message: Socket not connected');
      return;
    }

    const messageObj: Message = {
      role: 'human',
      content,
      id: uuidv4(),
    };

    setMessages((prev) => [...prev, messageObj]);
    socket.emit('chat', { message: content, isAdmin: msgIsAdmin });
  };

  const loadCustomer = (resourceName: string, loadIsAdmin = isAdminRef.current) => {
    if (!socket || !isConnected) {
      console.warn('⚠️ Cannot load customer: Socket not connected');
      return;
    }

    console.log(`🔍 Loading customer: ${resourceName}`);
    socket.emit('loadCustomer', { resourceName, isAdmin: loadIsAdmin });
    setIsCustomerLoaded(true);
  };

  const clearContext = () => {
    if (!socket || !isConnected) {
      console.warn('⚠️ Cannot clear context: Socket not connected');
      return;
    }

    console.log('🧹 Clearing context');
    socket.emit('clearContext');
    setMessages([]);
    setIsCustomerLoaded(false);
    customerLoadAttemptedRef.current = false;
    welcomeMessageRequestedRef.current = false;
  };

  const value = {
    socket,
    messages,
    isConnected,
    isTyping,
    sessionId,
    sendMessage,
    loadCustomer,
    clearContext,
    connectionStatus,
    isCustomerLoaded,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}; 