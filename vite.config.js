import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  // Base relativa para que los assets carguen correctamente en subdirectorios (GitHub Pages)
  base: './',
  
  plugins: [
    createHtmlPlugin({
      minify: true, // Minifica el HTML eliminando espacios, comentarios, etc.
    }),
  ],
  
  build: {
    target: 'es2022', // Asume navegadores modernos, reduciendo código basura (polyfills)
    minify: 'esbuild', // Esbuild es extremadamente rápido y eficiente
    cssMinify: true, // Asegura que el CSS resultante se comprima al máximo
    
    rollupOptions: {
      output: {
        // Separar librerías pesadas en sus propios archivos (Mejora la caché del navegador)
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          vendor: ['lru-cache', 'nouislider']
        }
      }
    }
  }
});