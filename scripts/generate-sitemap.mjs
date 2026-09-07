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

async function generateSitemap() {
  console.log("Iniciando generación de sitemap canónico desde Supabase...");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const slugs = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("movies")
      .select("slug")
      .not("slug", "is", null)
      .neq("slug", "")
      .range(from, from + PAGE_SIZE - 1)
      .order("id", { ascending: true });

    if (error) {
      console.warn(`[sitemap] Error consultando slugs (offset ${from}): ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.slug) {
        slugs.push(row.slug);
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  console.log(`[sitemap] Se recuperaron ${slugs.length} títulos indexables válidos.`);

  // 2. Directores VIP con biografía redactada (654 verificados)
  const { data: vipDirectors, error: dirError } = await supabase
    .from("directors")
    .select("slug")
    .not("biography", "is", null)
    .neq("biography", "")
    .order("name", { ascending: true });

  if (dirError) {
    console.warn(`[sitemap] Error consultando directores VIP: ${dirError.message}`);
  }
  const directorSlugs = (vipDirectors || []).map(d => d.slug).filter(Boolean);
  console.log(`[sitemap] Se recuperaron ${directorSlugs.length} directores VIP con biografía.`);

  // 3. Actores VIP con biografía redactada (362 verificados)
  const { data: vipActors, error: actError } = await supabase
    .from("actors")
    .select("slug")
    .not("biography", "is", null)
    .neq("biography", "")
    .order("name", { ascending: true });

  if (actError) {
    console.warn(`[sitemap] Error consultando actores VIP: ${actError.message}`);
  }
  const actorSlugs = (vipActors || []).map(a => a.slug).filter(Boolean);
  console.log(`[sitemap] Se recuperaron ${actorSlugs.length} actores VIP con biografía.`);

  // Ensamblar XML estándar
  const urlEntries = [
    `  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
    `  <url>
    <loc>${SITE_ORIGIN}/peliculas/</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`,
    `  <url>
    <loc>${SITE_ORIGIN}/series/</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`
  ];

  // 126 Landings Canónicas de Taxonomías Cerradas (Géneros, Estudios, Selecciones y Países activos)
  const taxonomySlugs = [
    ...Object.keys(GENRE_MAP),
    ...Object.keys(STUDIO_MAP),
    ...Object.keys(SELECTION_MAP),
    ...Object.keys(REGIONAL_GROUPS_MAP),
    ...Object.keys(ACTIVE_COUNTRIES_MAP)
  ];

  for (const taxSlug of taxonomySlugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/${taxSlug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Fichas VIP de Directores
  for (const dirSlug of directorSlugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/director/${dirSlug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Fichas VIP de Actores
  for (const actSlug of actorSlugs) {
    urlEntries.push(`  <url>
    <loc>${SITE_ORIGIN}/actor/${actSlug}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

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
  console.error("Error generando sitemap:", err);
  process.exit(1);
});
