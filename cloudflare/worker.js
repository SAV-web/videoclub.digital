/**
 * =================================================================
 *   CLOUDFLARE WORKER: VIDEOCLUB.DIGITAL EDGE OPTIMIZER
 * =================================================================
 * 
 * Responsabilidades Clave:
 * 1. Cache-Control inmutable (1 año) para assets con hash (/assets/*).
 * 2. Proxy y Edge Cache perpetuo para pósters (/posters/*) y fotos VIP (/vips/*)
 *    de Supabase Storage, reduciendo el consumo de egress a prácticamente cero.
 * 3. Negociación de contenido Markdown (Accept: text/markdown) para Agentes de IA.
 * 4. Inyección de cabeceras HTTP Link (Link: </llms.txt>; rel="alternate"; type="text/markdown").
 * 5. Control de revalidación para HTML y rutas SPA (must-revalidate).
 */

const SUPABASE_STORAGE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get("Accept") || "";

    // 1. NEGOCIACIÓN DE CONTENIDO MARKDOWN (Agentes de IA y LLMs)
    if (acceptHeader.includes("text/markdown") && !url.pathname.includes(".")) {
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

    // 2. PROXY & EDGE CACHE PARA PÓSTERS DE SUPABASE (/posters/*)
    if (url.pathname.startsWith("/posters/")) {
      const imagePath = url.pathname.replace(/^\/posters\//, "");
      const originImageUrl = `${SUPABASE_STORAGE_URL}/posters/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }

    // 3. PROXY & EDGE CACHE PARA PERFILES VIP DE SUPABASE (/vips/*)
    if (url.pathname.startsWith("/vips/")) {
      const imagePath = url.pathname.replace(/^\/vips\//, "");
      const originImageUrl = `${SUPABASE_STORAGE_URL}/vips/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }

    // 4. PETICIÓN POR DEFECTO AL ORIGEN (GitHub Pages)
    const response = await fetch(request);
    const headers = new Headers(response.headers);

    // 4.A Assets versionados con hash (/assets/*) -> Caché inmutable (1 año)
    if (url.pathname.startsWith("/assets/")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    // 4.B Respuestas HTML / Rutas SPA -> Revalidación y cabecera Link para Agentes
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

  // Intentar responder directamente desde la caché perimetral de Cloudflare
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  // Si no está en caché, solicitar al bucket de Supabase con caché perimetral
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

  // Guardar en la caché de Cloudflare de forma asíncrona sin bloquear la respuesta
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
