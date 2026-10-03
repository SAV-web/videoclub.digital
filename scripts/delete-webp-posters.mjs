#!/usr/bin/env node

/**
 * =================================================================
 *   UTILIDAD: LIMPIEZA DE PÓSTERS WEBP EN SUPABASE STORAGE
 *   (scripts/delete-webp-posters.mjs)
 * =================================================================
 * 
 * Lista y elimina de forma controlada por lotes (batching) todas
 * las imágenes en formato .webp (o .wepm) del bucket 'posters'.
 * 
 * MEDIDAS DE SEGURIDAD:
 * - Modo Dry-Run por defecto: Por defecto SOLO lista y cuenta los archivos
 *   sin borrar absolutamente nada.
 * - Confirmación explícita: Para ejecutar el borrado real, se debe
 *   pasar el flag '--confirm'.
 * - Protección de otros formatos: Ignora cualquier archivo que no
 *   termine en .webp o .wepm (preserva intactos los nuevos .avif).
 * 
 * Uso:
 *   node scripts/delete-webp-posters.mjs            # Modo simulación (dry-run)
 *   node scripts/delete-webp-posters.mjs --confirm  # Ejecutar borrado real
 */

import { createClient } from "@supabase/supabase-js";

// Cargar variables de entorno de .env
try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  }
} catch (_) {}

const isConfirm = process.argv.includes("--confirm") || process.argv.includes("--force");

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  console.error("❌ Error: Falta SUPABASE_URL o VITE_SUPABASE_URL en el entorno o archivo .env");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("❌ Error: Se requiere SUPABASE_SERVICE_ROLE_KEY para realizar operaciones de borrado en Supabase Storage.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BUCKET_NAME = "posters";
const PAGE_SIZE = 100; // Máximo permitido por la API de listado de Supabase Storage
const BATCH_DELETE_SIZE = 100; // Tamaño de lote para llamadas .remove()

async function main() {
  console.log("\n=======================================================");
  console.log("   LIMPIEZA DE IMÁGENES WEBP EN SUPABASE STORAGE");
  console.log("=======================================================");
  console.log(`Bucket objetivo : ${BUCKET_NAME}`);
  console.log(`Modo de ejecución: ${isConfirm ? "🚨 BORRADO REAL (--confirm activo)" : "🛡️  SIMULACIÓN (Dry-run por defecto)"}`);
  console.log("-------------------------------------------------------\n");

  console.log("🔍 Escaneando archivos en el bucket...");

  let offset = 0;
  let totalScanned = 0;
  const webpFiles = [];

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list("", {
        limit: PAGE_SIZE,
        offset: offset,
        sortBy: { column: "name", order: "asc" }
      });

    if (error) {
      console.error(`\n❌ Error al listar archivos en offset ${offset}:`, error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      break;
    }

    totalScanned += data.length;

    for (const file of data) {
      // Filtrar extensiones .webp o .wepm (ignora carpetas y otros formatos como .avif)
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".webp") || lowerName.endsWith(".wepm")) {
        webpFiles.push(file.name);
      }
    }

    process.stdout.write(`\r📦 Objetos escaneados: ${totalScanned} | WEBP detectados: ${webpFiles.length}`);

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  console.log("\n\n📊 RESUMEN DE ESCANEO:");
  console.log(`- Total objetos analizados en bucket: ${totalScanned}`);
  console.log(`- Archivos .webp / .wepm encontrados: ${webpFiles.length}`);

  if (webpFiles.length === 0) {
    console.log("\n✨ No se encontraron archivos .webp o .wepm que eliminar.");
    return;
  }

  // Muestra de archivos detectados
  console.log("\n📋 Muestra de archivos a eliminar (primeros 5):");
  webpFiles.slice(0, 5).forEach((name, i) => console.log(`   ${i + 1}. ${name}`));

  if (!isConfirm) {
    console.log("\n-------------------------------------------------------");
    console.log("🛡️  MODO DRY-RUN COMPLETADO: No se ha borrado ningún archivo.");
    console.log("👉 Para ejecutar el borrado real de estos archivos, ejecuta:");
    console.log("   node scripts/delete-webp-posters.mjs --confirm");
    console.log("-------------------------------------------------------\n");
    return;
  }

  // --- BORRADO REAL POR LOTES ---
  console.log("\n🚨 INICIANDO BORRADO REAL POR LOTES...");

  let deletedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < webpFiles.length; i += BATCH_DELETE_SIZE) {
    const batch = webpFiles.slice(i, i + BATCH_DELETE_SIZE);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(batch);

    if (error) {
      console.error(`\n❌ Error borrando lote ${Math.floor(i / BATCH_DELETE_SIZE) + 1}:`, error.message);
      failedCount += batch.length;
    } else {
      deletedCount += batch.length;
    }

    process.stdout.write(`\r🗑️  Progreso de borrado: ${deletedCount + failedCount} / ${webpFiles.length}`);
  }

  console.log("\n\n🏁 PROCESO FINALIZADO:");
  console.log(`- Archivos eliminados con éxito: ${deletedCount}`);
  if (failedCount > 0) {
    console.log(`- Archivos con error: ${failedCount}`);
  }
  console.log("-------------------------------------------------------\n");
}

main().catch((err) => {
  console.error("\n❌ Excepción inesperada durante la ejecución:", err);
  process.exit(1);
});
