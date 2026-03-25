module.exports = {
  apps: [{
    name: 'spacebot-munia',
    cwd: '/var/www/spacebot-munia',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3002',
    env: {
      NODE_ENV: 'production',
      PORT: '3002',
      NODE_OPTIONS: '--max-old-space-size=768',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    max_memory_restart: '800M',
    restart_delay: 10000,
    max_restarts: 20,
  }]
};
