import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.resolve(__dirname, '../public');
const srcDir = path.resolve(__dirname, '../../src');

fs.mkdirSync(publicDir, { recursive: true });

const copyCleanSvg = (filename) => {
  const srcPath = path.join(srcDir, filename);
  const destPath = path.join(publicDir, filename);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`[copy-sprites] Error crítico: El archivo de origen canónico "${srcPath}" no existe. Abortando build.`);
  }

  let content = fs.readFileSync(srcPath, 'utf-8');
  // Eliminar style="display: none;" para que las referencias externas <use href="..."> sean visibles en navegadores
  content = content.replace('style="display: none;"', '');
  fs.writeFileSync(destPath, content, 'utf-8');
};

copyCleanSvg('sprite.svg');
copyCleanSvg('flags.svg');
console.log('✓ Sprites SVG (sprite.svg y flags.svg) generados y limpios en public/');

