# DynamoDB Setup for Memory Persistence

This guide explains how to set up AWS DynamoDB for persistent memory storage in the Rare Beauty Chat application.

## Local Development with DynamoDB Local

For local development, you can use DynamoDB Local to test the application without connecting to AWS.

### Using Docker (Recommended)

1. Start DynamoDB Local using Docker:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

2. Configure your environment variables in `.env.local`:

```
USE_DYNAMODB=true
DYNAMODB_TABLE=rare-beauty-context-memory
AWS_REGION=ap-southeast-1
DYNAMODB_ENDPOINT=http://localhost:8000
```

### Using AWS CLI

For local development without Docker, you can use the AWS CLI to work with DynamoDB Local:

```bash
# Install the AWS CLI
npm install -g aws-cli-local

# Create a table for context memory
awslocal dynamodb create-table \
    --table-name rare-beauty-context-memory \
    --attribute-definitions AttributeName=sessionId,AttributeType=S \
    --key-schema AttributeName=sessionId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST

# List tables to confirm creation
awslocal dynamodb list-tables
```

## Production Setup with AWS DynamoDB

For production, you'll need to set up DynamoDB in your AWS account.

### Setting up DynamoDB in AWS

1. Create a DynamoDB table in your AWS account (either through the AWS Console or CLI):

```bash
aws dynamodb create-table \
    --table-name rare-beauty-context-memory \
    --attribute-definitions AttributeName=resourceName,AttributeType=S \
    --key-schema AttributeName=resourceName,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
```

2. Create an IAM policy for your application with the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:DescribeTable"
            ],
            "Resource": "arn:aws:dynamodb:*:*:table/rare-beauty-context-memory"
        }
    ]
}
```

3. Attach this policy to your application's IAM role or user.

4. Configure your environment variables in your deployment environment:

```
USE_DYNAMODB=true
DYNAMODB_TABLE=rare-beauty-context-memory
AWS_REGION=ap-southeast-1
```

## Environment Variables

The following environment variables control DynamoDB integration:

| Variable | Description | Default |
|----------|-------------|---------|
| USE_DYNAMODB | Enable DynamoDB integration | false |
| DYNAMODB_TABLE | DynamoDB table name | rare-beauty-context-memory |
| AWS_REGION | AWS region for DynamoDB | ap-southeast-1 |
| DYNAMODB_ENDPOINT | Custom endpoint for DynamoDB (for local development) | (none) |

## Testing DynamoDB Integration

You can test the DynamoDB integration by:

1. Starting the server with `USE_DYNAMODB=true`
2. Sending a chat message
3. Verifying that the context is saved in DynamoDB:

```bash
# For local development
awslocal dynamodb scan --table-name rare-beauty-context-memory

# For production
aws dynamodb scan --table-name rare-beauty-context-memory
```

## Fallback to In-Memory Storage

If DynamoDB is not configured correctly or if `USE_DYNAMODB` is set to `false`, the application will automatically fall back to in-memory storage. This ensures the application continues to function even without persistent storage. 