import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPRITE_FILES = ['sprite.svg', 'flags.svg'];

/**
 * Copia y limpia los sprites SVG eliminando 'style="display: none;"',
 * comentarios XML y líneas vacías para optimizar su consumo como assets externos.
 * @param {string} srcDir - Directorio fuente canónico (habitualmente /src)
 * @param {string} destDir - Directorio público de destino
 */
export function copyCleanSprites(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  SPRITE_FILES.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);

    if (!fs.existsSync(srcPath)) {
      throw new Error(`[sync-sprites] Error crítico: El archivo canónico "${srcPath}" no existe.`);
    }

    const content = fs.readFileSync(srcPath, 'utf-8')
      .replace('style="display: none;"', '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*[\r\n]/gm, '')
      .trim();
    fs.writeFileSync(destPath, content, 'utf-8');
  });
}

// Soporte para ejecución directa desde CLI (ej. node scripts/sync-sprites.mjs)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  copyCleanSprites(path.join(rootDir, 'src'), path.join(rootDir, 'public'));
  console.log('✓ Sprites sincronizados y limpiados en public/');
}

