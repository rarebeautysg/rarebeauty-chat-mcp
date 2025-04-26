# Rare Beauty MCP Server

Memory and Context Persistence Server for Rare Beauty Chat. This server handles WebSocket connections, manages chat history, and stores user context information.

## Features

- WebSocket server for real-time chat
- Memory persistence for chat histories
- User context management
- HTTP API endpoints for external access
- Configurable through environment variables

## Setup

1. Install dependencies:
```
npm install
```

2. Create a `.env` file based on the example below:
```
# Server configuration
PORT=3003

# Client URL for CORS
CLIENT_URL=http://localhost:3002

# API URL for contacts and other services
API_URL=http://localhost:3002

# AI service URL
AI_SERVICE_URL=http://localhost:3002/api/chat
```

3. Start the development server:
```
npm run dev
```

4. For production:
```
npm start
```

## API Endpoints

### WebSocket Events

- `welcome`: Request a welcome message
- `loadCustomer`: Load a customer profile
- `chat`: Send a chat message
- `clearContext`: Clear context for the current session
- `getContext`: Get current user context
- `getHistory`: Get chat history

### HTTP Endpoints

- `GET /health`: Health check endpoint
- `GET /api/context/:sessionId`: Get user context for a session
- `GET /api/history/:sessionId`: Get chat history for a session
- `POST /api/context/:sessionId`: Set user context for a session

## Architecture

The MCP server is designed to be a separate service that handles:

1. **WebSocket connections** - Managing real-time chat connections
2. **Memory persistence** - Storing chat histories and user contexts
3. **Session management** - Tracking user sessions
4. **Content routing** - Forwarding messages to the AI service

This allows the main application to focus on business logic while the MCP server handles the stateful parts of the system.

## Integration with Main App

To use this server with the main application:

1. Update the Socket.IO configuration in the client to point to this server
2. Update AI endpoints to call into this service for context information
3. Configure proper CORS settings 