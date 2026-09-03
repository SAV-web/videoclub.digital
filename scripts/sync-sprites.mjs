import fs from 'node:fs';
import path from 'node:path';

export const SPRITE_FILES = ['sprite.svg', 'flags.svg'];

/**
 * Copia y limpia los sprites SVG eliminando 'style="display: none;"'
 * para habilitar su consumo como assets externos mediante <use href="...">.
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

    const content = fs.readFileSync(srcPath, 'utf-8').replace('style="display: none;"', '');
    fs.writeFileSync(destPath, content, 'utf-8');
  });
}
