#!/bin/bash

export PATH="/root/.nvm/versions/node/v24.14.0/bin:$PATH"

echo "Starting Deployment for Aporto..."

# 1. Fetch latest changes from GitHub
echo "Pulling latest changes from GitHub..."
cd /var/www/app.aporto.tech

if [ -f .env.local ]; then
    set -a
    . ./.env.local
    set +a
elif [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

git pull origin main || git pull origin master

# 2. Update/Install dependencies
echo "Installing npm dependencies..."
npm install

# 3. Apply any pending database migrations
echo "Applying database migrations..."
npx prisma migrate deploy

# 4. Build the Next.js application
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

# 6. Start/Restart async SkillRun poller with PM2
if [ -z "$CRON_SECRET" ]; then
    echo "ERROR: CRON_SECRET is required for aporto-skill-poller"
    exit 1
fi

export APORTO_INTERNAL_BASE_URL="${APORTO_INTERNAL_BASE_URL:-http://127.0.0.1:${PORT:-3000}}"

echo "Restarting SkillRun poller with PM2..."
if pm2 describe "aporto-skill-poller" > /dev/null 2>&1; then
    pm2 reload "aporto-skill-poller" --update-env
else
    pm2 start "npm run skill-runs:poller" --name "aporto-skill-poller"
fi

pm2 save
echo "Deployment finished successfully!"
