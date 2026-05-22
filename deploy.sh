#!/bin/bash

export PATH="/root/.nvm/versions/node/v24.14.0/bin:$PATH"

echo "Starting Deployment for Aporto..."

# 1. Fetch latest changes from GitHub
echo "Pulling latest changes from GitHub..."
cd /var/www/app.aporto.tech

load_env_file() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return 1
    fi

    echo "Loading runtime environment from $file..."
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
}

if [ -f .env.local ]; then
    load_env_file .env.local
elif [ -f .env ]; then
    load_env_file .env
else
    echo "WARNING: .env.local and .env were not found"
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

echo "Runtime env status:"
for key in TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET NEWAPI_ADMIN_KEY NEXT_PUBLIC_APP_URL DATABASE_URL CRON_SECRET; do
    if [ -n "${!key:-}" ]; then
        echo "  $key=set"
    else
        echo "  $key=missing"
    fi
done

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
    pm2 start "npm start" --name "aporto-app"
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
