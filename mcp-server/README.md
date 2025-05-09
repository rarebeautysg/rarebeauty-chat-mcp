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

## Service Detection System

The service detection system in this application identifies beauty services mentioned in chat messages. It's responsible for distinguishing between:

1. Messages about appointment history
2. Messages about booking new services
3. Messages about reusing previously selected services

### Key Features

- **History Detection**: Identifies appointment history information to avoid treating historical service mentions as new booking requests
- **Service Identification**: Uses pattern matching to identify specific beauty services mentioned in messages
- **Previous Service Reuse**: Detects when a user wants to reuse previously selected services
- **Explicit Service IDs**: Handles cases where services are referenced by specific IDs

### How It Works

The system follows this workflow:

1. First checks if the user wants to reuse previous services with phrases like "same as before"
2. Determines if the message is about appointment history
3. If not history or reuse, it extracts service mentions from the text using:
   - Explicit service ID detection (e.g., service:123)
   - Specific service pattern matching for various categories (lashes, facial, etc.)
   - Generic category matching as a fallback

### Implementation

The main implementation is in `src/tools/scanServices.js`, which provides:

- `ScanServicesTool` - LangChain tool for detecting services in messages
- Service pattern matching using regular expressions
- History detection using text pattern analysis
- Context tracking to manage user service selections

### Example

When a user says:
```
I'd like to book a full set lashes appointment for next Tuesday
```

The system will:
1. Determine this is NOT appointment history
2. Extract "full set lashes" as a specific service type
3. Find the relevant Lashes - Full Set services
4. Track these detected services in the conversation context 