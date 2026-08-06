import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createServer } from "vite";

let server;
let apiModule;
let seoModule;
let ratingModule;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  [apiModule, seoModule, ratingModule] = await Promise.all([
    server.ssrLoadModule("/src/js/api.ts"),
    server.ssrLoadModule("/src/js/seo.ts"),
    server.ssrLoadModule("/src/js/components/rating.ts"),
  ]);
});

after(async () => {
  await server?.close();
});

describe("api.ts (Normalización de Caché y Parámetros RPC)", () => {
  test("createCanonicalCacheKey normaliza claves desordenadas y elimina campos nulos", () => {
    const key1 = apiModule.createCanonicalCacheKey({ actor: "Tom Hanks", year: "2010-2020", genre: null }, 1, 42);
    const key2 = apiModule.createCanonicalCacheKey({ year: "2010-2020", actor: "tom hanks" }, 1, 42);
    
    assert.strictEqual(key1, key2);
  });

  test("parseYearRange desboundea 1900 e incluye años previos", () => {
    const rangeMin = apiModule.parseYearRange("1900-2026");
    assert.strictEqual(rangeMin.start, null);
    assert.strictEqual(rangeMin.end, null);

    const rangeCustom = apiModule.parseYearRange("1950-1980");
    assert.strictEqual(rangeCustom.start, 1950);
    assert.strictEqual(rangeCustom.end, 1980);
  });

  test("stateToRpcParams traduce estado de cliente a contrato PostgreSQL", () => {
    const rpcParams = apiModule.stateToRpcParams(
      { actor: "Quentin Tarantino", mediaType: "movies", sort: "year,desc" },
      2,
      42,
      true,
      null
    );

    assert.strictEqual(rpcParams.actor_name, "Quentin Tarantino");
    assert.strictEqual(rpcParams.media_type, "movies");
    assert.strictEqual(rpcParams.sort_field, "year");
    assert.strictEqual(rpcParams.sort_direction, "desc");
    assert.strictEqual(rpcParams.page_limit, 42);
    assert.strictEqual(rpcParams.page_offset, 42);
  });
});

describe("seo.ts (Metadatos SEO y Esquemas JSON-LD)", () => {
  test("buildSeoTitle genera títulos limpios según tipo de medio y filtros", () => {
    const resMovie = seoModule.buildSeoTitle({ genre: "accion", mediaType: "movies" });
    assert.ok(resMovie.pageTitle.includes("Películas de Accion"));

    const resSeries = seoModule.buildSeoTitle({ genre: "drama", mediaType: "series" });
    assert.ok(resSeries.pageTitle.includes("Series de Drama"));

    const resSearch = seoModule.buildSeoTitle({ searchTerm: "Matrix" });
    assert.ok(resSearch.pageTitle.includes('Resultados para "Matrix"'));
  });

  test("buildItemListSchema genera JSON-LD válido para Google Rich Snippets", () => {
    const mockMovies = [
      { id: 1, title: "Inception", year: 2010 },
      { id: 2, title: "Interstellar", year: 2014 }
    ];
    const schema = seoModule.buildItemListSchema(mockMovies, 2, "https://videoclub.digital");

    assert.strictEqual(schema["@type"], "ItemList");
    assert.strictEqual(schema.numberOfItems, 2);
    assert.strictEqual(schema.itemListElement[0].item.name, "Inception");
    assert.strictEqual(schema.itemListElement[1].item.name, "Interstellar");
  });

  test("buildBreadcrumbSchema genera la estructura de migas de pan correcta", () => {
    const schema = seoModule.buildBreadcrumbSchema({ genre: "Ciencia Ficción" });

    assert.strictEqual(schema["@type"], "BreadcrumbList");
    assert.strictEqual(schema.itemListElement.length, 3);
    assert.strictEqual(schema.itemListElement[2].name, "Ciencia Ficción");
  });

  test("buildSeoDescription genera meta descripción dentro del límite de 160 caracteres", () => {
    const desc = seoModule.buildSeoDescription("Películas", { genre: "Acción", year: "1990-2000" }, [{ title: "Matrix" }]);
    assert.ok(desc.length <= 160);
    assert.ok(desc.includes("Catálogo de películas"));
  });
});

describe("rating.ts (Cálculo Visual y Estados de Valoración)", () => {
  test("calculateUserStars traduce nota numérica (0-10) a niveles de 1 a 3 estrellas", () => {
    assert.strictEqual(ratingModule.calculateUserStars(2), 0); // Suspenso (2)
    assert.strictEqual(ratingModule.calculateUserStars(5), 1); // Aprobado (5)
    assert.strictEqual(ratingModule.calculateUserStars(7), 2); // Notable (7)
    assert.strictEqual(ratingModule.calculateUserStars(9), 3); // Sobresaliente (9)
    assert.strictEqual(ratingModule.calculateUserStars(null), 0);
  });

  test("calculateAverageStars calcula promedio ponderado de 3 estrellas", () => {
    assert.strictEqual(ratingModule.calculateAverageStars(9.0), 3);
    assert.strictEqual(ratingModule.calculateAverageStars(null), 0);
  });

  test("getRatingPresentationState calcula el estado visual para tarjeta según sesión y promedio", () => {
    const loggedOutState = ratingModule.getRatingPresentationState(
      { id: 1, title: "Test", avg_rating: 8.5 },
      null,
      false
    );
    assert.strictEqual(loggedOutState.showUserRating, false);
    assert.strictEqual(loggedOutState.showAverageRating, true);

    const loggedInState = ratingModule.getRatingPresentationState(
      { id: 1, title: "Test", avg_rating: 8.5 },
      { rating: 9, onWatchlist: false },
      true
    );
    assert.strictEqual(loggedInState.showUserRating, true);
    assert.strictEqual(loggedInState.showAverageRating, false);
  });
});
