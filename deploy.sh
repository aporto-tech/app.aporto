#!/bin/bash

set -e

echo "🚀 Starting Deployment for Aporto..."

# Define binary paths to ensure robustness in non-interactive shells
NODE_BIN="/root/.nvm/versions/node/v24.14.0/bin/node"
NPM_BIN="/root/.nvm/versions/node/v24.14.0/bin/npm"
PM2_BIN="/root/.nvm/versions/node/v24.14.0/lib/node_modules/pm2/bin/pm2"

# 1. Fetch latest changes from GitHub
echo "🔄 Pulling latest changes from GitHub..."
git pull origin main || git pull origin master

# 2. Update/Install dependencies
echo "📦 Installing npm dependencies..."
$NPM_BIN install

# 3. Build the Next.js application
echo "🏗️ Building Next.js app..."
$NPM_BIN run build

# 4. Free up port 3000
echo "🧹 Checking port 3000..."
PID=$(lsof -t -i:3000 || true)
if [ -n "$PID" ]; then
  echo "⚠️ Port 3000 is blocked by process $PID. Killing process..."
  kill -9 $PID
  echo "✅ Port 3000 freed."
else
  echo "✅ Port 3000 is clear."
fi

# 5. Start/Restart Next.js app with PM2 (using standalone build)
echo "🚀 Starting Next.js with PM2 on port 3000..."
$NODE_BIN $PM2_BIN describe "aporto-app" > /dev/null 2>&1 && $NODE_BIN $PM2_BIN delete "aporto-app" || true
PORT=3000 $NODE_BIN $PM2_BIN start "$NODE_BIN .next/standalone/server.js" --name "aporto-app"

# 6. Deploy new-api via Docker
echo "🐳 Deploying new-api via Docker (port 3006 → https://api.aporto.tech)..."
docker compose up -d new-api redis

# Wait for new-api to become ready (up to 30 seconds)
echo "⏳ Waiting for new-api to be ready..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:3006/api/status > /dev/null 2>&1; then
    echo "✅ new-api is up and running."
    break
  fi
  echo "   ...attempt $i/15"
  sleep 2
done

echo "✅ Deployment finished successfully!"
# Save PM2 process list to restore on reboot
$NODE_BIN $PM2_BIN save
