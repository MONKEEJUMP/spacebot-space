module.exports = {
  apps: [
    {
      name: 'spacebot',
      cwd: '/var/www/spacebot',
      script: '.next/standalone/server.js',
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
    },
    {
      name: 'newsspace-editor',
      script: '/var/www/spacebot/newsspace-editor/index.js',
      cwd: '/var/www/spacebot/newsspace-editor',
      instances: 1,
      autorestart: true,
      max_memory_restart: '128M'
    }
  ]
};
