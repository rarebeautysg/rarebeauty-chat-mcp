# Rare Beauty MCP Server

The Memory and Context Persistence (MCP) Server for the Rare Beauty Chat application. This service manages WebSocket connections, persists chat context, and synchronizes state between clients.

## Features

- WebSocket-based real-time communication
- In-memory persistence of user context and chat history
- Centralized state management to prevent duplicate messages
- Dynamic system prompts that adapt to the current context
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

## Dynamic System Prompts

The MCP server generates dynamic system prompts for each interaction with the LLM by injecting the current context. This ensures the LLM always has the most up-to-date information.

### How It Works

1. Before each LLM call, the `promptUtils.js` module generates a system prompt based on the current context
2. The prompt includes customer details, selected services, appointment info, etc.
3. This prompt is used for that specific interaction only
4. After the LLM responds and context is updated, a new prompt is generated for the next interaction

### Example Dynamic Prompt

```
You are a helpful beauty salon assistant for Rare Beauty. Your job is to assist with appointment booking and management.

CURRENT CONTEXT:
Current customer: Alice Tan (+6591234567)
Currently selected services: lashes_full_set_dense
No appointment created yet. Preferred date: 2025-05-21 at 10:00
ADMIN MODE ENABLED: You can create and manage appointments on behalf of customers.

MEMORY MANAGEMENT:
- The system maintains the session state above for this conversation
- Before asking for information, check if it's already in the context above
- Do not ask for information that is already present in the context
- In admin mode, be more direct and business-like in your responses
- Focus on collecting all necessary information before creating an appointment
...
```

### Implementing in Your Client

To use dynamic system prompts, your chat client should:

1. Register with the MCP server to get a session ID
2. Send context updates whenever relevant information changes
3. The MCP server automatically uses this context to generate prompts

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

- `register`: Register a session with the MCP server
- `chat_message`: Send a chat message
- `tool_call`: Execute a tool function
- `reset_context`: Clear context for the current session
- `get_context`: Get current context for a session

### HTTP Endpoints

- `GET /health`: Health check endpoint
- `GET /api/context/:sessionId`: Get context for a session
- `GET /api/history/:sessionId`: Get chat history for a session
- `POST /api/context/:sessionId`: Set context for a session

## Architecture

The MCP server is designed with a focus on maintaining context across multiple interactions:

1. **WebSocket Server**: Handles real-time communication between clients
2. **Context Manager**: Maintains the state for each conversation session
3. **Dynamic Prompt Generator**: Creates custom system prompts based on current context
4. **Chat Service**: Processes messages and manages tool calls
5. **AI Client**: Interfaces with the LLM provider

## Example Integration

Check out the example client integration:

```bash
npm run example
```

This demonstrates a complete conversation flow with dynamic context updates.

## Fixing Common Issues

### LLM State Retention Problems

If your LLM isn't properly retaining state between messages, ensure:

1. You're regenerating the system prompt before each interaction:

```javascript
const prompt = createSystemPrompt({
  admin_mode: mcpContext.admin_mode,
  customer: mcpContext.customer,
  selectedServices: mcpContext.selectedServices,
  preferredDate: mcpContext.preferredDate,
  preferredTime: mcpContext.preferredTime,
  createdAppointmentId: mcpContext.createdAppointmentId
});
```

2. Context is being properly updated after each interaction
3. Tool calls are updating the shared context

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