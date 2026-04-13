import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// SCRIPT ETL: SUBIDA MASIVA DE FOTOS VIP A SUPABASE STORAGE
// Ejecución: node --env-file=.env scripts/upload_vips.js
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Usar SERVICE_ROLE para poder subir archivos

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan variables de entorno (VITE_SUPABASE_URL o SUPABASE_SERVICE_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Carpeta donde tienes las imágenes locales (Crea esta carpeta y mete las fotos)
const IMAGES_DIR = path.join(process.cwd(), 'vips_images');
const BUCKET_NAME = 'vips';

function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function uploadImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ La carpeta local "${IMAGES_DIR}" no existe.`);
    console.error(`👉 Por favor, créala en la raíz del proyecto y mete las fotos ahí.`);
    return;
  }

  const files = fs.readdirSync(IMAGES_DIR);
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  console.log(`Encontradas ${imageFiles.length} imágenes en la carpeta. Comenzando subida al bucket '${BUCKET_NAME}'...`);

  let count = 0;
  for (const fileName of imageFiles) {
    count++;
    const filePath = path.join(IMAGES_DIR, fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const contentType = getContentType(fileName);

    const { error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, fileBuffer, {
      contentType,
      upsert: true // Si ya existe, lo sobrescribe en lugar de dar error
    });

    if (error) console.error(`[${count}/${imageFiles.length}] ❌ Error al subir ${fileName}:`, error.message);
    else console.log(`[${count}/${imageFiles.length}] ✅ Subido: ${fileName}`);
  }
  console.log("\n¡Proceso de subida finalizado con éxito!");
}

uploadImages();