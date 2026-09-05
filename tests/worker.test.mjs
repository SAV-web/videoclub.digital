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

      // 1. Simulación de Supabase Storage: Pósters
      if (urlStr.startsWith(`${SUPABASE_STORAGE_URL}/posters/`)) {
        if (urlStr.includes("not-found")) {
          return new Response("Not Found", { status: 404, statusText: "Not Found" });
        }
        return new Response("fake-image-binary-poster", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }

      // 2. Simulación de Supabase Storage: Fotos VIP
      if (urlStr.startsWith(`${SUPABASE_STORAGE_URL}/vips/`)) {
        return new Response("fake-image-binary-vip", {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }

      // 3. Simulación de Origin: llms.txt
      if (urlStr.endsWith("/llms.txt")) {
        return new Response("# videoclub.digital LLMS Guide", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      // 4. Simulación de Origin: Assets versionados con hash
      if (urlStr.includes("/assets/")) {
        return new Response("/* compiled bundle */", {
          status: 200,
          headers: { "Content-Type": "text/javascript" },
        });
      }

      // 5. Simulación de Origin: HTML de SPA / Fichas
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

    // Verificar que invocó exactamente la URL de Supabase con opciones cf de caché
    assert.equal(fetchCalls.length, 1);
    assert.equal(
      fetchCalls[0].url,
      `${SUPABASE_STORAGE_URL}/posters/matrix-1999.webp`
    );
    assert.equal(fetchCalls[0].init?.cf?.cacheTtl, 31536000);
    assert.equal(fetchCalls[0].init?.cf?.cacheEverything, true);

    // Segunda petición: debe servirse de la caché perimetral sin volver a invocar fetch
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
    // Si la petición a una ficha o filtro solicita markdown, NO debe entregar el llms.txt genérico
    const request = new Request("https://videoclub.digital/drama/", {
      headers: { Accept: "text/markdown, text/html" },
    });
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.notEqual(response.headers.get("Content-Type"), "text/markdown; charset=utf-8");
    assert.ok(response.headers.get("Content-Type")?.includes("text/html"));
  });

  test("Assets con hash (/assets/*) reciben directiva Cache-Control inmutable (1 año)", async () => {
    const request = new Request("https://videoclub.digital/assets/index-BwCqPT0a.css");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  });

  test("Páginas HTML inyectan cabecera Link rel='alternate' y must-revalidate", async () => {
    const request = new Request("https://videoclub.digital/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
    assert.equal(response.headers.get("Link"), '</llms.txt>; rel="alternate"; type="text/markdown"');
  });
});
