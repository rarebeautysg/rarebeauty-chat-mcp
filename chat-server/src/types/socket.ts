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
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
