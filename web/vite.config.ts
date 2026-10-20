import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Published at https://zdreni.github.io/piu-rivals/, so assets live under /piu-rivals/.
export default defineConfig({
  base: '/piu-rivals/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
