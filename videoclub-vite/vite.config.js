// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
base: '/videoclub.digital/',
  server: {
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
  },
});