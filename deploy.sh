#!/bin/bash

echo "🚀 Starting Deployment for Aporto..."

# 1. Fetch latest changes from GitHub
echo "🔄 Pulling latest changes from GitHub..."
git pull origin main || git pull origin master

# 2. Update/Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 3. Build the Next.js application
echo "🏗️ Building Next.js app..."
npm run build

# 4. Free up port 3000
echo "🧹 Checking port 3000..."
PID=$(lsof -t -i:3000)
if [ -n "$PID" ]; then
  echo "⚠️ Port 3000 is blocked by process $PID. Killing process..."
  kill -9 $PID
  echo "✅ Port 3000 freed."
else
  echo "✅ Port 3000 is clear."
fi

# 5. Copy static files for standalone mode
echo "📂 Copying static files for standalone mode..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# 6. Start/Restart Next.js app with PM2
echo "🚀 Starting Next.js with PM2 on port 3000..."
pm2 describe "aporto-app" > /dev/null
if [ $? -eq 0 ]; then
    pm2 reload "aporto-app" --update-env
else
    PORT=3000 pm2 start "npm start" --name "aporto-app"
fi


echo "✅ Deployment finished successfully!"
# Save PM2 process list to restore on reboot
pm2 save
