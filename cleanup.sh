#!/bin/bash

echo "🧹 Cleaning up unnecessary files in chat-server..."

# Create a backup directory
BACKUP_DIR="chat-server-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p $BACKUP_DIR
echo "📦 Created backup directory: $BACKUP_DIR"

# Backup and remove types folder
if [ -d "chat-server/src/types" ]; then
  echo "🔄 Backing up types folder..."
  cp -r "chat-server/src/types" "$BACKUP_DIR/"
  echo "🗑️ Removing types folder..."
  rm -rf "chat-server/src/types"
fi

# Backup and remove API routes that are no longer needed
API_ROUTES=(
  "chat"
  "tools"
  "contacts"
  "admin"
  "verify-token"
  "calendar"
  "booking"
  "services"
)

for route in "${API_ROUTES[@]}"; do
  if [ -d "chat-server/src/app/api/$route" ]; then
    echo "🔄 Backing up api/$route folder..."
    mkdir -p "$BACKUP_DIR/api"
    cp -r "chat-server/src/app/api/$route" "$BACKUP_DIR/api/"
    echo "🗑️ Removing api/$route folder..."
    rm -rf "chat-server/src/app/api/$route"
  fi
done

# Check for pages/api and back it up if it exists
if [ -d "chat-server/src/pages/api" ]; then
  echo "🔄 Backing up pages/api folder..."
  mkdir -p "$BACKUP_DIR/pages"
  cp -r "chat-server/src/pages/api" "$BACKUP_DIR/pages/"
  echo "🗑️ Removing pages/api folder..."
  rm -rf "chat-server/src/pages/api"
fi

# Create a minimal types folder with just what we need
echo "📝 Creating minimal types folder..."
mkdir -p "chat-server/src/types"

# Create a minimal socket types file
cat > "chat-server/src/types/socket.ts" << EOL
export interface Message {
  role: 'human' | 'assistant';
  content: string;
  id: string;
}

export interface UserContext {
  resourceName?: string;
  name?: string;
  mobile?: string;
  updatedAt?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
EOL

# Create a simple health API endpoint
mkdir -p "chat-server/src/app/api/health"
cat > "chat-server/src/app/api/health/route.ts" << EOL
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown',
  });
}
EOL

echo "✅ Cleanup complete! Unnecessary files have been removed and backed up to $BACKUP_DIR"
echo "ℹ️ A minimal types folder has been created with just the socket types"
echo "ℹ️ A simple health API endpoint has been kept for status checks" 