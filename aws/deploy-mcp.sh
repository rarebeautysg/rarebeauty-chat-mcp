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

# Login to AWS ECR
echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Create repository if it doesn't exist
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION || aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION

# Build the Docker image
echo "Building the Docker image..."
docker build --platform linux/amd64 -t $ECR_REPOSITORY:$IMAGE_TAG .

# Tag the image for ECR
echo "Tagging the image for ECR..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Push the image to ECR
echo "Pushing the image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Get the list of running tasks for the service
echo "Finding running tasks..."
RUNNING_TASKS=$(aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $ECS_SERVICE --region $AWS_REGION 2>/dev/null | jq -r '.taskArns[]' 2>/dev/null || echo "")

# Stop each running task to force new deployment
if [ -n "$RUNNING_TASKS" ]; then
  echo "Stopping running tasks to force new deployment..."
  for TASK_ARN in $RUNNING_TASKS; do
    echo "Stopping task: $TASK_ARN"
    aws ecs stop-task --cluster $ECS_CLUSTER --task $TASK_ARN --region $AWS_REGION
    echo "Task $TASK_ARN stopped."
  done
else
  echo "No running tasks found."
fi

echo "Waiting for new tasks to start..."
sleep 10

echo "Checking service deployment status..."
aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION 2>/dev/null | jq '.services[0].deployments' 2>/dev/null || echo "Service not found. You may need to create it using CloudFormation."

echo "Deployment completed successfully!" 