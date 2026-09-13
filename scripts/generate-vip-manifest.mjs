#!/usr/bin/env node

/**
 * =================================================================
 *   GENERADOR DEL MANIFIESTO VIP (scripts/generate-vip-manifest.mjs)
 * =================================================================
 * Consulta exclusivamente a Supabase todas las personas con 'vip = 1'
 * y genera el artefacto en memoria 'cloudflare/seo/vip-manifest.js',
 * permitiendo al Cloudflare Worker descartar slugs en O(1) sin
 * realizar ninguna consulta de red hacia la base de datos.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Cargar variables de entorno si existe .env local
try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  }
} catch {
  // Ignorar si no existe
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");
const targetFile = path.resolve(projectRoot, "cloudflare/seo/vip-manifest.js");

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://wibygecgfczcvaqewleq.supabase.co";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";

// Patrón canónico estricto de slug URL-safe:
// Alfanumérico minúscula ASCII separado por guiones simples, sin guiones en extremos ni duplicados
const VALID_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PAGE_SIZE = 1000;

async function queryWithRetry(queryFn, description, maxRetries = 4, baseDelayMs = 1500) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await queryFn();
      if (result.error) {
        throw result.error;
      }
      return result;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`[vip-manifest] Falló ${description} tras ${maxRetries} intentos: ${err.message || err}`);
      }
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500);
      console.warn(`[WARN] ${description} falló (${err.message || err}). Reintentando en ${delay}ms (intento ${attempt + 1}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function generateVipManifest() {
  console.log("Iniciando generación de manifiesto de personas VIP (vip = 1)...");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const slugs = new Set();
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await queryWithRetry(
      () =>
        supabase
          .from("people")
          .select("slug")
          .eq("vip", 1)
          .not("slug", "is", null)
          .range(from, to),
      `consulta personas VIP en rango [${from}-${to}]`
    );

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      if (row.slug && typeof row.slug === "string") {
        const normalized = row.slug.trim().toLowerCase();
        if (VALID_SLUG_REGEX.test(normalized)) {
          slugs.add(normalized);
        } else {
          console.warn(`[WARN] Slug VIP descartado por formato no canónico: "${row.slug}" (normalizado: "${normalized}")`);
        }
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const sortedSlugs = Array.from(slugs).sort();
  console.log(`Se recuperaron ${sortedSlugs.length} slugs de personas VIP válidas.`);

  const fileContent = `// =================================================================
//        MANIFIESTO DERIVADO DE PERSONAS VIP (ÍNDICE EN MEMORIA)
//                (cloudflare/seo/vip-manifest.js)
// =================================================================
// Generado automáticamente mediante: node scripts/generate-vip-manifest.mjs
// Fecha de generación: ${new Date().toISOString()}
// Total entidades VIP: ${sortedSlugs.length}
//
// PRINCIPIO ARQUITECTÓNICO (FILOSOFÍA "VIP = FUENTE EDITORIAL"):
// 1. VIP_SLUGS es exclusivamente un índice de pertenencia en memoria para
//    descarte en O(1). Su único propósito es decidir si el Cloudflare Worker
//    debe intentar resolver una ruta raíz como ficha SEO VIP.
// 2. NUNCA incrustar datos editoriales (biografías, filmografía, metadatos)
//    en este manifiesto para evitar inflar el bundle y desincronizar la BD.
// 3. Supabase (public.people con vip = 1) es la Fuente Única de Verdad (SSOT)
//    editorial: cuando VIP_SLUGS.has(slug) es true, el Worker consulta a Supabase
//    para obtener los datos editoriales frescos y renderizar el Edge SSR.
// =================================================================

export const VIP_SLUGS = new Set([
${sortedSlugs.map(slug => `  ${JSON.stringify(slug)},`).join("\n")}
]);
`;

  fs.writeFileSync(targetFile, fileContent, "utf-8");
  console.log(`Manifiesto generado exitosamente en: ${targetFile}`);
}

generateVipManifest().catch((err) => {
  console.error("Error inesperado generando manifiesto VIP:", err.message || err);
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 500) {
    console.warn(`\n⚠️  [VIP MANIFEST FALLBACK] No se pudo regenerar el manifiesto VIP desde Supabase tras reintentos.`);
    console.warn(`⚠️  Conservando manifiesto existente en ${targetFile}.`);
    console.warn(`⚠️  El build continuará sin abortar el despliegue de producción.\n`);
    process.exit(0);
  }
  process.exit(1);
});
