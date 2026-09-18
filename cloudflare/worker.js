/**
 * =================================================================
 *   CLOUDFLARE WORKER: VIDEOCLUB.DIGITAL EDGE OPTIMIZER & SEO SSR
 * =================================================================
 * 
 * Responsabilidades Clave:
 * 1. Renderer SEO en Edge bajo demanda (/titulo/:slug/) con Edge Cache explícito (TTL 7 días).
 * 2. Normalización canónica (301 de /titulo/:slug a /titulo/:slug/) para evitar duplicación.
 * 3. Endpoint de invalidación selectiva perimetral (POST /internal/purge).
 * 4. Cache-Control inmutable (1 año) para assets con hash (/assets/*) y /seo-card.css.
 * 5. Proxy y Edge Cache perpetuo para pósters (/posters/*) y fotos VIP (/vips/*).
 * 6. Negociación de contenido Markdown (Accept: text/markdown) para Agentes de IA en la raíz.
 * 7. Inyección de cabeceras HTTP Link rel="alternate" para agentes.
 * 8. Servicio de Static Assets y SPA nativo en Cloudflare Edge con revalidación segura.
 */

import { renderMovieHtml } from "./seo/render-movie.js";
import { MOVIE_PROJECTION } from "./seo/seo-types.js";
import { SEO_CARD_CSS } from "./seo/seo-card-css.js";
import { resolveTaxonomy } from "./seo/taxonomy-types.js";
import { renderTaxonomyHtml } from "./seo/render-taxonomy.js";
import { renderPersonHtml } from "./seo/render-person.js";
import { VIP_SLUGS } from "./seo/vip-manifest.js";

/**
 * Configuración de transición para entornos de desarrollo / pruebas donde aún
 * no se inyectan variables vía wrangler.toml o Cloudflare Dashboard.
 * En proceso de deprecación progresiva hacia inyección exclusiva vía ENVIRONMENT (env).
 */
const TRANSITIONAL_CONFIG = {
  SUPABASE_URL: "https://wibygecgfczcvaqewleq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc"
};

/**
 * Resuelve la configuración de ejecución con prioridad absoluta para ENVIRONMENT (env):
 *   ENVIRONMENT
 *      ↓
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_STORAGE_URL (deducida automáticamente de SUPABASE_URL si no se define)
 *   PURGE_SECRET (estrictamente fail-closed, sin fallback por diseño de seguridad)
 */
