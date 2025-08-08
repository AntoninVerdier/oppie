#!/bin/bash

echo "🚀 Deploying Oppie to oppie.ovh..."

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Build the application
echo "🔨 Building application..."
npm run build

# Start with PM2
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

echo "✅ Deployment complete!"
echo "🌐 Your app should be running at: http://oppie.ovh"
echo ""
echo "📋 Next steps:"
echo "1. Point your domain oppie.ovh to your computer's IP"
echo "2. Install nginx and use the nginx.conf file"
echo "3. Or use a service like Cloudflare Tunnel for easier setup"
echo ""
echo "🔧 Useful commands:"
echo "- View logs: pm2 logs oppie"
echo "- Restart: pm2 restart oppie"
echo "- Stop: pm2 stop oppie"
echo "- Status: pm2 status"
