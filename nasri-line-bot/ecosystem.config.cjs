module.exports = {
  apps: [
    {
      name: 'nasri-line-bot',
      script: 'src/server.ts',
      interpreter: 'bun',
      cwd: __dirname,
      env: {
        PORT: '3500',
        NODE_ENV: 'production',
        ORACLE_REPO_ROOT: process.env.ORACLE_REPO_ROOT || '/home/enervia/nasri-oracle',
      },
      // Load .env file
      env_file: '.env',
      max_memory_restart: '256M',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
