#!/bin/bash
set -e

# Configuration
AWS_REGION="ap-southeast-1"  # Singapore region
ECR_REPOSITORY="rarebeauty-chat"
ECS_CLUSTER="SOHO-APPT"
ECS_SERVICE="rarebeauty-chat-service"
TASK_FAMILY="rarebeauty-chat-task"
IMAGE_TAG="latest"
AWS_ACCOUNT_ID="292376945194"

# Login to AWS ECR
echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build the Docker image
echo "Building the Docker image..."
docker build --platform linux/amd64 -t $ECR_REPOSITORY:$IMAGE_TAG .

# Tag the image for ECR
echo "Tagging the image for ECR..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Push the image to ECR
echo "Pushing the image to ECR..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Get the current task definition
echo "Retrieving current task definition..."
TASK_DEFINITION=$(aws ecs describe-task-definition --task-definition $TASK_FAMILY --region $AWS_REGION)

# Use the new image in the task definition
echo "Updating task definition with new image..."
NEW_TASK_DEFINITION=$(echo $TASK_DEFINITION | jq '.taskDefinition' | jq '.containerDefinitions[0].image="'$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG'"')
FINAL_TASK_DEFINITION=$(echo $NEW_TASK_DEFINITION | jq '.family="'$TASK_FAMILY'"' | jq 'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)')

# Register the new task definition
echo "Registering new task definition..."
NEW_TASK_DEFINITION_ARN=$(aws ecs register-task-definition --region $AWS_REGION --cli-input-json "$(echo $FINAL_TASK_DEFINITION)" | jq -r '.taskDefinition.taskDefinitionArn')

# Update the service to use the new task definition
echo "Updating the service to use the new task definition..."
aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --task-definition $NEW_TASK_DEFINITION_ARN --region $AWS_REGION

# Get the list of running tasks for the service
echo "Finding running tasks..."
RUNNING_TASKS=$(aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $ECS_SERVICE --region $AWS_REGION | jq -r '.taskArns[]')

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
aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION | jq '.services[0].deployments'

echo "Deployment completed successfully!" 