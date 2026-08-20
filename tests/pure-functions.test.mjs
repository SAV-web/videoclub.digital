import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let apiModule;
let seoModule;
let ratingModule;
let stateModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/api.ts",
    "/src/js/seo.ts",
    "/src/js/components/rating.ts",
    "/src/js/state.ts",
  ]);
  [apiModule, seoModule, ratingModule, stateModule] = viteEnv.modules;
});

after(async () => {
  await viteEnv?.close();
});

describe("api.ts (Normalización de Caché y Parámetros RPC)", () => {
  test("shapeRawMovieRow normaliza filas relacionales de Supabase y sincroniza estado de usuario", () => {
    stateModule.clearUserMovieData();

    const rawRow = {
      id: 99,
      title: "Pulp Fiction",
      original_title: "pulp fiction",
      type: "M",
      year_end: "2000",
      episodes: 10,
      countries: { name: "Estados Unidos", code: "US" },
      user_movie_entries: [{ rating: 9, on_watchlist: true }],
    };

    const shaped = apiModule.shapeRawMovieRow(rawRow);

    assert.strictEqual(shaped.id, 99);
    assert.strictEqual(shaped.original_title, null);
    assert.strictEqual(shaped.year_end, null);
    assert.strictEqual(shaped.episodes, null);
    assert.strictEqual(shaped.country, "Estados Unidos");
    assert.strictEqual(shaped.country_code, "US");
    assert.strictEqual(typeof shaped.last_synced_at, "number");
    assert.strictEqual("countries" in shaped, false);
    assert.strictEqual("user_movie_entries" in shaped, false);

    const userData = stateModule.getUserDataForMovie(99);
    assert.deepEqual(userData, { rating: 9, onWatchlist: true });
  });

  test("shapeRawMovieRow normaliza rigurosamente last_synced_at (ISO, null, number) y series", () => {
    // 1. last_synced_at como ISO string
    const isoRow = { id: 101, title: "Breaking Bad", type: "S", year_end: "2013", episodes: 62, last_synced_at: "2026-08-18T10:00:00.000Z" };
    const shapedIso = apiModule.shapeRawMovieRow(isoRow);
    assert.strictEqual(shapedIso.id, 101);
    assert.strictEqual(shapedIso.year_end, "2013");
    assert.strictEqual(shapedIso.episodes, 62);
    assert.strictEqual(typeof shapedIso.last_synced_at, "number");
    assert.strictEqual(shapedIso.last_synced_at, Math.floor(new Date("2026-08-18T10:00:00.000Z").getTime() / 1000));

    // 2. last_synced_at como null / undefined -> devuelve 0 numérico seguro
    const nullRow = { id: 102, title: "Sin Fecha", last_synced_at: null };
    const shapedNull = apiModule.shapeRawMovieRow(nullRow);
    assert.strictEqual(typeof shapedNull.last_synced_at, "number");
    assert.strictEqual(shapedNull.last_synced_at, 0);

    // 3. last_synced_at ya numérico
    const numRow = { id: 103, title: "Con Timestamp", last_synced_at: 1723975200 };
    const shapedNum = apiModule.shapeRawMovieRow(numRow);
    assert.strictEqual(shapedNum.last_synced_at, 1723975200);
  });



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

    const suspensoAverageState = ratingModule.getRatingPresentationState(
      { id: 1, title: "Test Suspenso", avg_rating: 4.8 },
      null,
      false
    );
    assert.strictEqual(suspensoAverageState.showUserRating, false);
    assert.strictEqual(suspensoAverageState.showAverageRating, false);
    assert.strictEqual(suspensoAverageState.showEmptyAverage, true);
  });
});

