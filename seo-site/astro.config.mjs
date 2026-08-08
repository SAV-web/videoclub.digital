import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',                             // SSG puro para GitHub Pages
  site: 'https://sav-web.github.io',           // Dominio activo en GitHub Pages
  base: '/videoclub.digital/',                 // Subruta del repositorio en GitHub Pages
  integrations: [sitemap()],
});
