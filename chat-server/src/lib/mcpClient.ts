import io, { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// MCP client events and types
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

export interface UserContext {
  resourceName?: string;
  name?: string;
  mobile?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface ToolResult {
  success: boolean;
  tool: string;
  result?: any;
  error?: string;
}

export interface VerifyTokenResult {
  isValid: boolean;
  decoded?: any;
  message?: string;
}

type MessageHandler = (message: Message) => void;
type TypingHandler = (isTyping: boolean) => void;
type ConnectionHandler = (isConnected: boolean) => void;
type ContextHandler = (context: UserContext | null) => void;
type HistoryHandler = (history: Message[]) => void;
type ToolResultHandler = (result: ToolResult) => void;

export class MCPClient {
  private socket: Socket | null = null;
  private sessionId: string = '';
  private messageHandlers: MessageHandler[] = [];
  private typingHandlers: TypingHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private contextHandlers: ContextHandler[] = [];
  private historyHandlers: HistoryHandler[] = [];
  private toolResultHandlers: Map<string, ToolResultHandler[]> = new Map();
  private isAdmin: boolean = false;
  private serverUrl: string = '';
  
  constructor(options: { serverUrl?: string; isAdmin?: boolean } = {}) {
    const { serverUrl = process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:3003', isAdmin = false } = options;
    this.isAdmin = isAdmin;
    this.serverUrl = serverUrl;
    
    // Get stored session ID if available
    if (typeof window !== 'undefined') {
      this.sessionId = localStorage.getItem('chatSessionId') || '';
    }
    
    // Initialize socket connection
    this.initSocket(serverUrl);
  }
  
  private initSocket(serverUrl: string): void {
    try {
      console.log(`🔄 Connecting to MCP server at ${serverUrl}`);
      
      // Create socket connection with debug logging
      this.socket = io(serverUrl, {
        query: this.sessionId ? { sessionId: this.sessionId } : undefined,
        withCredentials: true,
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnectionAttempts: 5,
        timeout: 10000
      });
      
      // Add connection debugging events
      this.socket.on('connect_error', (err) => {
        console.error(`🔴 Socket connection error: ${err.message}`);
      });
      
      this.socket.on('error', (err) => {
        console.error(`🔴 Socket error: ${err}`);
      });
      
      // Session ID assignment
      this.socket.on('session', ({ sessionId }: { sessionId: string }) => {
        this.sessionId = sessionId;
        if (typeof window !== 'undefined') {
          localStorage.setItem('chatSessionId', sessionId);
        }
      });
      
      // Message handling
      this.socket.on('message', (message: Message) => {
        this.messageHandlers.forEach(handler => handler(message));
      });
      
      // Typing indicator
      this.socket.on('typing', (isTyping: boolean) => {
        this.typingHandlers.forEach(handler => handler(isTyping));
      });
      
      // Context response
      this.socket.on('context', ({ context }: { context: UserContext | null }) => {
        this.contextHandlers.forEach(handler => handler(context));
      });
      
      // History response
      this.socket.on('history', ({ history }: { history: Message[] }) => {
        this.historyHandlers.forEach(handler => handler(history));
      });
      
      // Tool result handling
      this.socket.on('toolResult', (result: ToolResult) => {
        // Get handlers for this specific tool
        const handlers = this.toolResultHandlers.get(result.tool) || [];
        
        // Call all handlers
        handlers.forEach(handler => handler(result));
        
        // Remove these handlers after calling them
        this.toolResultHandlers.delete(result.tool);
      });
      
      // Connection events
      this.socket.on('connect', () => {
        this.connectionHandlers.forEach(handler => handler(true));
      });
      
      this.socket.on('disconnect', () => {
        this.connectionHandlers.forEach(handler => handler(false));
      });
    } catch (error) {
      console.error('Failed to initialize socket connection:', error);
    }
  }
  
  // Subscribe to message events
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
  
  // Subscribe to typing events
  public onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.push(handler);
    return () => {
      this.typingHandlers = this.typingHandlers.filter(h => h !== handler);
    };
  }
  
  // Subscribe to connection events
  public onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }
  
  // Subscribe to context events
  public onContextUpdate(handler: ContextHandler): () => void {
    this.contextHandlers.push(handler);
    return () => {
      this.contextHandlers = this.contextHandlers.filter(h => h !== handler);
    };
  }
  
  // Subscribe to history events
  public onHistoryUpdate(handler: HistoryHandler): () => void {
    this.historyHandlers.push(handler);
    return () => {
      this.historyHandlers = this.historyHandlers.filter(h => h !== handler);
    };
  }
  
  // Get connection status
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }
  
  // Request welcome message
  public requestWelcome(): void {
    if (!this.socket) return;
    this.socket.emit('welcome', { isAdmin: this.isAdmin });
  }
  
  // Load customer profile
  public loadCustomer(resourceName: string): void {
    if (!this.socket) return;
    this.socket.emit('loadCustomer', {
      resourceName,
      isAdmin: this.isAdmin
    });
  }
  
  // Send chat message
  public sendMessage(content: string): string {
    if (!this.socket) return '';
    
    const messageId = uuidv4();
    this.socket.emit('chat', {
      message: content,
      isAdmin: this.isAdmin
    });
    
    return messageId;
  }
  
  // Clear context
  public clearContext(): void {
    if (!this.socket) return;
    this.socket.emit('clearContext');
  }
  
  // Request current context
  public getContext(): void {
    if (!this.socket) return;
    this.socket.emit('getContext');
  }
  
  // Request chat history
  public getHistory(): void {
    if (!this.socket) return;
    this.socket.emit('getHistory');
  }
  
  // Use a tool with the provided parameters
  public useTool(tool: string, params: any): Promise<any> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket not connected'));
    }
    
    // Store socket in a local constant to assure TypeScript it's not null
    const socket = this.socket;
    
    return new Promise((resolve, reject) => {
      // Add handler for this specific tool result
      const handlers = this.toolResultHandlers.get(tool) || [];
      handlers.push((result) => {
        if (result.success) {
          resolve(result.result);
        } else {
          reject(new Error(result.error || 'Tool execution failed'));
        }
      });
      this.toolResultHandlers.set(tool, handlers);
      
      // Send the tool request
      socket.emit('useTool', { tool, params });
    });
  }
  
  // Verify JWT token
  public async verifyToken(token: string): Promise<VerifyTokenResult> {
    try {
      const apiUrl = `${this.serverUrl}/api/verify-token`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return {
          isValid: false,
          message: errorData.message || 'Token verification failed'
        };
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error verifying token:', error);
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  // Call a tool via HTTP API (alternative to socket method)
  public async callTool(tool: string, params: any): Promise<any> {
    try {
      const apiUrl = `${this.serverUrl}/api/tools`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool,
          params,
          sessionId: this.sessionId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Tool execution failed');
      }
      
      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error(`Error calling tool ${tool}:`, error);
      throw error;
    }
  }
  
  // Disconnect socket
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  // Update admin status
  public setAdminStatus(isAdmin: boolean): void {
    this.isAdmin = isAdmin;
  }
  
  // Reset chat (clear local storage and request new welcome)
  public resetChat(): void {
    if (typeof window !== 'undefined' && this.sessionId) {
      localStorage.removeItem(`chatMessages-${this.sessionId}`);
    }
    
    // Reconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.initSocket(this.serverUrl);
    }
  }
}

// Create a singleton instance for easy import
let mcpClientInstance: MCPClient | null = null;

export function getMCPClient(options: { serverUrl?: string; isAdmin?: boolean } = {}): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient(options);
  } else if (options.isAdmin !== undefined) {
    mcpClientInstance.setAdminStatus(options.isAdmin);
  }
  
  return mcpClientInstance;
} 