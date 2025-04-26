import { useState, useEffect, useCallback } from 'react';
import { getMCPClient, Message, UserContext } from '@/lib/mcpClient';

interface UseMCPOptions {
  serverUrl?: string;
  isAdmin?: boolean;
}

interface UseMCPResult {
  messages: Message[];
  sendMessage: (content: string) => void;
  loadCustomer: (resourceName: string) => void;
  isLoading: boolean;
  isConnected: boolean;
  clearContext: () => void;
  resetChat: () => void;
  userContext: UserContext | null;
}

export function useMCP(options: UseMCPOptions = {}): UseMCPResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  
  // Initialize MCP client
  useEffect(() => {
    const client = getMCPClient(options);
    
    // Setup event handlers
    const messageHandler = (message: Message) => {
      setMessages(prev => {
        // Check if message already exists
        const exists = prev.some(m => m.id === message.id);
        if (exists) return prev;
        return [...prev, message];
      });
    };
    
    const typingHandler = (isTyping: boolean) => {
      setIsLoading(isTyping);
    };
    
    const connectionHandler = (connected: boolean) => {
      setIsConnected(connected);
    };
    
    const contextHandler = (context: UserContext | null) => {
      setUserContext(context);
    };
    
    // Subscribe to events
    const unsubscribeMessage = client.onMessage(messageHandler);
    const unsubscribeTyping = client.onTyping(typingHandler);
    const unsubscribeConnection = client.onConnectionChange(connectionHandler);
    const unsubscribeContext = client.onContextUpdate(contextHandler);
    
    // Initial state check
    setIsConnected(client.isConnected());
    
    // Request context if connected
    if (client.isConnected()) {
      client.getContext();
    }
    
    // Cleanup
    return () => {
      unsubscribeMessage();
      unsubscribeTyping();
      unsubscribeConnection();
      unsubscribeContext();
    };
  }, [options.serverUrl, options.isAdmin]);
  
  // Send message handler
  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;
    
    const client = getMCPClient();
    const messageId = client.sendMessage(content);
    
    // Add user message to state immediately for better UX
    const userMessage: Message = {
      role: 'user',
      content,
      id: messageId
    };
    
    setMessages(prev => [...prev, userMessage]);
  }, []);
  
  // Load customer handler
  const loadCustomer = useCallback((resourceName: string) => {
    const client = getMCPClient();
    client.loadCustomer(resourceName);
  }, []);
  
  // Clear context handler
  const clearContext = useCallback(() => {
    const client = getMCPClient();
    client.clearContext();
    setUserContext(null);
  }, []);
  
  // Reset chat handler
  const resetChat = useCallback(() => {
    const client = getMCPClient();
    client.resetChat();
    setMessages([]);
    setUserContext(null);
  }, []);
  
  return {
    messages,
    sendMessage,
    loadCustomer,
    isLoading,
    isConnected,
    clearContext,
    resetChat,
    userContext
  };
} 