#!/usr/bin/env node

/**
 * =================================================================
 *   GENERADOR DE SITEMAP CANÓNICO (scripts/generate-sitemap.mjs)
 * =================================================================
 * Consulta únicamente la columna `slug` de todas las películas activas
 * en Supabase y genera `public/sitemap.xml` en ~1 segundo, garantizando
 * que todos los títulos indexables queden registrados para los motores
 * de búsqueda sin necesidad de compilar miles de HTMLs estáticos.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  GENRE_MAP,
  STUDIO_MAP,
  SELECTION_MAP,
  REGIONAL_GROUPS_MAP,
  ACTIVE_COUNTRIES_MAP
} from "../cloudflare/seo/taxonomy-types.js";

// Cargar .env si existe en entorno local
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
const publicDir = path.resolve(projectRoot, "public");
const distDir = path.resolve(projectRoot, "dist");

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://wibygecgfczcvaqewleq.supabase.co";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";

const SITE_ORIGIN = "https://videoclub.digital";
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
        throw new Error(`[sitemap] Falló ${description} tras ${maxRetries} intentos: ${err.message || err}`);
      }
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500);
      console.warn(`[WARN] ${description} falló (${err.message || err}). Reintentando en ${delay}ms (intento ${attempt + 1}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function generateSitemap() {
  console.log("Iniciando generación de sitemap canónico desde Supabase...");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const slugs = [];
  let from = 0;

  while (true) {
    const { data } = await queryWithRetry(
      () =>
        supabase
          .from("movies")
          .select("slug")
          .not("slug", "is", null)
          .neq("slug", "")
          .range(from, from + PAGE_SIZE - 1)
          .order("id", { ascending: true }),
      `consulta slugs de películas (offset ${from})`
    );

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.slug) {
        slugs.push(row.slug);
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (slugs.length === 0) {
    throw new Error("[sitemap] No se recuperó ninguna película indexable de Supabase. Abortando generación de sitemap.");
  }

  console.log(`[sitemap] Se recuperaron ${slugs.length} títulos indexables válidos.`);

  // 2. Personas VIP (vip = 1 como única condición, sin condición de biografía)
  const vipSlugs = [];
  let pFrom = 0;

  while (true) {
    const { data: pData } = await queryWithRetry(
      () =>
        supabase
          .from("people")
          .select("slug")
          .eq("vip", 1)
          .not("slug", "is", null)
          .neq("slug", "")
          .range(pFrom, pFrom + PAGE_SIZE - 1)
          .order("slug", { ascending: true }),
      `consulta personas VIP (offset ${pFrom})`
    );

    if (!pData || pData.length === 0) break;

    for (const row of pData) {
      if (row.slug && !vipSlugs.includes(row.slug)) {
        vipSlugs.push(row.slug);
      }
    }

    if (pData.length < PAGE_SIZE) break;
    pFrom += PAGE_SIZE;
  }

  if (vipSlugs.length === 0) {
    throw new Error("[sitemap] No se recuperó ninguna persona VIP indexable de Supabase. Abortando generación de sitemap.");
  }

  console.log(`[sitemap] Se recuperaron ${vipSlugs.length} personas VIP indexables.`);

  // Ensamblar XML estándar
  const urlEntries = [
    `  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`
  ];

  // Landings Canónicas de Taxonomías Cerradas prefijadas (/genero/, /estudio/, /seleccion/, /pais/)
  for (const slug of Object.keys(GENRE_MAP)) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/genero/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  for (const slug of Object.keys(STUDIO_MAP)) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/estudio/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  for (const slug of Object.keys(SELECTION_MAP)) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/seleccion/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  const countrySlugs = new Set([
    ...Object.keys(REGIONAL_GROUPS_MAP),
    ...Object.keys(ACTIVE_COUNTRIES_MAP)
  ]);
  for (const slug of countrySlugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/pais/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Fichas de Personas VIP en la raíz canónica (/:slug/)
  for (const slug of vipSlugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Fichas de Películas en el espacio exclusivo /titulo/
  for (const slug of slugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/titulo/${slug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join("\n")}
</urlset>
`;

  const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_ORIGIN}/sitemap.xml</loc>
  </sitemap>
</sitemapindex>
`;

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const publicSitemapPath = path.join(publicDir, "sitemap.xml");
  fs.writeFileSync(publicSitemapPath, sitemapXml, "utf8");
  const publicSitemapIndexPath = path.join(publicDir, "sitemap-index.xml");
  fs.writeFileSync(publicSitemapIndexPath, sitemapIndexXml, "utf8");
  console.log(`✓ Sitemap generado con éxito en: ${publicSitemapPath} (${urlEntries.length} URLs totales)`);
  console.log(`✓ Sitemap Index generado con éxito en: ${publicSitemapIndexPath}`);

  if (fs.existsSync(distDir)) {
    const distSitemapPath = path.join(distDir, "sitemap.xml");
    fs.writeFileSync(distSitemapPath, sitemapXml, "utf8");
    const distSitemapIndexPath = path.join(distDir, "sitemap-index.xml");
    fs.writeFileSync(distSitemapIndexPath, sitemapIndexXml, "utf8");
    console.log(`✓ Sitemap sincronizado en dist/`);
  }
}

generateSitemap().catch((err) => {
  console.error("Error generando sitemap:", err.message || err);
  const publicSitemapPath = path.join(publicDir, "sitemap.xml");
  if (fs.existsSync(publicSitemapPath) && fs.statSync(publicSitemapPath).size > 1000) {
    console.warn(`\n⚠️  [SITEMAP FALLBACK] No se pudo regenerar el sitemap desde Supabase tras reintentos.`);
    console.warn(`⚠️  Conservando sitemaps preexistentes en public/ (${Math.round(fs.statSync(publicSitemapPath).size / 1024)} KB).`);
    console.warn(`⚠️  El build continuará con el sitemap previo sin abortar el despliegue de producción.\n`);
    if (fs.existsSync(distDir)) {
      const distSitemapPath = path.join(distDir, "sitemap.xml");
      fs.copyFileSync(publicSitemapPath, distSitemapPath);
      const publicSitemapIndexPath = path.join(publicDir, "sitemap-index.xml");
      if (fs.existsSync(publicSitemapIndexPath)) {
        fs.copyFileSync(publicSitemapIndexPath, path.join(distDir, "sitemap-index.xml"));
      }
    }
    process.exit(0);
  }
  process.exit(1);
});
