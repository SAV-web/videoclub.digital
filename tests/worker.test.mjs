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
        if (urlStr.includes("slug=eq.chernobyl-2019")) {
          const sampleSeries = {
            id: 200,
            title: "Chernobyl",
            original_title: "Chernobyl",
            slug: "chernobyl-2019",
            year: 2019,
            type: "series",
            episodes: 5,
            minutes: 330,
            genres_list: "Drama, Historia",
            directors_list: "Johan Renck",
            actors_list: "Jared Harris, Stellan Skarsgård",
            studios_list: "hbo",
            synopsis: "En abril de 1986, la Central Nuclear de Chernóbil sufrió una gran explosión.",
            fa_rating: 8.4,
            fa_votes: 95000,
            imdb_rating: 9.3,
            imdb_votes: 850000,
            avg_rating: 8.9,
            countries: { name: "Estados Unidos", code: "US" }
          };
          return new Response(JSON.stringify([sampleSeries]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
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

      // 1.B Simulación de Supabase RPC: search_movies_offset para taxonomías
      if (urlStr.includes("/rest/v1/rpc/search_movies_offset")) {
        let params = {};
        try { params = typeof init.body === "string" ? JSON.parse(init.body) : (init.body || {}); } catch (_) {}
        if (params.country_name === "EmptyCountry" || params.genre_name === "EmptyGenre") {
          return new Response(JSON.stringify({ total: 0, items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        const sampleTaxonomyMovies = [
          {
            id: 1,
            title: "Matrix",
            original_title: "The Matrix",
            slug: "matrix-1999",
            year: 1999,
            type: null,
            fa_rating: 7.9,
            fa_votes: 199000,
            directors: "Hermanas Wachowski"
          },
          {
            id: 2,
            title: "Origen",
            original_title: "Inception",
            slug: "origen-2010",
            year: 2010,
            type: null,
            fa_rating: 8.0,
            fa_votes: 160000,
            directors: "Christopher Nolan"
          }
        ];
        return new Response(JSON.stringify({ total: 2, items: sampleTaxonomyMovies }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 1.C Simulación de Supabase REST API: Personas VIP ('people')
      if (urlStr.includes("/rest/v1/people")) {
        if (urlStr.includes("slug=eq.not-found")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (urlStr.includes("slug=eq.christopher-nolan")) {
          const sampleDirector = {
            id: 4134,
            name: "Christopher Nolan",
            slug: "christopher-nolan",
            type: "D",
            vip: 1,
            birthday: "1970-07-30",
            deathday: null,
            place_of_birth: "Londres, UK",
            biography: "Apasionado del medio audiovisual desde la infancia a través del formato súper-8.",
            titulo_bio: "Cineasta británico maestro de puestas en escena conceptuales",
            thumbhash_st: "data:image/webp;base64,sample",
            countries: { id: 826, code: "GB", name: "UK" }
          };
          return new Response(JSON.stringify([sampleDirector]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (urlStr.includes("slug=eq.harrison-ford")) {
          const sampleActor = {
            id: 506,
            name: "Harrison Ford",
            slug: "harrison-ford",
            type: "A",
            vip: 1,
            birthday: "1942-07-13",
            deathday: null,
            place_of_birth: "Chicago, EEUU",
            biography: "Cursó estudios de filosofía y letras antes de trasladarse a California.",
            titulo_bio: "Héroe arquetípico del cine de aventuras",
            thumbhash_st: "data:image/webp;base64,sample",
            countries: { id: 840, code: "US", name: "EEUU" }
          };
          return new Response(JSON.stringify([sampleActor]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }

      // 1.D Simulación de Supabase REST API: Directores VIP (retrocompatibilidad)
      if (urlStr.includes("/rest/v1/directors")) {
        if (urlStr.includes("slug=eq.not-found") || urlStr.includes("slug=eq.harrison-ford")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        if (urlStr.includes("slug=eq.thin-director")) {
          return new Response(JSON.stringify([{
            id: 9999,
            name: "Thin Director",
            slug: "thin-director",
            biography: null
          }]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        const sampleDirector = {
          id: 4134,
          name: "Christopher Nolan",
          slug: "christopher-nolan",
          birthday: "1970-07-30",
          deathday: null,
          place_of_birth: "Londres, UK",
          biography: "Apasionado del medio audiovisual desde la infancia a través del formato súper-8.",
          titulo_bio: "Cineasta británico maestro de puestas en escena conceptuales",
          thumbhash_st: "data:image/webp;base64,sample",
          countries: { id: 826, code: "GB", name: "UK" }
        };
        return new Response(JSON.stringify([sampleDirector]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 1.E Simulación de Supabase REST API: Actores VIP (retrocompatibilidad)
      if (urlStr.includes("/rest/v1/actors")) {
        if (urlStr.includes("slug=eq.not-found") || urlStr.includes("slug=eq.christopher-nolan")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        const sampleActor = {
          id: 506,
          name: "Harrison Ford",
          slug: "harrison-ford",
          birthday: "1942-07-13",
          deathday: null,
          place_of_birth: "Chicago, EEUU",
          biography: "Cursó estudios de filosofía y letras antes de trasladarse a California.",
          titulo_bio: "Héroe arquetípico del cine de aventuras",
          thumbhash_st: "data:image/webp;base64,sample",
          countries: { id: 840, code: "US", name: "EEUU" }
        };
        return new Response(JSON.stringify([sampleActor]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
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
    assert.ok(html.includes("seo-card"));

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

  test("Case-Insensitive SEO: /titulo/Chernobyl-2019 redirige con 301 a /titulo/chernobyl-2019/", async () => {
    const request = new Request("https://videoclub.digital/titulo/Chernobyl-2019");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 301);
    assert.equal(
      response.headers.get("Location"),
      "https://videoclub.digital/titulo/chernobyl-2019/"
    );
  });

  test("Case-Insensitive SEO: /titulo/Chernobyl-2019/ con barra final pero mayúsculas redirige con 301 a minúsculas", async () => {
    const request = new Request("https://videoclub.digital/titulo/Chernobyl-2019/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 301);
    assert.equal(
      response.headers.get("Location"),
      "https://videoclub.digital/titulo/chernobyl-2019/"
    );
  });

  test("Series SEO: los episodios se representan con 'x' en lugar de con 'ep' en /titulo/chernobyl-2019/", async () => {
    const request = new Request("https://videoclub.digital/titulo/chernobyl-2019/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    const html = await response.text();

    assert.ok(html.includes("5 x"), "Los episodios deben contener el formato '5 x'");
    assert.ok(!html.includes("5 ep"), "NO debe contener el formato '5 ep'");
  });

  test("Ficha SEO de título: fondo sin desenfoque (backdrop-filter: none) y enlaces del header accesibles por encima del overlay", async () => {
    const request = new Request("https://videoclub.digital/titulo/chernobyl-2019/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    const html = await response.text();

    // Verificación de los dos enlaces habituales en el header
    assert.ok(html.includes('class="brand-logo-text"'), "Debe incluir el enlace de marca a la home");
    assert.ok(html.includes('class="btn-header-cta"'), "Debe incluir el botón CTA para abrir en videoclub interactivo");
    assert.ok(html.includes('href="/?movie=200"'), "El botón CTA debe enlazar con ?movie=200");

    // Header con z-index superior al overlay
    assert.ok(html.includes('z-index: calc(var(--z-index-overlay, 1999) + 2)'), "El header debe tener z-index superior al overlay");

    // Overlay sin desenfoque
    assert.ok(html.includes('backdrop-filter: none'), "El overlay no debe aplicar desenfoque al fondo");
  });

  test("Ficha SEO de título: bandera enlaza a /pais/:slug/ y estrellas/watchlist enlazan a la modal con filtro de director", async () => {
    const request = new Request("https://videoclub.digital/titulo/chernobyl-2019/");
    const response = await worker.fetch(request, {}, defaultCtx);

    assert.equal(response.status, 200);
    const html = await response.text();

    // 1. Enlace al país de la bandera conduce a la SPA
    assert.ok(
      html.includes('href="/?_p=/estados-unidos/" class="country-info"'),
      "La bandera debe conducir al SPA con /?_p=/estados-unidos/"
    );

    // 1b. Enlace a géneros conduce a la SPA
    assert.ok(
      html.includes('href="/?_p=/drama/"'),
      "Los géneros deben conducir al SPA con /?_p=/drama/"
    );

    // 2. Estrellas enlazan a la modal con filtro del primer director en el grid
    assert.ok(
      html.includes('href="/?_p=/director/johan-renck/&amp;movie=200" class="star-rating-container') ||
      html.includes('href="/?_p=/director/johan-renck/&movie=200" class="star-rating-container'),
      "Las estrellas deben enlazar a la modal con el catálogo filtrado por el primer director"
    );

    // 3. Watchlist enlaza a la modal con filtro del primer director en el grid
    assert.ok(
      html.includes('href="/?_p=/director/johan-renck/&amp;movie=200" class="card-action-btn') ||
      html.includes('href="/?_p=/director/johan-renck/&movie=200" class="card-action-btn'),
      "El botón de watchlist debe enlazar a la modal con el catálogo filtrado por el primer director"
    );
  });

  test("Case-Insensitive SEO en personas VIP y taxonomías: /Christopher-Nolan y /genero/Sci-Fi redirigen con 301", async () => {
    const personReq = new Request("https://videoclub.digital/Christopher-Nolan");
    const personRes = await worker.fetch(personReq, {}, defaultCtx);
    assert.equal(personRes.status, 301);
    assert.equal(personRes.headers.get("Location"), "https://videoclub.digital/christopher-nolan/");

    const personSlashReq = new Request("https://videoclub.digital/Christopher-Nolan/");
    const personSlashRes = await worker.fetch(personSlashReq, {}, defaultCtx);
    assert.equal(personSlashRes.status, 301);
    assert.equal(personSlashRes.headers.get("Location"), "https://videoclub.digital/christopher-nolan/");

    const taxReq = new Request("https://videoclub.digital/genero/Sci-Fi");
    const taxRes = await worker.fetch(taxReq, {}, defaultCtx);
    assert.equal(taxRes.status, 301);
    assert.equal(taxRes.headers.get("Location"), "https://videoclub.digital/genero/sci-fi/");
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

  test("Sitemap Index: /sitemap-index.xml entrega XML estructurado apuntando a /sitemap.xml", async () => {
    const req = new Request("https://videoclub.digital/sitemap-index.xml");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("Content-Type").includes("application/xml"));
    const text = await res.text();
    assert.ok(text.includes("<sitemapindex"));
    assert.ok(text.includes("https://videoclub.digital/sitemap.xml"));
  });

  test("Taxonomías: /genero/sci-fi redirige con 301 a /genero/sci-fi/", async () => {
    const req = new Request("https://videoclub.digital/genero/sci-fi");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("Location"), "https://videoclub.digital/genero/sci-fi/");
  });

  test("Taxonomías: /genero/sci-fi/ entrega 200 OK con CollectionPage, ItemList y Cache-Control", async () => {
    const req = new Request("https://videoclub.digital/genero/sci-fi/");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("Content-Type").includes("text/html"));
    assert.ok(res.headers.get("Cache-Control").includes("s-maxage=604800"));
    const html = await res.text();
    assert.ok(html.includes("Películas y Series de Ciencia Ficción"));
    assert.ok(html.includes('"@type":"CollectionPage"'));
    assert.ok(html.includes('"@type":"ItemList"'));
    assert.ok(html.includes("movie-card"), "Debe usar la clase oficial .movie-card");
    assert.ok(html.includes("grid-container"), "Debe usar el grid oficial .grid-container");
    assert.ok(html.includes("filter-pill"), "Debe incluir el filtro activo .filter-pill");
    assert.ok(html.includes('href="/?_p=/sci-fi/"'), "El nombre de la sección debe enlazar a la SPA");
    assert.ok(!html.includes("Total:"), "NO debe contener el contador Total:");
    assert.ok(!html.includes("btn-open-spa"), "NO debe contener el botón Explorar");
    assert.ok(html.includes("Aviso legal"), "El footer debe contener los avisos legales");
    assert.ok(html.includes("actors-expand-btn"), "Debe incluir el botón + de reparto");
    assert.ok(html.includes("actors-scrollable-content"), "Debe incluir el overlay deslizable de reparto");
    assert.ok(html.includes("seo-card-v7.css"), "Debe enlazar con seo-card-v7.css");
    assert.ok(html.includes('class="star-rating-container has-average-rating is-interactive"'), "Las estrellas deben ser un elemento interactivo");
    assert.ok(html.includes('?movie='), "Las estrellas o watchlist deben enlazar al modal de la película (?movie=)");
    assert.ok(html.includes('data-year-value='), "El año debe contener data-year-value");
    assert.ok(!html.includes("collection-hero"), "NO debe contener el bloque hero invasivo");
  });

  test("Taxonomías: Países, Estudios y Selecciones (/pais/espana/, /pais/latam/, /seleccion/criterion/, /estudio/a24/) responden 200 OK", async () => {
    const routes = ["/pais/espana/", "/pais/latam/", "/seleccion/criterion/", "/estudio/a24/"];
    for (const r of routes) {
      const req = new Request(`https://videoclub.digital${r}`);
      const res = await worker.fetch(req, {}, defaultCtx);
      assert.equal(res.status, 200, `Ruta ${r} debe responder 200`);
      const html = await res.text();
      assert.ok(html.includes('"@type":"CollectionPage"'));
      assert.ok(html.includes("movie-card"));

      if (r === "/seleccion/criterion/") {
        assert.ok(html.includes("filter-pill is-active is-static"), "Selecciones deben tener píldora no clickable");
        assert.ok(!html.includes('href="/?_p=/criterion/"'), "Selecciones NO deben tener enlace a la SPA");
      } else if (r === "/pais/espana/") {
        assert.ok(html.includes('href="/?_p=/espana/"'), "Países deben tener enlace a la SPA");
      }
    }
  });

  test("Taxonomías: Purga de /genero/sci-fi/ invalida la caché", async () => {
    const purgeReq = new Request("https://videoclub.digital/internal/purge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer videoclub-purge-secret",
      },
      body: JSON.stringify({ slugs: ["sci-fi"] }),
    });
    const purgeRes = await worker.fetch(purgeReq, {}, defaultCtx);
    assert.equal(purgeRes.status, 200);
    const body = await purgeRes.json();
    assert.equal(body.success, true);
  });

  test("Estilos: /seo-card-v7.css se sirve desde Edge Memory con componentes oficiales de la SPA", async () => {
    const req = new Request("https://videoclub.digital/seo-card-v7.css");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/css; charset=utf-8");
    assert.ok(res.headers.get("Cache-Control").includes("immutable"));
    const css = await res.text();
    assert.ok(css.includes(".movie-card"), "Debe contener estilos de tarjeta oficial .movie-card");
    assert.ok(css.includes(".grid-container"), "Debe contener estilos de rejilla .grid-container");
    assert.ok(css.includes(".filter-pill"), "Debe contener estilos de píldora de filtro .filter-pill");
    assert.ok(css.includes(".person-card"), "Debe contener estilos de ficha VIP .person-card");
    assert.ok(css.includes(".bio-headline"), "Debe contener estilos de titular biográfico .bio-headline");
    assert.ok(css.includes("25!important"), "Debe contener z-index elevado para botones expand");
    assert.ok(css.includes("margin-left:auto"), "Debe contener alineación derecha para año y bandera");
  });

  test("Personas VIP en Raíz: /christopher-nolan/ responde 200 OK con Schema Person, foto y filmografía", async () => {
    const req = new Request("https://videoclub.digital/christopher-nolan/");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.ok(res.headers.get("Cache-Control").includes("s-maxage=604800"));
    assert.equal(res.headers.get("Link"), '</llms.txt>; rel="alternate"; type="text/markdown"');

    const html = await res.text();
    assert.ok(html.includes("Christopher Nolan"));
    assert.ok(html.includes('"@type":"Person"'));
    assert.ok(html.includes('"@type":"CollectionPage"'));
    assert.ok(html.includes('"@type":"ItemList"'));
    assert.ok(html.includes("person-card"), "Debe incluir la ficha VIP .person-card");
    assert.ok(html.includes("/vips/christopher-nolan.webp"), "Debe enlazar a la foto VIP de la persona");
    assert.ok(html.includes("Londres, UK"), "Debe mostrar el lugar de nacimiento");
    assert.ok(html.includes("Cineasta británico maestro de puestas en escena conceptuales"), "Debe mostrar el titular biográfico");
    assert.ok(html.includes("Apasionado del medio audiovisual"), "Debe mostrar la biografía");
    assert.ok(html.includes("filter-pill is-active"), "Debe incluir la píldora de filtro con el nombre");
    assert.ok(html.includes('href="/?_p=/director/christopher-nolan/"'), "La píldora debe enlazar al filtro en la SPA");
    assert.ok(html.includes('<link rel="canonical" href="https://videoclub.digital/christopher-nolan/" />'));
  });

  test("Personas VIP en Raíz: /harrison-ford/ responde 200 OK con Schema Person y filmografía", async () => {
    const req = new Request("https://videoclub.digital/harrison-ford/");
    const res = await worker.fetch(req, {}, defaultCtx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");

    const html = await res.text();
    assert.ok(html.includes("Harrison Ford"));
    assert.ok(html.includes('"@type":"Person"'));
    assert.ok(html.includes('"@type":"CollectionPage"'));
    assert.ok(html.includes("person-card"));
    assert.ok(html.includes("/vips/harrison-ford.webp"));
    assert.ok(html.includes("Chicago, EEUU"));
    assert.ok(html.includes("Héroe arquetípico del cine de aventuras"));
    assert.ok(html.includes('href="/?_p=/actor/harrison-ford/"'), "La píldora debe enlazar al filtro en la SPA");
    assert.ok(html.includes('<link rel="canonical" href="https://videoclub.digital/harrison-ford/" />'));
  });

  test("Normalización 301 en Raíz: /:vip-slug sin barra final redirige con 301 a /:vip-slug/", async () => {
    const dirReq = new Request("https://videoclub.digital/christopher-nolan");
    const dirRes = await worker.fetch(dirReq, {}, defaultCtx);
    assert.equal(dirRes.status, 301);
    assert.equal(dirRes.headers.get("Location"), "https://videoclub.digital/christopher-nolan/");

    const actReq = new Request("https://videoclub.digital/harrison-ford");
    const actRes = await worker.fetch(actReq, {}, defaultCtx);
    assert.equal(actRes.status, 301);
    assert.equal(actRes.headers.get("Location"), "https://videoclub.digital/harrison-ford/");
  });

  test("Aislamiento SPA: /actor/* y /director/* son rutas reservadas que entregan la SPA sin redirigir al SEO", async () => {
    const actReq = new Request("https://videoclub.digital/actor/harrison-ford/");
    const actRes = await worker.fetch(actReq, {}, defaultCtx);
    assert.equal(actRes.status, 200);
    const actHtml = await actRes.text();
    assert.ok(actHtml.includes("<title>Videoclub</title>"), "Debe entregar la SPA para /actor/*");

    const dirReq = new Request("https://videoclub.digital/director/christopher-nolan/");
    const dirRes = await worker.fetch(dirReq, {}, defaultCtx);
    assert.equal(dirRes.status, 200);
    const dirHtml = await dirRes.text();
    assert.ok(dirHtml.includes("<title>Videoclub</title>"), "Debe entregar la SPA para /director/*");
  });

  test("Descarte Instantáneo O(1): Slug no VIP delega al origen SPA sin consultar a Supabase", async () => {
    const nonVipSlug = "slug-no-vip-inventado";
    const initialCallsCount = fetchCalls.length;

    const req = new Request(`https://videoclub.digital/${nonVipSlug}/`);
    const res = await worker.fetch(req, {}, defaultCtx);

    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("<title>Videoclub</title>"), "Debe delegar al origen SPA");

    // Verificar que NINGUNA llamada a fetch haya ido a Supabase (/rest/v1/people)
    const newCalls = fetchCalls.slice(initialCallsCount);
    const calledSupabasePeople = newCalls.some(c => c.url.includes("/rest/v1/people"));
    assert.equal(calledSupabasePeople, false, "El descarte O(1) no debe contactar la base de datos para slugs no VIP");
  });

  test("Purga selectiva: /internal/purge invalida claves de personas y taxonomías", async () => {
    const purgeReq = new Request("https://videoclub.digital/internal/purge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer videoclub-purge-secret",
      },
      body: JSON.stringify({ slugs: ["christopher-nolan", "sci-fi"] }),
    });
    const purgeRes = await worker.fetch(purgeReq, {}, defaultCtx);
    assert.equal(purgeRes.status, 200);
    const body = await purgeRes.json();
    assert.equal(body.success, true);
    assert.equal(body.totalRequested, 2);
  });
});
