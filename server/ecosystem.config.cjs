// pm2 apps: `pm2 start ecosystem.config.cjs` from the server folder.
// Both run as single processes in fork mode: `node --import tsx <script>`.
module.exports = {
  apps: [
    {
      name: 'piu-rivals-api',
      script: 'src/server.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      exec_mode: 'fork',
      cwd: __dirname,
      autorestart: true,
    },
    {
      name: 'piu-rivals-worker',
      script: 'src/worker.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      exec_mode: 'fork',
      cwd: __dirname,
      // One scrape run at a time; a restart marks the run in progress as interrupted.
      autorestart: true,
      max_memory_restart: '1500M',
    },
  ],
};
