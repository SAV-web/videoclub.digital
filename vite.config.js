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
        if (req.url && (req.url.startsWith('/pelicula/') || req.url.startsWith('/sitemap') || req.url.startsWith('/_astro/'))) {
          const reqPath = req.url.split('?')[0];
          let filePath = path.join(__dirname, 'seo-site/dist', reqPath);
          
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            if (reqPath.endsWith('.xml')) res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            else if (reqPath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
            else if (reqPath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            else if (reqPath.endsWith('.html') || filePath.endsWith('index.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
            
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [swVersionPlugin(), serveSeoSitePlugin()],
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
          vendor: ['lru-cache']
        }
      }
    }
  }
});