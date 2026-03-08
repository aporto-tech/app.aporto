#!/bin/bash

echo "🚀 Starting Deployment for Aporto..."

# 1. Fetch latest changes from GitHub
echo "🔄 Pulling latest changes from GitHub..."
git pull origin main || git pull origin master

# 2. Update/Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 2. Build the Next.js application
echo "🏗️ Building Next.js app..."
npm run build

# 3. Free up port 3000
echo "🧹 Checking port 3000..."
PID=$(lsof -t -i:3000)
if [ -n "$PID" ]; then
  echo "⚠️ Port 3000 is blocked by process $PID. Killing process..."
  kill -9 $PID
  echo "✅ Port 3000 freed."
else
  echo "✅ Port 3000 is clear."
fi

# 4. Start/Restart Next.js app with PM2
echo "🚀 Starting Next.js with PM2 on port 3000..."
# Check if the PM2 process 'aporto-app' exists
pm2 describe "aporto-app" > /dev/null
if [ $? -eq 0 ]; then
    pm2 reload "aporto-app" --update-env
else
    # Start on port 3000
    PORT=3000 pm2 start "npm start" --name "aporto-app"
fi

# 5. Deploy new-api via Docker 
echo "🐳 Deploying new-api via Docker (Port 3006)..."
# Start only new-api and its dependencies (redis/postgres) from docker-compose
docker compose up -d new-api redis

echo "✅ Deployment finished successfully!"
# Save PM2 process list to restore on reboot
pm2 save
