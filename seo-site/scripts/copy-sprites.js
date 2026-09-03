import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyCleanSprites } from '../../scripts/sync-sprites.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, '../../src');
const publicDir = path.resolve(__dirname, '../public');

copyCleanSprites(srcDir, publicDir);
console.log('✓ Sprites SVG (sprite.svg y flags.svg) generados y limpios en seo-site/public/');

