module.exports = {
  apps: [{
    name: 'ux-walkthrough',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    // Watch for file changes (via Syncthing)
    watch: false,
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    // Memory limit restart
    max_memory_restart: '1G',
  }],
};
