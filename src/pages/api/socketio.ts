import { Server as ServerIO } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { 
  getOrCreateExecutor, 
  chatHistories, 
  userContexts
} from '../../app/api/chat/route';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // @ts-ignore
  if (!res.socket?.server.io) {
    console.log('*️⃣ Setting up Socket.IO server...');
    
    // @ts-ignore
    const io = new ServerIO(res.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
    });

    // Socket.IO connection handler
    io.on('connection', (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);
      
      let sessionId = socket.handshake.query.sessionId as string;
      
      // If no session ID provided, create a new one
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        socket.emit('session', { sessionId });
        console.log(`📝 Generated new session ID: ${sessionId}`);
      }
      
      // Join a room with the session ID
      socket.join(sessionId);
      
      // Handle welcome message request
      socket.on('welcome', async (data: { isAdmin: boolean }) => {
        console.log(`🌟 Welcome message requested for session ${sessionId}`);
        const welcomeMessage = data.isAdmin 
          ? "Welcome, Admin. Can I have the customer's mobile number so I can better help you?"
          : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
        
        socket.emit('message', {
          role: 'assistant',
          content: welcomeMessage,
          id: crypto.randomUUID()
        });
      });
      
      // Handle load customer request
      socket.on('loadCustomer', async (data: { resourceName: string, isAdmin: boolean }) => {
        console.log(`🔍 Loading customer for session ${sessionId}: ${data.resourceName}`);
        
        try {
          // Call our contacts API to get customer data
          const apiEndpoint = `/api/contacts?resourceName=${encodeURIComponent(data.resourceName)}`;
          const baseUrl = process.env.VERCEL_URL || 'http://localhost:3002';
          const fullUrl = new URL(apiEndpoint, baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`);
          
          const contactsResponse = await fetch(fullUrl);
          
          if (!contactsResponse.ok) {
            throw new Error(`Failed to load customer: ${contactsResponse.status}`);
          }
          
          const contactData = await contactsResponse.json();
          
          if (!contactData.success || !contactData.contact) {
            throw new Error('Customer not found');
          }
          
          const customer = contactData.contact;
          
          // Add customer to user context for this session
          const updatedContext = {
            resourceName: customer.resourceName,
            name: customer.name,
            mobile: customer.mobile,
            updatedAt: new Date().toISOString()
          };
          
          userContexts.set(sessionId, updatedContext);
          console.log('✅ Stored customer context for session', sessionId, ':', updatedContext);
          
          // Return personalized welcome message
          const welcomeMessage = data.isAdmin 
            ? `Welcome, Admin. I've loaded the customer profile for ${customer.name} (${customer.mobile}). How can I assist you with this customer today?`
            : `Hello ${customer.name}! Welcome back to Rare Beauty. How can I assist you today?`;
          
          socket.emit('message', {
            role: 'assistant',
            content: welcomeMessage,
            id: crypto.randomUUID()
          });
        } catch (error) {
          console.error('❌ Error loading customer:', error);
          
          // Return a generic welcome message on error
          const welcomeMessage = data.isAdmin 
            ? "I couldn't find that customer. Can I have their mobile number so I can look them up?"
            : "Hello there! How are you doing today? Can I have your mobile number so I can better help you?";
          
          socket.emit('message', {
            role: 'assistant',
            content: welcomeMessage,
            id: crypto.randomUUID()
          });
        }
      });
      
      // Handle chat messages
      socket.on('chat', async (data: { message: string, isAdmin: boolean }) => {
        try {
          console.log(`📨 Received message for session ${sessionId}: "${data.message.substring(0, 100)}${data.message.length > 100 ? '...' : ''}" (Admin: ${data.isAdmin})`);
          
          // Show typing indicator
          socket.emit('typing', true);
          
          // Get or create executor
          const executor = await getOrCreateExecutor(sessionId, data.isAdmin);
          
          // Get user context if it exists from memory
          const userContext = userContexts.get(sessionId);
          if (userContext) {
            console.log(`👤 Found existing user context for session ${sessionId}:`, userContext);
          }
          
          // Get existing chat history or initialize a new one
          if (!chatHistories.has(sessionId)) {
            chatHistories.set(sessionId, []);
            console.log(`📝 Created new chat history for session ${sessionId}`);
          }
          const history = chatHistories.get(sessionId)!;
          
          // Add user message to history
          history.push({ type: 'human', content: data.message });
          
          // Prepare input with user context if available
          let inputToUse = data.message;
          if (userContext?.resourceName) {
            inputToUse = `${data.message} (User context: ResourceName=${userContext.resourceName}, Name=${userContext.name}, Mobile=${userContext.mobile})`;
            console.log('📝 Enhanced input with user context for session', sessionId);
          }
          
          // Invoke the executor with the enhanced input
          console.log("🤖 Invoking executor with input:", JSON.stringify(inputToUse));
          
          const result = await executor.invoke({
            input: inputToUse,
            chat_history: history.map(msg => {
              if (msg.type === 'human') {
                return { role: 'human', content: msg.content };
              } else {
                return { role: 'assistant', content: msg.content };
              }
            }),
          });
          
          // Extract response content
          let responseContent = '';
          if (typeof result === 'string') {
            responseContent = result;
          } else if (result.output) {
            responseContent = String(result.output);
          } else if (result.response) {
            responseContent = String(result.response);
          } else {
            const firstKey = Object.keys(result)[0];
            responseContent = firstKey ? String(result[firstKey]) : JSON.stringify(result);
          }
          
          console.log(`📤 Generated response for session ${sessionId}: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? '...' : ''}"`);
          
          // Add assistant response to history
          history.push({ type: 'assistant', content: responseContent });
          
          // Stop typing indicator
          socket.emit('typing', false);
          
          // Send the response back to the client
          socket.emit('message', {
            role: 'assistant',
            content: responseContent,
            id: crypto.randomUUID()
          });
        } catch (error) {
          console.error('❌ Error in chat processing:', error);
          
          // Stop typing indicator
          socket.emit('typing', false);
          
          // Send error message
          socket.emit('message', {
            role: 'assistant',
            content: 'Sorry, I encountered an error processing your request. Please try again.',
            id: crypto.randomUUID()
          });
        }
      });
      
      // Handle clear context request
      socket.on('clearContext', async () => {
        try {
          console.log(`🧹 Clearing context for session ${sessionId}`);
          
          // Remove user context
          userContexts.delete(sessionId);
          
          // Clear chat history
          if (chatHistories.has(sessionId)) {
            chatHistories.delete(sessionId);
          }
          
          socket.emit('contextCleared', { success: true });
        } catch (error) {
          console.error('❌ Error clearing context:', error);
          socket.emit('contextCleared', { 
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
      });
    });

    // @ts-ignore
    res.socket.server.io = io;
  }
  
  res.end();
} 