import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyCleanSprites } from './scripts/sync-sprites.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function swVersionPlugin() {
  return {
    name: 'sw-version-plugin',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (fs.existsSync(swPath)) {
        let content = fs.readFileSync(swPath, 'utf-8');
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12);
        const versionString = `v${timestamp}`;
        content = content.replace(/const VERSION = ".*?";/, `const VERSION = "${versionString}";`);
        fs.writeFileSync(swPath, content, 'utf-8');
        console.log(`\x1b[32m✓\x1b[0m Service Worker version injected: \x1b[36m${versionString}\x1b[0m in dist/sw.js`);
      }
    }
  };
}

function inlineSvgSpritesPlugin() {
  return {
    name: 'inline-svg-sprites-plugin',
    transformIndexHtml(html) {
      const srcDir = path.resolve(__dirname, 'src');
      const spritePath = path.join(srcDir, 'sprite.svg');
      const flagsPath = path.join(srcDir, 'flags.svg');
      
      let spriteSymbols = '';
      let flagsSymbols = '';

      if (fs.existsSync(spritePath)) {
        spriteSymbols = fs.readFileSync(spritePath, 'utf-8')
          .replace(/<\?xml[^>]*\?>/gi, '')
          .replace(/<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '')
          .trim();
      }

      if (fs.existsSync(flagsPath)) {
        flagsSymbols = fs.readFileSync(flagsPath, 'utf-8')
          .replace(/<\?xml[^>]*\?>/gi, '')
          .replace(/<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '')
          .trim();
      }

      const inlinedSvg = `\n  <svg xmlns="http://www.w3.org/2000/svg" style="display: none;" aria-hidden="true">\n${spriteSymbols}\n${flagsSymbols}\n  </svg>\n`;

      return html.replace('<body>', `<body>${inlinedSvg}`);
    }
  };
}

function syncPublicSpritesPlugin() {
  const sync = () => {
    copyCleanSprites(path.resolve(__dirname, 'src'), path.resolve(__dirname, 'public'));
  };

  return {
    name: 'sync-public-sprites-plugin',
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    }
  };
}

export default defineConfig({
  plugins: [inlineSvgSpritesPlugin(), syncPublicSpritesPlugin(), swVersionPlugin()],
  // Ignorar dist en el watcher de Vite para evitar fugas de memoria
  server: {
    proxy: {
      '/posters': {
        target: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public',
        changeOrigin: true,
      },
      '/vips': {
        target: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/dist/**']
    }
  },
  // Base relativa para que los assets carguen correctamente en subdirectorios (GitHub Pages)
  base: './',
  
  build: {
    target: 'es2022', // Asume navegadores modernos, reduciendo código basura (polyfills)
    minify: 'esbuild', // Esbuild es extremadamente rápido y eficiente
    cssMinify: true, // Asegura que el CSS resultante se comprima al máximo
    
    rollupOptions: {
      output: {
        // Separar librerías pesadas en sus propios archivos (Mejora la caché del navegador)
        manualChunks: {
          vendor: ['lru-cache', '@supabase/supabase-js']
        }
      }
    }
  }
});