module.exports = {
  apps: [{
    name: 'oppie',
    script: 'npm',
    args: 'start',
    cwd: '/Users/anverdie/Documents/Oppie5',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
