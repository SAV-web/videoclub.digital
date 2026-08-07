import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',        // SSG puro — GitHub Pages no soporta SSR
  site: 'https://videoclub.digital',  // Dominio canónico del proyecto
  base: '/',                // Vive en la raíz del sitio
  integrations: [sitemap()],
});
