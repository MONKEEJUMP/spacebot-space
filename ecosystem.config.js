module.exports = {
  apps: [{
    name: 'spacebot',
    cwd: '/var/www/spacebot',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3003',
    max_memory_restart: '1500M',
    restart_delay: 10000,
    max_restarts: 20,
    env: {
      NODE_ENV: 'production',
      PORT: '3003',
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }]
};
