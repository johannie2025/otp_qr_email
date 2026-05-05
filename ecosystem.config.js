// ============================================================
// PM2 Ecosystem — VERIF Platform Node.js Services
// Usage: pm2 start ecosystem.config.js --env production
// ============================================================

// Service unifié — QR + Email sur un seul process
module.exports = {
  apps: [
    {
      name: 'verif-node',
      script: './node_services/server.js',
      instances: 1,           // 1 suffit pour MVP; passer à 'max' si besoin
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        NODE_PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        NODE_PORT: 3001,
      },
      error_file:      './logs/node-err.log',
      out_file:        './logs/node-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
