#!/usr/bin/env node

/**
 * =================================================================
 *   SERVIDOR DE PREVIEW SEO LOCAL (scripts/preview-seo.mjs)
 * =================================================================
 * Permite previsualizar en http://localhost:4446/ exactamente lo que
 * el Edge Worker de Cloudflare renderiza en producción:
 * - Taxonomías de 1 segmento: /sci-fi/, /espana/, /warner/, /criterion/
 * - Personalidades VIP: /director/christopher-nolan/, /actor/al-pacino/
 * - Fichas individuales: /titulo/matrix-1999/
 * =================================================================
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTaxonomy } from "../cloudflare/seo/taxonomy-types.js";
import { renderTaxonomyHtml } from "../cloudflare/seo/render-taxonomy.js";
import { renderPersonHtml } from "../cloudflare/seo/render-person.js";
import { renderMovieHtml } from "../cloudflare/seo/render-movie.js";
import { SEO_CARD_CSS } from "../cloudflare/seo/seo-card-css.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");
const publicDir = path.resolve(projectRoot, "public");

const PORT = process.env.PORT || 4446;
const supabaseUrl = process.env.SUPABASE_URL || "https://wibygecgfczcvaqewleq.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";
const storageUrl = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";

const MOVIE_PROJECTION = "id,slug,title,original_title,year,year_end,runtime,type,country,genres,directors,actors,synopsis,fa_id,fa_rating,fa_votes,imdb_id,imdb_rating,imdb_votes,avg_rating,justwatch,wikipedia,studios,selection";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // 1. Servir Hoja de Estilos del Edge (en memoria o desde public/)
  if (pathname.startsWith("/seo-card") && pathname.endsWith(".css")) {
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(SEO_CARD_CSS);
    return;
  }

  // 2. Servir Archivos Estáticos de public/ (sprite.svg, flags.svg, etc.)
  const localFilePath = path.join(publicDir, pathname.replace(/^\//, ""));
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
    const ext = path.extname(localFilePath).toLowerCase();
    const mimeTypes = {
      ".svg": "image/svg+xml",
      ".css": "text/css",
      ".js": "text/javascript",
      ".png": "image/png",
      ".webp": "image/webp",
      ".jpg": "image/jpeg",
      ".xml": "application/xml",
      ".txt": "text/plain; charset=utf-8"
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(localFilePath).pipe(res);
    return;
  }

  // 3. Proxy de Imágenes de Storage (/posters/* y /vips/*)
  if (pathname.startsWith("/posters/") || pathname.startsWith("/vips/")) {
    const targetUrl = `${storageUrl}${pathname}`;
    try {
      const imgRes = await fetch(targetUrl);
      if (imgRes.ok) {
        res.writeHead(200, { "Content-Type": imgRes.headers.get("Content-Type") || "image/webp" });
        const buf = Buffer.from(await imgRes.arrayBuffer());
        res.end(buf);
        return;
      }
    } catch {}
  }

  // 4. Página Principal del Servidor de Preview (Menú de Demostración y Enlaces Rápidos)
  if (pathname === "/" || pathname === "") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="es" class="dark-mode">
<head>
  <meta charset="utf-8">
  <title>Preview Local de Páginas SEO — Videoclub Digital</title>
  <link rel="stylesheet" href="/seo-card-v6.css">
  <style>
    body { font-family: var(--font-body); background: var(--color-bg); color: var(--color-text-primary); margin: 0; padding: 40px 20px; }
    .box { max-width: 800px; margin: 0 auto; background: var(--color-surface-1); padding: 32px; border-radius: 12px; border: 1px solid var(--color-border); }
    h1 { font-size: 1.5rem; margin-top: 0; color: var(--color-text-primary); }
    p { color: var(--color-text-secondary); line-height: 1.6; }
    .links-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 24px; }
    .link-item { display: flex; flex-direction: column; padding: 14px 18px; background: var(--color-surface-2); border-radius: 8px; border: 1px solid var(--color-border); text-decoration: none; color: var(--color-text-primary); transition: all 0.2s; }
    .link-item:hover { border-color: var(--color-accent); transform: translateY(-2px); }
    .link-item strong { font-size: 1rem; margin-bottom: 4px; }
    .link-item span { font-size: 0.8rem; color: var(--color-text-tertiary); }
    .badge { display: inline-block; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; border-radius: 4px; background: var(--color-accent); color: #fff; width: fit-content; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🎬 Servidor de Previsualización SEO Local (Puerto ${PORT})</h1>
    <p>Este servidor local ejecuta <strong>exactamente los mismos renderizadores del Cloudflare Edge Worker</strong>, consultando Supabase en tiempo real y aplicando la hoja de estilos <code>/seo-card-v6.css</code> con los fixes de botones <code>+</code> y estrellas grises.</p>
    
    <div class="links-grid">
      <a href="/sci-fi/" class="link-item">
        <span class="badge">GÉNERO (Taxonomía)</span>
        <strong>/sci-fi/</strong>
        <span>Películas y Series de Ciencia Ficción (Matrix, etc.)</span>
      </a>
      <a href="/drama/" class="link-item">
        <span class="badge">GÉNERO (Taxonomía)</span>
        <strong>/drama/</strong>
        <span>Películas y Series Dramáticas</span>
      </a>
      <a href="/espana/" class="link-item">
        <span class="badge">PAÍS (Taxonomía)</span>
        <strong>/espana/</strong>
        <span>Cine Español en streaming</span>
      </a>
      <a href="/warner/" class="link-item">
        <span class="badge">ESTUDIO (Taxonomía)</span>
        <strong>/warner/</strong>
        <span>Producciones Warner Bros.</span>
      </a>
      <a href="/criterion/" class="link-item">
        <span class="badge">SELECCIÓN (Taxonomía)</span>
        <strong>/criterion/</strong>
        <span>The Criterion Collection</span>
      </a>
      <a href="/director/christopher-nolan/" class="link-item">
        <span class="badge">DIRECTOR (VIP)</span>
        <strong>/director/christopher-nolan/</strong>
        <span>Biografía y filmografía completa</span>
      </a>
      <a href="/actor/al-pacino/" class="link-item">
        <span class="badge">ACTOR (VIP)</span>
        <strong>/actor/al-pacino/</strong>
        <span>Biografía y filmografía de Al Pacino</span>
      </a>
      <a href="/titulo/matrix-1999/" class="link-item">
        <span class="badge">FICHA (Título)</span>
        <strong>/titulo/matrix-1999/</strong>
        <span>Ficha de película con trasera interactiva</span>
      </a>
    </div>
  </div>
</body>
</html>`);
    return;
  }

  // 5. Renderizado de Fichas de Título (/titulo/:slug/)
  if (pathname.startsWith("/titulo/")) {
    const slug = pathname.replace(/^\/titulo\//, "").replace(/\/$/, "").trim();
    if (slug) {
      try {
        const queryUrl = `${supabaseUrl}/rest/v1/movies?slug=eq.${encodeURIComponent(slug)}&select=${MOVIE_PROJECTION}&limit=1`;
        const resApi = await fetch(queryUrl, {
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Accept: "application/json" }
        });
        if (resApi.ok) {
          const rows = await resApi.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const html = renderMovieHtml(rows[0], { siteOrigin: `http://localhost:${PORT}`, baseUrl: "/" });
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
          }
        }
      } catch (err) {
        console.error("Error consultando película:", err);
      }
    }
  }

  // 6. Renderizado de Entidades VIP (/director/:slug/ y /actor/:slug/)
  const isDir = pathname.startsWith("/director/");
  const isAct = pathname.startsWith("/actor/");
  if (isDir || isAct) {
    const role = isDir ? "director" : "actor";
    const table = isDir ? "directors" : "actors";
    const otherTable = isDir ? "actors" : "directors";
    const prefix = isDir ? "/director/" : "/actor/";
    const slug = pathname.replace(prefix, "").replace(/\/$/, "").trim();

    if (slug) {
      try {
        const personUrl = `${supabaseUrl}/rest/v1/${table}?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug,birthday,deathday,place_of_birth,biography,titulo_bio,thumbhash_st,countries(id,code,name)&limit=1`;
        const pRes = await fetch(personUrl, {
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Accept: "application/json" }
        });
        if (pRes.ok) {
          const persons = await pRes.json();
          const person = Array.isArray(persons) && persons.length > 0 ? persons[0] : null;
          if (person) {
            const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
            const rpcParams = {
              [isDir ? "director_name" : "actor_name"]: person.name,
              sort_field: "fa_votes",
              sort_direction: "desc",
              page_limit: 42,
              get_count: true
            };
            const [otherRes, mRes] = await Promise.all([
              fetch(`${supabaseUrl}/rest/v1/${otherTable}?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, {
                headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
              }).catch(() => null),
              fetch(rpcUrl, {
                method: "POST",
                headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(rpcParams)
              }).catch(() => null)
            ]);

            const hasOtherRole = otherRes && otherRes.ok ? (await otherRes.json().catch(() => [])).length > 0 : false;
            let movies = [];
            if (mRes && mRes.ok) {
              const data = await mRes.json().catch(() => ({}));
              movies = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            }

            const html = renderPersonHtml(person, role, hasOtherRole, movies, {
              siteOrigin: `http://localhost:${PORT}`,
              storageUrl
            });
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
          }
        }
      } catch (err) {
        console.error("Error consultando persona VIP:", err);
      }
    }
  }

  // 7. Renderizado de Taxonomías de 1 Segmento (/:slug/)
  const rawPath = pathname.replace(/^\/+|\/+$/g, "").trim();
  if (rawPath && !rawPath.includes("/")) {
    const taxInfo = resolveTaxonomy(rawPath);
    if (taxInfo) {
      try {
        const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
        const apiResponse = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(taxInfo.rpcParams)
        });

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
          const html = renderTaxonomyHtml(taxInfo, items, {
            siteOrigin: `http://localhost:${PORT}`,
            storageUrl,
            baseUrl: "/"
          });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
      } catch (err) {
        console.error("Error consultando taxonomía:", err);
      }
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Servidor SEO Preview ejecutándose en: http://localhost:${PORT}`);
  console.log(`=============================================================`);
  console.log(`- Índice interactivo:  http://localhost:${PORT}/`);
  console.log(`- Género Ciencia Ficción: http://localhost:${PORT}/sci-fi/`);
  console.log(`- Género Drama:           http://localhost:${PORT}/drama/`);
  console.log(`- País España:            http://localhost:${PORT}/espana/`);
  console.log(`- Estudio Warner:         http://localhost:${PORT}/warner/`);
  console.log(`- Selección Criterion:    http://localhost:${PORT}/criterion/`);
  console.log(`- Director VIP:           http://localhost:${PORT}/director/christopher-nolan/`);
  console.log(`- Actor VIP:              http://localhost:${PORT}/actor/al-pacino/`);
  console.log(`- Ficha Título:           http://localhost:${PORT}/titulo/matrix-1999/`);
  console.log(`=============================================================\n`);
});
