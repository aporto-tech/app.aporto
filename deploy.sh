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

# 4. Copy static files for standalone mode
echo "📂 Copying static files for standalone mode..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# 5. Start/Restart Next.js app with PM2
echo "🚀 Starting Next.js with PM2 on port 3000..."
pm2 describe "aporto-app" > /dev/null
if [ $? -eq 0 ]; then
    # Stop it first to free up the port reliably
    pm2 stop "aporto-app"
    
    # Optional fallback to clean any stray node process on port 3000 that belongs to next
    # We do NOT use lsof -t -i:3000 directly as it kills the NewAPI docker container's internal process!
    kill -9 $(lsof -i:3000 -t | xargs ps -o pid=,comm= 2>/dev/null | grep -iE 'node|next' | awk '{print $1}') 2>/dev/null || true
    
    pm2 start "aporto-app" --update-env
else
    # Fallback cleanup just in case
    kill -9 $(lsof -i:3000 -t | xargs ps -o pid=,comm= 2>/dev/null | grep -iE 'node|next' | awk '{print $1}') 2>/dev/null || true
    PORT=3000 pm2 start "npm start" --name "aporto-app"
fi


echo "✅ Deployment finished successfully!"
# Save PM2 process list to restore on reboot
pm2 save
