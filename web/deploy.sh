#!/bin/bash
# Deploy UX Walkthrough Agent on Mac Mini
# Usage: ./deploy.sh [start|stop|restart|status|logs|tunnel]

set -e
cd "$(dirname "$0")"

case "${1:-start}" in
  start)
    echo "==> Installing dependencies..."
    npm install --production

    echo "==> Installing Playwright Chromium..."
    npx playwright install chromium 2>/dev/null || true

    echo "==> Creating log directory..."
    mkdir -p logs

    echo "==> Starting with PM2..."
    pm2 start ecosystem.config.js

    echo "==> Saving PM2 process list..."
    pm2 save

    echo ""
    echo "✅ UX Walkthrough running at http://localhost:3000"
    echo ""
    echo "To expose to internet, run:"
    echo "  ./deploy.sh tunnel"
    echo ""
    echo "To auto-start on boot:"
    echo "  pm2 startup"
    ;;

  stop)
    pm2 stop ux-walkthrough
    echo "Stopped."
    ;;

  restart)
    pm2 restart ux-walkthrough
    echo "Restarted."
    ;;

  status)
    pm2 status ux-walkthrough
    ;;

  logs)
    pm2 logs ux-walkthrough --lines 50
    ;;

  tunnel)
    echo "==> Starting Cloudflare Tunnel (quick mode)..."
    echo "    Press Ctrl+C to stop"
    cloudflared tunnel --url http://localhost:3000
    ;;

  *)
    echo "Usage: ./deploy.sh [start|stop|restart|status|logs|tunnel]"
    ;;
esac
