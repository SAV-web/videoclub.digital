// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
base: '/videoclub.digital/videoclub-vite/',
  server: {
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
  },
});