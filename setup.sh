#!/bin/bash

echo "🚀 Setting up Rare Beauty Chat application..."

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Chat server setup
echo "🔧 Setting up chat-server..."
cd chat-server
npm install

# Create .env.local for chat-server if it doesn't exist
if [ ! -f .env.local ]; then
  echo "📝 Creating .env.local for chat-server..."
  echo "NEXT_PUBLIC_MCP_URL=http://localhost:3003" > .env.local
  echo "✅ Created .env.local for chat-server"
else
  echo "ℹ️ .env.local for chat-server already exists"
fi

# Go back to root
cd ..

# MCP server setup
echo "🔧 Setting up mcp-server..."
cd mcp-server
npm install

# Create .env for mcp-server if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env for mcp-server..."
  cat > .env << EOL
PORT=3003
# Add your OpenAI API key here
OPENAI_API_KEY=
# JWT secret for authentication
JWT_SECRET=rarebeauty-jwt-secret-replace-in-production
# API URL for services
API_URL=http://localhost:3002
EOL
  echo "⚠️ Please edit mcp-server/.env to add your OpenAI API key"
  echo "✅ Created .env for mcp-server"
else
  echo "ℹ️ .env for mcp-server already exists"
fi

# Go back to root
cd ..

echo "✅ Setup complete! You can now run the application with 'npm run dev'"
echo "🔍 Don't forget to add your OpenAI API key to mcp-server/.env" 