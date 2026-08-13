import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',                             // SSG puro para GitHub Pages
  site: 'https://videoclub.digital',           // Dominio final personalizado
  base: '/',                                    // Servido en la raíz del dominio
  integrations: [sitemap()],
});
