// pm2 apps: `pm2 start ecosystem.config.cjs` from the server folder.
module.exports = {
  apps: [
    {
      name: 'piurivals-worker',
      script: 'src/worker.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: __dirname,
      // One scrape run at a time; a restart marks the run in progress as interrupted.
      instances: 1,
      autorestart: true,
      max_memory_restart: '1500M',
    },
  ],
};
