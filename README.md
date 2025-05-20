# Rare Beauty Chat

A chat application for Rare Beauty salon with customer and admin interfaces.

## Project Structure

This project consists of two main components:

1. **Chat Server (Next.js)**: Frontend application with React components and a proxy server
2. **MCP Server (Express)**: Backend server handling LLM integration, context management, and chat logic

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key

### Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/rarebeauty-chat.git
cd rarebeauty-chat
```

2. Install dependencies:
```bash
# Install root dependencies
npm install

# Install chat-server dependencies
cd chat-server
npm install
cd ..

# Install mcp-server dependencies
cd mcp-server
npm install
cd ..
```

3. Create environment files:

For chat-server, create `.env.local`:
```
NEXT_PUBLIC_MCP_URL=http://localhost:3003
```

For mcp-server, create `.env`:
```
PORT=3003
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret
API_URL=your_api_url
```

### Running the Application

To run both servers simultaneously:
```bash
npm run dev
```

Or run them separately:
```bash
# MCP Server
npm run dev:mcp

# Chat Server
npm run dev:chat
```

The application will be available at:
- Chat UI: http://localhost:3002
- Admin UI: http://localhost:3002/admin
- MCP Server: http://localhost:3003

## Features

- Real-time chat using WebSockets
- Admin interface for managing customer interactions
- Customer lookup and profile loading
- Appointment booking capabilities
- Memory persistence between sessions
- JWT authentication for admin access

## Architecture

See [README-MCP.md](README-MCP.md) for detailed architecture information.

## License

This project is proprietary and confidential.

## Contact

For support or inquiries, please contact [support@rarebeauty.com](mailto:support@rarebeauty.com) 