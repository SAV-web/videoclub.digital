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
 * 8. Delegación transparente al origen (GitHub Pages) con revalidación segura.
 */

import { renderMovieHtml } from "./seo/render-movie.js";
import { MOVIE_PROJECTION } from "./seo/seo-types.js";
import { SEO_CARD_CSS } from "./seo/seo-card-css.js";
import { resolveTaxonomy } from "./seo/taxonomy-types.js";
import { renderTaxonomyHtml } from "./seo/render-taxonomy.js";
import { renderPersonHtml } from "./seo/render-person.js";

const DEFAULT_SUPABASE_STORAGE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";
const DEFAULT_SUPABASE_URL = "https://wibygecgfczcvaqewleq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get("Accept") || "";
    const supabaseUrl = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseAnonKey = env?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    const storageUrl = env?.SUPABASE_STORAGE_URL || DEFAULT_SUPABASE_STORAGE_URL;

    // 1. ENDPOINT DE INVALIDACIÓN SELECTIVA DE CACHÉ (POST /internal/purge)
    if (url.pathname === "/internal/purge" && request.method === "POST") {
      const purgeSecret = env?.PURGE_SECRET || "videoclub-purge-secret";
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
        const canonicalTax = new URL(`/${slug}/`, url.origin).toString();
        const nonSlashTax = new URL(`/${slug}`, url.origin).toString();
        const canonicalDir = new URL(`/director/${slug}/`, url.origin).toString();
        const nonSlashDir = new URL(`/director/${slug}`, url.origin).toString();
        const canonicalAct = new URL(`/actor/${slug}/`, url.origin).toString();
        const nonSlashAct = new URL(`/actor/${slug}`, url.origin).toString();
        const p1 = await cache.delete(canonicalMovie);
        const p2 = await cache.delete(nonSlashMovie);
        const p3 = await cache.delete(canonicalTax);
        const p4 = await cache.delete(nonSlashTax);
        const p5 = await cache.delete(canonicalDir);
        const p6 = await cache.delete(nonSlashDir);
        const p7 = await cache.delete(canonicalAct);
        const p8 = await cache.delete(nonSlashAct);
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

    // 2. NORMALIZACIÓN CANÓNICA 301 DE TRAILING SLASH PARA /titulo/:slug, /director/:slug y /actor/:slug
    if ((url.pathname.startsWith("/titulo/") || url.pathname.startsWith("/director/") || url.pathname.startsWith("/actor/")) && !url.pathname.endsWith("/")) {
      const canonicalRedirectUrl = new URL(`${url.pathname}/${url.search}`, url.origin);
      return Response.redirect(canonicalRedirectUrl.toString(), 301);
    }

    // 3. RENDERER SEO EN EDGE BAJO DEMANDA (/titulo/:slug/)
    if (url.pathname.startsWith("/titulo/")) {
      const slug = url.pathname.replace(/^\/titulo\//, "").replace(/\/$/, "").trim();
      if (slug) {
        const cache = caches.default;
        const canonicalKey = new Request(new URL(`/titulo/${slug}/`, url.origin).toString(), request);
        
        // 3.A Intento en Edge Cache (Cache HIT en ~10-15ms)
        const cached = await cache.match(canonicalKey);
        if (cached) {
          return cached;
        }

        // 3.B Cache MISS: Consulta puntual a Supabase REST con proyección mínima
        const queryUrl = `${supabaseUrl}/rest/v1/movies?slug=eq.${encodeURIComponent(slug)}&select=${MOVIE_PROJECTION}&limit=1`;
        
        try {
          const apiResponse = await fetch(queryUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: "application/json"
            }
          });

          if (apiResponse.ok) {
            const rows = await apiResponse.json();
            if (Array.isArray(rows) && rows.length > 0) {
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
              // Almacenar en Edge Cache de forma asíncrona
              ctx?.waitUntil?.(cache.put(canonicalKey, response.clone()));
              return response;
            }
          }
        } catch (err) {
          // En caso de fallo transitorio en Supabase, delegar en el origin
        }
      }
    }

    // 3.B RENDERER SEO EN EDGE BAJO DEMANDA PARA ENTIDADES VIP (/director/:slug/ y /actor/:slug/)
    const isDirectorRoute = url.pathname.startsWith("/director/");
    const isActorRoute = url.pathname.startsWith("/actor/");
    if (isDirectorRoute || isActorRoute) {
      const role = isDirectorRoute ? "director" : "actor";
      const table = isDirectorRoute ? "directors" : "actors";
      const otherTable = isDirectorRoute ? "actors" : "directors";
      const prefix = isDirectorRoute ? "/director/" : "/actor/";
      const slug = url.pathname.replace(prefix, "").replace(/\/$/, "").trim();

      if (slug) {
        const cache = caches.default;
        const canonicalKey = new Request(new URL(`${prefix}${slug}/`, url.origin).toString(), request);

        // 3.B.1 Intento en Edge Cache (Cache HIT en ~10-15ms)
        const cached = await cache.match(canonicalKey);
        if (cached) {
          return cached;
        }

        // 3.B.2 Cache MISS: Consulta a Supabase REST de la persona
        const selectFields = "id,name,slug,birthday,deathday,place_of_birth,biography,titulo_bio,thumbhash_st,countries(id,code,name)";
        const personQueryUrl = `${supabaseUrl}/rest/v1/${table}?slug=eq.${encodeURIComponent(slug)}&select=${selectFields}&limit=1`;

        try {
          const personRes = await fetch(personQueryUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: "application/json"
            }
          });

          if (personRes.ok) {
            const persons = await personRes.json();
            const person = Array.isArray(persons) && persons.length > 0 ? persons[0] : null;

            // Regla Anti-Thin Content (Google Quality Guidelines): Solo VIPs con biografía redactada
            if (person && person.biography && person.biography.trim()) {
              // Comprobar si tiene el otro rol en paralelo con la filmografía
              const otherRoleQueryUrl = `${supabaseUrl}/rest/v1/${otherTable}?slug=eq.${encodeURIComponent(slug)}&select=id&biography=not.is.null&limit=1`;
              const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
              const rpcParams = {
                [isDirectorRoute ? "director_name" : "actor_name"]: person.name,
                sort_field: "fa_votes",
                sort_direction: "desc",
                page_limit: 42,
                get_count: true
              };

              const [otherRoleRes, moviesRes] = await Promise.all([
                fetch(otherRoleQueryUrl, {
                  headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    Accept: "application/json"
                  }
                }).catch(() => null),
                fetch(rpcUrl, {
                  method: "POST",
                  headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json"
                  },
                  body: JSON.stringify(rpcParams)
                }).catch(() => null)
              ]);

              let hasOtherRole = false;
              if (otherRoleRes && otherRoleRes.ok) {
                const otherRows = await otherRoleRes.json().catch(() => []);
                hasOtherRole = Array.isArray(otherRows) && otherRows.length > 0;
              }

              let movies = [];
              if (moviesRes && moviesRes.ok) {
                const moviesData = await moviesRes.json().catch(() => ({}));
                movies = Array.isArray(moviesData?.items) ? moviesData.items : (Array.isArray(moviesData) ? moviesData : []);
              }

              const html = renderPersonHtml(person, role, hasOtherRole, movies, { siteOrigin: url.origin, storageUrl });
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
            }
          }
        } catch (err) {
          // En caso de fallo transitorio, delegar en el origin
        }
      }
    }

    // 3.C RENDERER SEO EN EDGE PARA TAXONOMÍAS CERRADAS (Géneros, Países, Estudios, Selecciones)
    const rawPath = url.pathname.replace(/^\/+|\/+$/g, "").trim();
    if (rawPath && !rawPath.includes("/")) {
      const taxInfo = resolveTaxonomy(rawPath);
      if (taxInfo) {
        // Redirección canónica 301 si no tiene trailing slash
        if (!url.pathname.endsWith("/")) {
          const canonicalRedirectUrl = new URL(`/${taxInfo.canonicalSlug}/${url.search}`, url.origin);
          return Response.redirect(canonicalRedirectUrl.toString(), 301);
        }

        const cache = caches.default;
        const canonicalKey = new Request(new URL(`/${taxInfo.canonicalSlug}/`, url.origin).toString(), request);

        // Intento en Edge Cache (Cache HIT en ~15-25ms)
        const cached = await cache.match(canonicalKey);
        if (cached) {
          return cached;
        }

        // Cache MISS: Consulta RPC search_movies_offset a Supabase
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

          if (apiResponse.ok) {
            const data = await apiResponse.json();
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            
            // Regla Anti-Thin Content: Si no hay películas para este país/taxonomía, delegar al origen
            if (items.length > 0) {
              const html = renderTaxonomyHtml(taxInfo, items, { siteOrigin: url.origin, storageUrl });
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
            }
          }
        } catch (err) {
          // En caso de fallo transitorio, delegar al origen
        }
      }
    }

    // 4. NEGOCIACIÓN DE CONTENIDO MARKDOWN (Agentes de IA y LLMs)
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

    // 7. PETICIÓN POR DEFECTO AL ORIGEN (GitHub Pages)
    const response = await fetch(request);
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
