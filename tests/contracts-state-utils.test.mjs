import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { createServer } from "vite";

let server;
let constants;
let contracts;
let state;
let utils;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  [constants, contracts, state, utils] = await Promise.all([
    server.ssrLoadModule("/src/js/constants.js"),
    server.ssrLoadModule("/src/js/contracts.js"),
    server.ssrLoadModule("/src/js/state.js"),
    server.ssrLoadModule("/src/js/utils.js"),
  ]);
});

after(async () => {
  await server?.close();
});

beforeEach(() => {
  state.resetFiltersState();
  state.clearUserMovieData();
  state.setCurrentPage(1);
  state.setTotalMovies(0);
});

describe("utils.js", () => {
  test("normaliza texto para búsquedas sin acentos ni espacios extra", () => {
    assert.equal(utils.normalizeText("  Ácción Ñ  "), "accion n");
  });

  test("mapea payloads de películas al contrato de UI", () => {
    const movie = utils.mapMoviePayload({
      id: 1,
      title: "Dark",
      original_title: "Dark",
      year: 2017,
      year_end: 2020,
      type: "S",
      image: "dark-poster",
      actors: "Lisa Vicari, Louis Hofmann",
      directors: "Baran bo Odar",
      studios_list: "N,D",
      episodes: 26,
    });

    assert.equal(movie.isSeries, true);
    assert.equal(movie.displayYear, "2017-20");
    assert.equal(movie.displayOriginalTitle, "Dark");
    assert.equal(movie.hasOriginalTitle, false);
    assert.equal(movie.displayEpisodes, "26 x");
    assert.deepEqual(movie.parsedActors, ["Lisa Vicari", "Louis Hofmann"]);
    assert.deepEqual(movie.parsedDirectors, ["Baran bo Odar"]);
    assert.deepEqual(movie.studioList, ["N", "D"]);
    assert.equal(movie.posterUrl.endsWith("/dark-poster.webp"), true);
  });

  test("traduce AppError a mensajes accionables", () => {
    assert.equal(
      utils.getFriendlyErrorMessage(
        contracts.createAppError(contracts.ERROR_CODES.AUTH_REQUIRED, "Debes iniciar sesión.")
      ),
      "Debes iniciar sesión."
    );
    assert.equal(utils.getFriendlyErrorMessage({ name: "AbortError" }), null);
  });
});

describe("normalización de filtros", () => {
  test("aplica valores por defecto ante sort, mediaType y myList inválidos", () => {
    const filters = contracts.normalizeActiveFilters({
      sort: "drop table,desc",
      mediaType: "documentaries",
      myList: "favorites",
    });

    assert.equal(filters.sort, constants.DEFAULTS.SORT);
    assert.equal(filters.mediaType, constants.DEFAULTS.MEDIA_TYPE);
    assert.equal(filters.myList, null);
  });

  test("limita años y deduplica listas de filtros", () => {
    const filters = contracts.normalizeActiveFilters({
      year: `${constants.CONFIG.YEAR_MIN - 50}-${constants.CONFIG.YEAR_MAX + 50}`,
      excludedGenres: [" Drama ", "", "Drama"],
      excludedCountries: "España,,España,Francia",
    });

    assert.equal(filters.year, `${constants.CONFIG.YEAR_MIN}-${constants.CONFIG.YEAR_MAX}`);
    assert.deepEqual(filters.excludedGenres, ["Drama"]);
    assert.deepEqual(filters.excludedCountries, ["España", "Francia"]);
  });

  test("normaliza consultas de películas antes de tocar Supabase", () => {
    const query = contracts.normalizeMovieQuery({
      activeFilters: { searchTerm: "  Alien  ", sort: "invalid" },
      currentPage: "-5",
      pageSize: "0",
      requestCount: undefined,
      explicitOffset: "-1",
    });

    assert.equal(query.activeFilters.searchTerm, "Alien");
    assert.equal(query.activeFilters.sort, constants.DEFAULTS.SORT);
    assert.equal(query.currentPage, 1);
    assert.equal(query.pageSize, constants.CONFIG.ITEMS_PER_PAGE);
    assert.equal(query.requestCount, true);
    assert.equal(query.explicitOffset, null);
  });
});

describe("state.js", () => {
  test("setters mantienen el contrato de filtros", () => {
    assert.equal(state.setFilter("year", `${constants.CONFIG.YEAR_MIN - 1}-${constants.CONFIG.YEAR_MAX + 1}`, true), true);
    assert.equal(state.setFilter("excludedGenres", [" Terror ", "Terror", ""], true), true);
    state.setSort("unknown,desc");
    state.setMediaType("clips");

    const filters = state.getActiveFilters();
    assert.equal(filters.year, `${constants.CONFIG.YEAR_MIN}-${constants.CONFIG.YEAR_MAX}`);
    assert.deepEqual(filters.excludedGenres, ["Terror"]);
    assert.equal(filters.sort, constants.DEFAULTS.SORT);
    assert.equal(filters.mediaType, constants.DEFAULTS.MEDIA_TYPE);
  });

  test("setSearchTerm normaliza texto y limpia filtros incompatibles", () => {
    state.setFilter("genre", "Drama", true);
    state.setFilter("country", "España", true);
    const clearedFilters = state.setSearchTerm("  Matrix  ");

    const filters = state.getActiveFilters();
    assert.equal(clearedFilters, true);
    assert.equal(filters.searchTerm, "Matrix");
    assert.equal(filters.genre, null);
    assert.equal(filters.country, null);
  });

  test("sincroniza URL con estado seguro", () => {
    state.syncStateWithUrlParams("?p=-10&type=bad&sort=bad&list=true&year=1800-3000&exg=Drama,,Drama");

    const snapshot = state.getState();
    assert.equal(snapshot.currentPage, 1);
    assert.equal(snapshot.activeFilters.mediaType, constants.DEFAULTS.MEDIA_TYPE);
    assert.equal(snapshot.activeFilters.sort, constants.DEFAULTS.SORT);
    assert.equal(snapshot.activeFilters.myList, "mixed");
    assert.equal(snapshot.activeFilters.year, `${constants.CONFIG.YEAR_MIN}-${constants.CONFIG.YEAR_MAX}`);
    assert.deepEqual(snapshot.activeFilters.excludedGenres, ["Drama"]);
  });

  test("normaliza datos de usuario por película", () => {
    state.updateUserDataForMovie("42", { rating: "8", onWatchlist: true });
    state.updateUserDataForMovie("bad-id", { rating: 10, onWatchlist: true });

    assert.deepEqual(state.getUserDataForMovie(42), { rating: 8, onWatchlist: true });
    assert.equal(state.getUserDataForMovie("bad-id"), undefined);
  });
});
