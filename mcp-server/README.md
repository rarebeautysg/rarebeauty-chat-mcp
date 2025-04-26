# Rare Beauty MCP Server

The Memory and Context Persistence (MCP) Server for the Rare Beauty Chat application. This service manages WebSocket connections, persists chat context, and synchronizes state between clients.

## Features

- WebSocket-based real-time communication
- In-memory persistence of user context and chat history
- Centralized state management to prevent duplicate messages
- Proper clean-up on disconnect

## Local Development

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

The server will start on port 3003 by default.

## Docker Build

```bash
docker build -t rarebeauty-chat-mcp-server .
```

## Testing the Container Locally

```bash
docker run -p 3003:3003 rarebeauty-chat-mcp-server
```

## AWS Deployment

### Prerequisites

- AWS CLI installed and configured
- Permissions to create/manage ECR repositories, ECS services, CloudFormation stacks
- jq command line tool

### Deployment Process

1. Update AWS configuration in `aws/deploy-mcp.sh` if needed
2. Make the deployment script executable:

```bash
chmod +x aws/deploy-mcp.sh
```

3. Run the deployment script:

```bash
./aws/deploy-mcp.sh
```

This will:
- Build the Docker image
- Push it to Amazon ECR
- Deploy or update the ECS service

### CloudFormation Stack Deployment

For the first deployment, you'll need to create the CloudFormation stack:

```bash
aws cloudformation create-stack \
  --stack-name rarebeauty-chat-mcp \
  --template-body file://aws/mcp-cloudformation.yaml \
  --parameters \
      ParameterKey=VPC,ParameterValue=YOUR_VPC_ID \
      ParameterKey=Subnets,ParameterValue=YOUR_SUBNET_IDS \
  --capabilities CAPABILITY_IAM
```

Replace `YOUR_VPC_ID` and `YOUR_SUBNET_IDS` with your actual AWS resource IDs.

### Updating the Stack

For subsequent deployments, after pushing a new image to ECR:

```bash
aws cloudformation update-stack \
  --stack-name rarebeauty-chat-mcp \
  --template-body file://aws/mcp-cloudformation.yaml \
  --parameters \
      ParameterKey=VPC,ParameterValue=YOUR_VPC_ID \
      ParameterKey=Subnets,ParameterValue=YOUR_SUBNET_IDS \
  --capabilities CAPABILITY_IAM
```

## Configuration

The MCP server can be configured using environment variables:

- `PORT`: The port to listen on (default: 3003)
- `NODE_ENV`: Set to 'production' in production environments

## Integration with Chat App

Once deployed, update the main chat application's environment variable:

```
NEXT_PUBLIC_MCP_URL=wss://your-mcp-alb-dns-name
```

Replace `your-mcp-alb-dns-name` with the DNS name of your MCP server's load balancer, which you can find in the CloudFormation stack outputs.

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