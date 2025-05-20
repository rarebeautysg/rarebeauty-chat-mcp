# AWS Deployment Guide for Rare Beauty Chat

This guide provides instructions for deploying the Rare Beauty Chat application to AWS using ECS Fargate.

## Prerequisites

1. AWS CLI installed and configured with appropriate credentials
2. Docker installed locally
3. An AWS account with permissions to create resources:
   - ECR repository
   - ECS cluster and services
   - CloudFormation stacks
   - IAM roles and policies
   - Secrets Manager secrets
   - VPC, subnets, security groups
   - Application Load Balancer

## Setup AWS Infrastructure

### Option 1: Using CloudFormation

1. Create an ECR repository first:

```bash
aws ecr create-repository --repository-name rarebeauty-chat --region ap-southeast-1
```

2. Deploy the CloudFormation stack:

```bash
aws cloudformation deploy \
  --template-file aws/cloudformation-template.yaml \
  --stack-name rarebeauty-chat \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ImageUri=<your-account-id>.dkr.ecr.ap-southeast-1.amazonaws.com/rarebeauty-chat:latest \
    OpenAIApiKey=<your-openai-key> \
    GoogleServiceAccount='<your-google-service-account-json>' \
    CalendarId=<your-calendar-id> \
    SohoAuthToken=<your-soho-token> \
    VpcId=<your-vpc-id> \
    Subnets=<subnet-1>,<subnet-2>
```

3. Get the application URL:

```bash
aws cloudformation describe-stacks \
  --stack-name rarebeauty-chat \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" \
  --output text
```

### Option 2: Using the deploy script

1. Set environment variables:

```bash
export AWS_ACCOUNT_ID=<your-account-id>
export AWS_REGION=ap-southeast-1
```

2. Make the script executable:

```bash
chmod +x aws/deploy.sh
```

3. Run the deploy script:

```bash
./aws/deploy.sh
```

## Environment Variables

The following environment variables need to be set in your AWS task definition:

- `OPENAI_API_KEY`: Your OpenAI API key
- `GOOGLE_SERVICE_ACCOUNT`: Your Google Service Account JSON (stringified)
- `CALENDAR_ID`: Your Google Calendar ID
- `SOHO_AUTH_TOKEN`: Your Soho Auth Token
- `NODE_ENV`: Set to "production"

## Monitoring

The application includes a health check endpoint at `/api/health` that returns service status information.

You can monitor the application through:
- CloudWatch Logs: `/ecs/rarebeauty-chat`
- ECS service metrics
- Application Load Balancer metrics

## Scaling

The service is initially deployed with 1 container. To scale:

```bash
aws ecs update-service --cluster rarebeauty-cluster \
  --service rarebeauty-chat-service \
  --desired-count <number-of-tasks>
```

You can also set up auto-scaling based on CPU/memory usage or request count.

## Troubleshooting

1. Check if the container is running:
```bash
aws ecs list-tasks --cluster rarebeauty-cluster
```

2. View container logs:
```bash
aws logs get-log-events \
  --log-group-name /ecs/rarebeauty-chat \
  --log-stream-name <log-stream-name>
```

3. SSH into the task (requires AWS Session Manager):
```bash
aws ecs execute-command \
  --cluster rarebeauty-cluster \
  --task <task-id> \
  --container rarebeauty-chat \
  --interactive \
  --command "/bin/sh"
```

4. Check health check endpoint:
```bash
curl http://<alb-dns-name>/api/health
``` 