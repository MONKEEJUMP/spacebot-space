module.exports = {
  apps: [{
    name: 'spacebot',
    cwd: '/var/www/spacebot',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3003',
    max_memory_restart: '1500M',
    restart_delay: 10000,
    max_restarts: 100,
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    exp_backoff_restart_delay: 100,
    env: {
      NODE_ENV: 'production',
      PORT: '3003',
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }]
};
