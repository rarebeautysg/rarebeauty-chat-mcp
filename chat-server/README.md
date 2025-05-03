# Rare Beauty Chat Application

This is a modern chat application for Rare Beauty salon, built with Next.js, TypeScript, and WebSockets.

## Architecture

The application is composed of two main components:

1. **Main Chat Application**: A Next.js application providing the user interface and API endpoints
2. **MCP Server**: A dedicated WebSocket server for Memory and Context Persistence

## Features

- Real-time chat with AI assistant
- WebSocket-based communication for instant messaging
- Integration with salon booking system
- Mobile-responsive design
- Admin mode for salon staff

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies for the main app:

```bash
npm install
```

3. Install dependencies for the MCP server:

```bash
cd mcp-server
npm install
```

### Development

1. Start the MCP server:

```bash
cd mcp-server
npm run dev
```

2. In a separate terminal, start the main app:

```bash
npm run dev
```

3. Open [http://localhost:3002](http://localhost:3002) in your browser

## Deployment

The application is deployed using Docker and AWS ECS. See deployment guides:

- [Main Application Deployment](./aws/README.md)
- [MCP Server Deployment](./mcp-server/README.md)

## Environment Variables

### Main App

```
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_MCP_URL=ws://localhost:3003  # For local dev, use wss:// in production
```

### MCP Server

```
PORT=3003
NODE_ENV=development  # or production
```

## Admin Mode

Access admin mode by adding `?admin=true` to the URL in development:
http://localhost:3002/?admin=true

In production, admin access is protected by JWT authentication.

## License

This project is proprietary and confidential.

## Features

- 🤖 AI-powered chat assistant using OpenAI GPT models
- 📅 Appointment booking with calendar integration
- 👤 Customer information lookup and management
- 📋 Service listings and pricing information
- 📱 Responsive, mobile-friendly interface
- 🔄 Session persistence for continuous conversations

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **AI/ML**: OpenAI API, LangChain
- **State Management**: React hooks
- **Styling**: Tailwind CSS with custom components

## Development

### Project Structure

```
rarebeauty-chat/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/             # API routes
│   │   │   └── chat/        # Chat API endpoint
│   │   ├── page.tsx         # Main chat page
│   │   └── layout.tsx       # Root layout
│   ├── components/          # React components
│   │   ├── ChatInterface.tsx    # Main chat UI component
│   │   ├── ChatInput.tsx        # Input component
│   │   ├── MessageBubble.tsx    # Message display component
│   │   └── Loading.tsx          # Loading indicator
│   ├── prompts/             # AI system prompts
│   │   └── systemPrompt.js  # Main system prompt
│   ├── tools/               # LangChain tools
│   │   ├── lookupUser.js        # Customer lookup tool
│   │   ├── getServices.js       # Service listing tool
│   │   ├── getAvailableSlots.js # Slot availability tool
│   │   └── bookAppointment.js   # Appointment booking tool
│   ├── services/            # Service logic
│   │   └── servicesData.js      # Service data handling
│   └── types/               # TypeScript type definitions
│       └── tools.ts         # Tool result type definitions
├── public/                  # Static assets
└── .env.local               # Environment variables
```

### Key Components

1. **ChatInterface**: Main component that combines the message display area and input field.
2. **MessageBubble**: Displays individual chat messages with styling based on the sender.
3. **ChatInput**: User input component with submit functionality.
4. **API Route Handler**: Manages the chat flow, connection to OpenAI, and execution of tools.

### Tools

The application uses LangChain tools to handle specific functionality:

- **lookupUser**: Find customer information by phone number
- **getServices**: Retrieve service listings and pricing
- **getAvailableSlots**: Check appointment availability
- **bookAppointment**: Create new appointments

## Acknowledgements

- [OpenAI](https://openai.com/) for the AI models
- [LangChain](https://langchain.com/) for the agent framework
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for styling

### Text Chat
The chat system allows users to have conversations with an AI assistant. Users can type messages and receive responses from the assistant.

### Voice Recording
The chat system now supports voice recording for a more convenient user experience.

#### How to use:
1. Click the microphone icon in the chat input area.
2. Grant microphone permissions if prompted.
3. Record your message.
4. When finished, click the stop button.
5. Preview your recording and click "Send" to transmit it or "Discard" to cancel.
6. The system will transcribe your audio using OpenAI's Whisper model and process it like a regular text message.

## Technical Implementation
- The voice recording component uses the Web Audio API and MediaRecorder API.
- Audio is captured, encoded, and sent as a base64 string to the server.
- The server uses OpenAI's Whisper API to transcribe the audio to text.
- The transcribed text is then processed by the AI assistant just like a regular text message.

## Environment Variables
Make sure you have the following environment variables set:
- `OPENAI_API_KEY`: Your OpenAI API key for audio transcription

## Requirements
- Modern browser that supports the MediaRecorder API
- Microphone access
- Internet connection for audio transcription
