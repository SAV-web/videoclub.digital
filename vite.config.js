// vite.config.js
import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  base: '/videoclub.digital/', // O la base que estés usando
  plugins: [
    createHtmlPlugin({
      minify: {
        // Le decimos al plugin de HTML que elimine los comentarios
        removeComments: true,
        // (Opcional pero recomendado) También elimina espacios en blanco
        collapseWhitespace: true, 
      },
    }),
  ],
});