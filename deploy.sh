#!/bin/bash

export PATH="/root/.nvm/versions/node/v24.14.0/bin:$PATH"

echo "Starting Deployment for Aporto..."

# 1. Fetch latest changes from GitHub
echo "Pulling latest changes from GitHub..."
cd /var/www/app.aporto.tech
git pull origin main || git pull origin master

# 2. Update/Install dependencies
echo "Installing npm dependencies..."
npm install

# 3. Build the Next.js application
echo "Building Next.js app..."
npm run build

# 4. Copy static files for standalone mode
echo "Copying static files for standalone mode..."
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

# 5. Start/Restart Next.js app with PM2
echo "Restarting with PM2..."
if pm2 describe "aporto-app" > /dev/null 2>&1; then
    pm2 reload "aporto-app" --update-env
else
    PORT=3000 pm2 start "npm start" --name "aporto-app"
fi

pm2 save
echo "Deployment finished successfully!"
