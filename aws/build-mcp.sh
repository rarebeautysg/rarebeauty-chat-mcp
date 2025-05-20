#!/bin/bash
set -e

# Configuration
AWS_REGION="ap-southeast-1"  # Singapore region
ECR_REPOSITORY="rarebeauty-chat-mcp-server"
ECS_CLUSTER="SOHO-APPT"
ECS_SERVICE="rarebeauty-chat-mcp-service"
TASK_FAMILY="rarebeauty-chat-mcp-task"
IMAGE_TAG="latest"
AWS_ACCOUNT_ID="292376945194"

# Change to MCP server directory
cd "$(dirname "$0")/../mcp-server"
# Build the Docker image
echo "Building the Docker image..."
docker build --platform linux/amd64 -t $ECR_REPOSITORY:$IMAGE_TAG .

echo "Build completed successfully!" 