function resolveEnvironment(env) {
  const supabaseUrl = env?.SUPABASE_URL || TRANSITIONAL_CONFIG.SUPABASE_URL;
  const supabaseAnonKey = env?.SUPABASE_ANON_KEY || TRANSITIONAL_CONFIG.SUPABASE_ANON_KEY;
  const storageUrl = env?.SUPABASE_STORAGE_URL || (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public` : "");
  const purgeSecret = env?.PURGE_SECRET;

  return { supabaseUrl, supabaseAnonKey, storageUrl, purgeSecret };
}

const RESERVED_PREFIXES = [
  "/api/",
  "/assets/",
  "/posters/",
  "/vips/",
  "/internal/",
  "/genero/",
  "/pais/",
  "/estudio/",
  "/seleccion/",
  "/titulo/",
  "/actor/",
  "/director/"
];

const RESERVED_EXACT = new Set([
  "/",
  "",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/llms.txt",
  "/favicon.ico",
  "/favicon.svg",
  "/robots.txt"
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get("Accept") || "";
    const { supabaseUrl, supabaseAnonKey, storageUrl, purgeSecret } = resolveEnvironment(env);

    // 1. ENDPOINT DE INVALIDACIÓN SELECTIVA DE CACHÉ (POST /internal/purge)
    if (url.pathname === "/internal/purge" && request.method === "POST") {
      if (!purgeSecret) {
        return new Response(JSON.stringify({ error: "Server misconfigured: PURGE_SECRET not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${purgeSecret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const body = await request.json().catch(() => ({}));
      const slugs = Array.isArray(body.slugs) ? body.slugs : [];
      const cache = caches.default;
      let purgedCount = 0;
      for (const slug of slugs) {
        const canonicalMovie = new URL(`/titulo/${slug}/`, url.origin).toString();
        const nonSlashMovie = new URL(`/titulo/${slug}`, url.origin).toString();
        const canonicalPerson = new URL(`/${slug}/`, url.origin).toString();
        const nonSlashPerson = new URL(`/${slug}`, url.origin).toString();
        const canonicalGenre = new URL(`/genero/${slug}/`, url.origin).toString();
        const canonicalCountry = new URL(`/pais/${slug}/`, url.origin).toString();
        const canonicalStudio = new URL(`/estudio/${slug}/`, url.origin).toString();
        const canonicalSel = new URL(`/seleccion/${slug}/`, url.origin).toString();

        const p1 = await cache.delete(canonicalMovie);
        const p2 = await cache.delete(nonSlashMovie);
        const p3 = await cache.delete(canonicalPerson);
        const p4 = await cache.delete(nonSlashPerson);
        const p5 = await cache.delete(canonicalGenre);
        const p6 = await cache.delete(canonicalCountry);
        const p7 = await cache.delete(canonicalStudio);
        const p8 = await cache.delete(canonicalSel);
        if (p1 || p2 || p3 || p4 || p5 || p6 || p7 || p8) purgedCount++;
      }
      return new Response(JSON.stringify({ success: true, purged: purgedCount, totalRequested: slugs.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1.B SERVIR HOJA DE ESTILOS SEO DIRECTAMENTE DESDE EDGE MEMORY (0ms Origin roundtrip)
    if (url.pathname.startsWith("/seo-card") && url.pathname.endsWith(".css")) {
      return new Response(SEO_CARD_CSS, {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 1.C SERVIR SITEMAP INDEX A MOTORES DE BÚSQUEDA
    if (url.pathname === "/sitemap-index.xml") {
      const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${url.origin}/sitemap.xml</loc>
  </sitemap>
</sitemapindex>
`;
      return new Response(sitemapIndexXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=604800"
        }
      });
    }

    // 2. NORMALIZACIÓN CANÓNICA 301 (CASE-INSENSITIVITY, TRAILING SLASH Y ELIMINACIÓN DE QUERY STRING) PARA RUTAS SEO PREFIJADAS
    const lowerPath = url.pathname.toLowerCase();
    const hasFileExtension = url.pathname.includes(".") && !url.pathname.endsWith("/");
    const isPrefixedSeoRoute = 
      !hasFileExtension &&
      (lowerPath.startsWith("/titulo/") ||
       lowerPath.startsWith("/genero/") ||
       lowerPath.startsWith("/pais/") ||
       lowerPath.startsWith("/estudio/") ||
       lowerPath.startsWith("/seleccion/"));

    if (isPrefixedSeoRoute) {
      const canonicalPath = lowerPath.replace(/\/+$/, "") + "/";
      const hasUppercase = /[A-Z]/.test(url.pathname);
      const missingSlash = !url.pathname.endsWith("/");
      const hasQuery = Boolean(url.search);

      if (hasUppercase || missingSlash || hasQuery) {
        return Response.redirect(new URL(canonicalPath, url.origin).toString(), 301);
      }
    }

    // 3. RENDERER SEO EN EDGE BAJO DEMANDA (/titulo/:slug/)
    if (!hasFileExtension && lowerPath.startsWith("/titulo/")) {
      const slug = url.pathname.replace(/^\/titulo\//i, "").replace(/\/$/, "").trim().toLowerCase();
      if (slug) {
        const cache = caches.default;
        const canonicalKey = new Request(new URL(`/titulo/${slug}/`, url.origin).toString(), request);
        
        // Intento en Edge Cache
        const cached = await cache.match(canonicalKey);
        if (cached) {
          return cached;
        }

        // Cache MISS: Consulta puntual a Supabase REST con proyección mínima
        const queryUrl = `${supabaseUrl}/rest/v1/movies?slug=eq.${encodeURIComponent(slug)}&select=${MOVIE_PROJECTION}&limit=1`;
        
        try {
          const apiResponse = await fetch(queryUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: "application/json"
            }
          });

          if (!apiResponse.ok) {
            return createErrorResponse(apiResponse.status >= 500 ? 502 : apiResponse.status, "Error al conectar con la base de datos", url.origin);
          }

          const rows = await apiResponse.json();
          if (!Array.isArray(rows) || rows.length === 0) {
            return createErrorResponse(404, "Título no encontrado en el catálogo", url.origin);
          }

          const movie = rows[0];
          const html = renderMovieHtml(movie, { siteOrigin: url.origin, baseUrl: "/" });
          const responseHeaders = new Headers({
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
            "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
          });
          const response = new Response(html, {
            status: 200,
            headers: responseHeaders
          });
          ctx?.waitUntil?.(cache.put(canonicalKey, response.clone()));
          return response;
        } catch (_) {
          return createErrorResponse(500, "Error interno del servidor al procesar el título", url.origin);
        }
      }
    }

    // 4. RENDERER SEO EN EDGE PARA TAXONOMÍAS PREFIJADAS (/genero/, /pais/, /estudio/, /seleccion/)
    const isTaxonomyRoute = 
      !hasFileExtension &&
      (lowerPath.startsWith("/genero/") ||
       lowerPath.startsWith("/pais/") ||
       lowerPath.startsWith("/estudio/") ||
       lowerPath.startsWith("/seleccion/"));

    if (isTaxonomyRoute) {
      const parts = url.pathname.toLowerCase().split("/").filter(Boolean);
      if (parts.length === 2) {
        const [prefix, slug] = parts;
        const taxInfo = resolveTaxonomy(slug, prefix);
        if (taxInfo) {
          const hasUppercase = /[A-Z]/.test(url.pathname);
          const missingSlash = !url.pathname.endsWith("/");
          const hasQuery = Boolean(url.search);
          if (hasUppercase || missingSlash || hasQuery) {
            return Response.redirect(new URL(taxInfo.canonicalPath, url.origin).toString(), 301);
          }

          const cache = caches.default;
          const canonicalKey = new Request(new URL(taxInfo.canonicalPath, url.origin).toString(), request);

          const cached = await cache.match(canonicalKey);
          if (cached) {
            return cached;
          }

          const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
          try {
            const apiResponse = await fetch(rpcUrl, {
              method: "POST",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json",
                Accept: "application/json"
              },
              body: JSON.stringify(taxInfo.rpcParams)
            });

            if (!apiResponse.ok) {
              return createErrorResponse(apiResponse.status >= 500 ? 502 : apiResponse.status, "Error al consultar la categoría", url.origin);
            }

            const data = await apiResponse.json();
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            
            if (items.length === 0) {
              return createErrorResponse(404, "No se encontraron títulos en esta categoría", url.origin);
            }

            const html = renderTaxonomyHtml(taxInfo, items, { siteOrigin: url.origin, storageUrl });
            const response = new Response(html, {
              status: 200,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
                "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
              }
            });
            ctx?.waitUntil?.(cache.put(canonicalKey, response.clone()));
            return response;
          } catch (_) {
            return createErrorResponse(500, "Error interno del servidor al procesar la categoría", url.origin);
          }
        } else {
          return createErrorResponse(404, "Categoría no reconocida en el catálogo", url.origin);
        }
      } else {
        return createErrorResponse(404, "Ruta de categoría no válida", url.origin);
      }
    }

    // 5. RENDERER SEO EN EDGE PARA PERSONAS VIP EN LA RAÍZ (/:person-slug/)
    const isReservedPrefix = RESERVED_PREFIXES.some(p => lowerPath.startsWith(p));
    const isReservedExact = RESERVED_EXACT.has(lowerPath);

    if (!isReservedPrefix && !isReservedExact && !hasFileExtension) {
      const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
      // Evaluamos únicamente rutas de 1er nivel en la raíz (ej. /tom-cruise/ o /Tom-Cruise)
      if (segments.length === 1) {
        const rawSlug = segments[0];
        const slug = rawSlug.toLowerCase();

        // 5.A EVALUACIÓN O(1) EN MEMORIA DEL ISOLATE
        // Principio Arquitectónico: VIP_SLUGS decide ÚNICAMENTE si el Worker debe
        // intentar resolver una ruta raíz como SEO VIP (filtro de enrutamiento O(1)).
        // Los datos editoriales de la página (biografía, fechas, filmografía) siempre proceden
        // de Supabase (SSOT). El manifiesto no sustituye a la base de datos.
        // Si no está en VIP_SLUGS, JAMÁS consulta a la BD y delega de inmediato al origen SPA.
        if (VIP_SLUGS.has(slug)) {
          // Normalización estricta de trailing slash, case-insensitivity canónico 301 y eliminación de query string
          const hasUppercase = /[A-Z]/.test(url.pathname);
          const missingSlash = !url.pathname.endsWith("/");
          const hasQuery = Boolean(url.search);
          if (hasUppercase || missingSlash || hasQuery) {
            return Response.redirect(new URL(`/${slug}/`, url.origin).toString(), 301);
          }

          const cache = caches.default;
          const canonicalKey = new Request(new URL(`/${slug}/`, url.origin).toString(), request);

          const cached = await cache.match(canonicalKey);
          if (cached) {
            return cached;
          }

          // Cache MISS: Consulta a Supabase exclusivamente filtrada por vip = 1
          const selectFields = "id,name,slug,type,vip,birthday,deathday,place_of_birth,biography,titulo_bio,thumbhash_st,countries(id,code,name)";
          const personQueryUrl = `${supabaseUrl}/rest/v1/people?slug=eq.${encodeURIComponent(slug)}&vip=eq.1&select=${selectFields}&limit=1`;

          try {
            const personRes = await fetch(personQueryUrl, {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                Accept: "application/json"
              }
            });

            if (!personRes.ok) {
              return createErrorResponse(personRes.status >= 500 ? 502 : personRes.status, "Error al consultar la ficha de persona", url.origin);
            }

            const persons = await personRes.json();
            const person = Array.isArray(persons) && persons.length > 0 ? persons[0] : null;

            if (!person) {
              return createErrorResponse(404, "Persona VIP no encontrada en el catálogo", url.origin);
            }

            const defaultRole = (person.type === "D" || person.type === "DA") ? "director" : "actor";
            const hasBothRoles = person.type === "AD" || person.type === "DA";
            const activeRole = defaultRole;

            const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
            const fetchFilmography = async (roleName) => {
              const rpcParams = {
                [roleName === "director" ? "director_name" : "actor_name"]: person.name,
                sort_field: "fa_votes",
                sort_direction: "desc",
                page_limit: 42,
                get_count: true
              };
              try {
                const res = await fetch(rpcUrl, {
                  method: "POST",
                  headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json"
                  },
                  body: JSON.stringify(rpcParams)
                });
                if (res && res.ok) {
                  const data = await res.json().catch(() => ({}));
                  return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
                }
              } catch (_) {}
              return [];
            };

            const filmographies = { director: [], actor: [] };

            if (hasBothRoles) {
              [filmographies.director, filmographies.actor] = await Promise.all([
                fetchFilmography("director"),
                fetchFilmography("actor")
              ]);
            } else {
              filmographies[activeRole] = await fetchFilmography(activeRole);
            }

            const html = renderPersonHtml(person, {
              activeRole,
              hasBothRoles,
              filmographies,
              siteOrigin: url.origin,
              baseUrl: "/",
              storageUrl
            });
            const response = new Response(html, {
              status: 200,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
                "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
              }
            });

            ctx?.waitUntil?.(cache.put(canonicalKey, response.clone()));
            return response;
          } catch (_) {
            return createErrorResponse(500, "Error interno del servidor al procesar la persona VIP", url.origin);
          }
        }
      }
    }

    // 6. NEGOCIACIÓN DE CONTENIDO MARKDOWN (Agentes de IA y LLMs)
    const isRootPath = url.pathname === "/" || url.pathname === "";
    if (acceptHeader.includes("text/markdown") && isRootPath) {
      const llmsUrl = new URL("/llms.txt", url.origin);
      const llmsResponse = await fetch(llmsUrl.toString(), request);
      const headers = new Headers(llmsResponse.headers);
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=3600");
      return new Response(llmsResponse.body, {
        status: llmsResponse.status,
        headers,
      });
    }

    // 5. PROXY & EDGE CACHE PARA PÓSTERS DE SUPABASE (/posters/*)
    if (url.pathname.startsWith("/posters/")) {
      const imagePath = url.pathname.replace(/^\/posters\//, "");
      const originImageUrl = `${storageUrl}/posters/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }

    // 6. PROXY & EDGE CACHE PARA PERFILES VIP DE SUPABASE (/vips/*)
    if (url.pathname.startsWith("/vips/")) {
      const imagePath = url.pathname.replace(/^\/vips\//, "");
      const originImageUrl = `${storageUrl}/vips/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }

    // 7. PETICIÓN POR DEFECTO A STATIC ASSETS DE CLOUDFLARE (Fallback a fetch si no hay binding en tests)
    const assetFetcher = env?.ASSETS || { fetch: globalThis.fetch };
    const response = await assetFetcher.fetch(request);
    const headers = new Headers(response.headers);

    // 7.A Assets versionados con hash (/assets/*) y /seo-card*.css -> Caché inmutable (1 año)
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/seo-card")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    // 7.B Respuestas HTML / Rutas SPA -> Revalidación y cabecera Link para Agentes
    else if (headers.get("Content-Type")?.includes("text/html") || !url.pathname.includes(".")) {
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      headers.set("Link", '</llms.txt>; rel="alternate"; type="text/markdown"');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

/**
 * Genera una respuesta de error semántica (404 o 5xx) para peticiones SEO.
 * Garantiza un contrato HTTP explícito y evita que fallos de backend se silencien como 200 OK.
 */
function createErrorResponse(status, message, siteOrigin = "https://videoclub.digital") {
  const isServer = status >= 500;
  const title = status === 404 ? "Página no encontrada — VIDEOCLUB" : "Error en el servidor — VIDEOCLUB";
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="robots" content="noindex, follow">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f1115; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; text-align: center; }
    .card { background: #1a1f29; border: 1px solid #2d3748; padding: 2.5rem; border-radius: 12px; max-width: 440px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 3.5rem; margin: 0 0 0.5rem; color: #e50914; font-weight: 800; line-height: 1; }
    h2 { font-size: 1.25rem; margin: 0 0 1rem; font-weight: 600; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem; }
    a { display: inline-block; background: #e50914; color: #fff; text-decoration: none; padding: 0.65rem 1.4rem; border-radius: 6px; font-weight: 600; font-size: 0.9rem; transition: background 0.2s ease; }
    a:hover { background: #b80710; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${status}</h1>
    <h2>${status === 404 ? "Contenido no encontrado" : "Error de servicio"}</h2>
    <p>${message}</p>
    <a href="${siteOrigin}/">Volver al videoclub</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": isServer ? "no-store, no-cache, must-revalidate" : "public, max-age=300, must-revalidate"
    }
  });
}

/**
 * Función auxiliar para servir y cachear imágenes en Cloudflare Edge (TTL: 1 año)
 */
async function fetchAndCacheImage(originUrl, request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  const originResponse = await fetch(originUrl, {
    cf: {
      cacheTtl: 31536000,
      cacheEverything: true,
    },
  });

  if (!originResponse.ok) {
    return originResponse;
  }

  const headers = new Headers(originResponse.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");

  response = new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers,
  });

  ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
  return response;
}
