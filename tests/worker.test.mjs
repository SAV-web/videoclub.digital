import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import worker from "../cloudflare/worker.js";

const SUPABASE_STORAGE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";

describe("cloudflare/worker.js (Edge Optimizer & Proxy Smoke Tests)", () => {
  let originalFetch;
  let originalCaches;
  let cacheStore;
  let fetchCalls;
  let defaultCtx;

  before(() => {
    originalFetch = globalThis.fetch;
    originalCaches = globalThis.caches;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  });

  beforeEach(() => {
    cacheStore = new Map();
    fetchCalls = [];

    // Mock de Cloudflare Cache API (caches.default)
    globalThis.caches = {
      default: {
        match: async (request) => {
          const url = typeof request === "string" ? request : request.url;
          const cached = cacheStore.get(url);
          return cached ? cached.clone() : undefined;
        },
        put: async (request, response) => {
          const url = typeof request === "string" ? request : request.url;
          cacheStore.set(url, response.clone());
        },
        delete: async (request) => {
          const url = typeof request === "string" ? request : request.url;
          return cacheStore.delete(url);
        },
      },
    };

    // Mock del ExecutionContext de Cloudflare Workers
    defaultCtx = {
      waitUntil: (promise) => Promise.resolve(promise),
      passThroughOnException: () => {},
    };

    // Mock global de fetch para simular Supabase y GitHub Pages Origin
    globalThis.fetch = async (input, init = {}) => {
      const urlStr = typeof input === "string" ? input : input.url;
      fetchCalls.push({ url: urlStr, init });

      // 1. Simulación de Supabase REST API: Consulta de películas por slug
      if (urlStr.includes("/rest/v1/movies")) {
        if (urlStr.includes("slug=eq.not-found")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const sampleMovie = {
          id: 10,
          title: "Cadena perpetua & Andy",
          original_title: "The Shawshank Redemption",
          slug: "cadena-perpetua-1994",
          year: 1994,
          type: "movie",
          genres_list: "Drama, Crimen",
          directors_list: "Frank Darabont",
          actors_list: "Tim Robbins, Morgan Freeman",
          studios_list: "warner",
          synopsis: "Andy Dufresne en la prisión de Shawshank <script>alert(1)</script>.",
          minutes: 142,
          fa_id: "https://www.filmaffinity.com/es/film161026.html",
          fa_rating: 8.6,
          fa_votes: 168000,
          imdb_id: "https://www.imdb.com/title/tt0111161/",
          imdb_rating: 9.3,
          imdb_votes: 2800000,
          avg_rating: 9.0,
          countries: { name: "Estados Unidos", code: "US" },
        };
        return new Response(JSON.stringify([sampleMovie]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 2. Simulación de Supabase Storage: Pósters
      if (urlStr.startsWith(`${SUPABASE_STORAGE_URL}/posters/`)) {
        if (urlStr.includes("not-found")) {
          return new Response("Not Found", { status: 404, statusText: "Not Found" });
        }
        return new Response("fake-image-binary-poster", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }

      // 3. Simulación de Supabase Storage: Fotos VIP
      if (urlStr.startsWith(`${SUPABASE_STORAGE_URL}/vips/`)) {
        return new Response("fake-image-binary-vip", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }

      // 4. Simulación de Origin: llms.txt
      if (urlStr.endsWith("/llms.txt")) {
        return new Response("# videoclub.digital LLMS Guide", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      // 5. Simulación de Origin: Assets versionados con hash y seo-card.css
      if (urlStr.includes("/assets/") || urlStr.endsWith("/seo-card.css")) {
        return new Response("/* compiled css or bundle */", {
          status: 200,
          headers: { "Content-Type": "text/css" },
        });
      }

      // 6. Simulación de Origin: HTML de SPA / Fallback
      return new Response("<!DOCTYPE html><html><head><title>Videoclub</title></head><body></body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    };
  });

  test("Proxy de pósters (/posters/*) reescribe hacia Supabase Storage e inyecta cabecera inmutable", async () => {
    const request = new Request("https://videoclub.digital/posters/matrix-1999.webp");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");

    assert.equal(fetchCalls.length, 1);
    assert.equal(
      fetchCalls[0].url,
      `${SUPABASE_STORAGE_URL}/posters/matrix-1999.webp`
    );
    assert.equal(fetchCalls[0].init?.cf?.cacheTtl, 31536000);
    assert.equal(fetchCalls[0].init?.cf?.cacheEverything, true);

    const cachedResponse = await worker.fetch(request, {}, defaultCtx);
    assert.equal(cachedResponse.status, 200);
    assert.equal(fetchCalls.length, 1, "La segunda petición debe resolverse desde caches.default");
  });

  test("Proxy de fotos VIP (/vips/*) reescribe hacia el bucket vips de Supabase", async () => {
    const request = new Request("https://videoclub.digital/vips/christopher-nolan.webp");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(
      fetchCalls[0].url,
      `${SUPABASE_STORAGE_URL}/vips/christopher-nolan.webp`
    );
  });

  test("Error 404 en Supabase Storage no almacena cabeceras erróneas de caché inmutable", async () => {
    const request = new Request("https://videoclub.digital/posters/not-found.webp");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 404);
    assert.notEqual(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  });

  test("Negociación Markdown en la raíz entrega /llms.txt con cabeceras para LLMs", async () => {
    const request = new Request("https://videoclub.digital/", {
      headers: { Accept: "text/markdown, text/html" },
    });
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/markdown; charset=utf-8");
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=3600");

    const text = await response.text();
    assert.match(text, /# videoclub\.digital LLMS Guide/);
  });

  test("Negociación Markdown NO secuestra rutas SPA ni páginas internas", async () => {
    const request = new Request("https://videoclub.digital/drama/", {
      headers: { Accept: "text/markdown, text/html" },
    });
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.notEqual(response.headers.get("Content-Type"), "text/markdown; charset=utf-8");
    assert.ok(response.headers.get("Content-Type")?.includes("text/html"));
  });

  test("Assets con hash (/assets/*) y /seo-card.css reciben directiva Cache-Control inmutable (1 año)", async () => {
    const reqAsset = new Request("https://videoclub.digital/assets/index-BwCqPT0a.css");
    const resAsset = await worker.fetch(reqAsset, {}, defaultCtx);
    assert.equal(resAsset.status, 200);
    assert.equal(resAsset.headers.get("Cache-Control"), "public, max-age=31536000, immutable");

    const reqCss = new Request("https://videoclub.digital/seo-card.css");
    const resCss = await worker.fetch(reqCss, {}, defaultCtx);
    assert.equal(resCss.status, 200);
    assert.equal(resCss.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  });

  test("Páginas HTML inyectan cabecera Link rel='alternate' y must-revalidate", async () => {
    const request = new Request("https://videoclub.digital/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
    assert.equal(response.headers.get("Link"), '</llms.txt>; rel="alternate"; type="text/markdown"');
  });

  // =================================================================
  //              PRUEBAS DE LA FASE 1B (EDGE SSR & CACHÉ)
  // =================================================================

  test("Normalización de Trailing Slash: /titulo/:slug redirige con 301 a /titulo/:slug/", async () => {
    const request = new Request("https://videoclub.digital/titulo/cadena-perpetua-1994");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 301);
    assert.equal(
      response.headers.get("Location"),
      "https://videoclub.digital/titulo/cadena-perpetua-1994/"
    );
  });

  test("Edge SSR: Cache MISS genera HTML seguro con Schema.org, metadatos y guarda en Edge Cache", async () => {
    const request = new Request("https://videoclub.digital/titulo/cadena-perpetua-1994/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(
      response.headers.get("Cache-Control"),
      "public, s-maxage=604800, stale-while-revalidate=86400"
    );

    const html = await response.text();

    // Verificación de seguridad (escapado contra inyecciones)
    assert.ok(html.includes("Cadena perpetua &amp; Andy"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!html.includes("<script>alert(1)</script>"));

    // Verificación de Schema.org JSON-LD
    assert.match(html, /"@type":"Movie"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /Frank Darabont/);

    // Verificación de Speculation Rules y CSS
    assert.ok(html.includes("<script type=\"speculationrules\">"));
    assert.ok(html.includes("href=\"/seo-card.css\""));

    // Segunda petición (Cache HIT): debe responder desde caches.default sin invocar a Supabase
    const initialFetchCalls = fetchCalls.length;
    const cachedResponse = await worker.fetch(request, {}, defaultCtx);
    assert.equal(cachedResponse.status, 200);
    assert.equal(fetchCalls.length, initialFetchCalls, "No debe invocar fetch en Cache HIT");
  });

  test("Edge SSR: Título inexistente en Supabase delega al origen", async () => {
    const request = new Request("https://videoclub.digital/titulo/not-found/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    // Debe haber llamado a Supabase y luego al origen HTML de fallback
    assert.ok(fetchCalls.some(c => c.url.includes("slug=eq.not-found")));
  });

  test("Purga Selectiva: POST /internal/purge valida autorización e invalida claves en caché", async () => {
    const edgeUrl = "https://videoclub.digital/titulo/cadena-perpetua-1994/";
    const getReq = new Request(edgeUrl);
    await worker.fetch(getReq, {}, defaultCtx);

    // Intento no autorizado: 401
    const unauthReq = new Request("https://videoclub.digital/internal/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: ["cadena-perpetua-1994"] }),
    });
    const unauthRes = await worker.fetch(unauthReq, {}, defaultCtx);
    assert.equal(unauthRes.status, 401);

    // Intento autorizado: 200 y purga
    const authReq = new Request("https://videoclub.digital/internal/purge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer videoclub-purge-secret",
      },
      body: JSON.stringify({ slugs: ["cadena-perpetua-1994"] }),
    });
    const authRes = await worker.fetch(authReq, {}, defaultCtx);
    assert.equal(authRes.status, 200);
    const result = await authRes.json();
    assert.equal(result.success, true);
    assert.equal(result.purged, 1);

    // Tras la purga, la siguiente llamada debe ser un nuevo MISS que consulte Supabase
    const beforeCount = fetchCalls.length;
    await worker.fetch(getReq, {}, defaultCtx);
    assert.ok(fetchCalls.length > beforeCount, "Debe consultar de nuevo a Supabase tras la purga");
  });
});
