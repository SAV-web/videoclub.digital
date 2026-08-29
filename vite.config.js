import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function serveSeoSitePlugin() {
  return {
    name: 'serve-seo-site-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        // Normalizar URL removiendo el prefijo /videoclub.digital/ si está presente
        const cleanUrl = req.url.replace(/^\/videoclub\.digital\//, '/');
        const reqPath = cleanUrl.split('?')[0];

        if (reqPath.startsWith('/titulo/') || reqPath.startsWith('/sitemap') || reqPath.startsWith('/_astro/') || reqPath === '/sprite.svg' || reqPath === '/flags.svg' || reqPath === '/robots.txt') {
          let filePath = path.join(__dirname, 'seo-site/dist', reqPath);
          
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            if (reqPath.endsWith('.xml')) res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            else if (reqPath.endsWith('.txt')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            else if (reqPath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
            else if (reqPath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            else if (reqPath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
            else if (reqPath.endsWith('.html') || filePath.endsWith('index.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
            
            res.end(fs.readFileSync(filePath));
            return;
          } else if (reqPath.startsWith('/titulo/')) {
            // Si una página estática no existe, redirigir a la raíz de la SPA
            res.writeHead(302, { Location: '/' });
            res.end();
            return;
          }
        }
        next();
      });
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
    const publicDir = path.resolve(__dirname, 'public');
    const srcDir = path.resolve(__dirname, 'src');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    
    ['sprite.svg', 'flags.svg'].forEach(file => {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(publicDir, file);
      if (fs.existsSync(srcPath)) {
        const content = fs.readFileSync(srcPath, 'utf-8').replace('style="display: none;"', '');
        fs.writeFileSync(destPath, content, 'utf-8');
      }
    });
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
  plugins: [inlineSvgSpritesPlugin(), syncPublicSpritesPlugin(), swVersionPlugin(), serveSeoSitePlugin()],
  // Ignorar seo-site/dist y dist en el watcher de Vite para evitar fugas de memoria con 13.488 archivos
  server: {
    watch: {
      ignored: ['**/seo-site/dist/**', '**/dist/**']
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