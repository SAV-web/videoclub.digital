import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";
import { createMockDomElement, createMockWindow, setupGlobalDom } from "./helpers/mock-dom.mjs";

let viteEnv;
let constants;
let contracts;
let state;
let utils;
let yearSliderModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/constants.ts",
    "/src/js/contracts.ts",
    "/src/js/state.ts",
    "/src/js/utils.ts",
    "/src/js/components/yearSlider.ts",
  ]);
  [constants, contracts, state, utils, yearSliderModule] = viteEnv.modules;
});


after(async () => {
  await viteEnv?.close();
});

beforeEach(() => {
  state.resetFiltersState();
  state.clearUserMovieData();
  state.setCurrentPage(1);
  state.setTotalMovies(0);
});

describe("utils.js", () => {
  test("mapea payloads de películas al contrato de UI", () => {
    const movie = utils.mapMoviePayload({
      id: 1,
      title: "Dark",
      original_title: "Dark",
      year: 2017,
      year_end: 2020,
      type: "S",
      slug: "dark-2017",
      actors: "Lisa Vicari, Louis Hofmann",
      directors: "Baran bo Odar",
      studios_list: "N,D",
      episodes: 26,
    });

    assert.equal(movie.isSeries, true);
    assert.equal(movie.displayYear, "2017-20");
    assert.equal(movie.displayOriginalTitle, "Dark");
    assert.equal(movie.hasOriginalTitle, true);
    assert.equal(movie.displayEpisodes, "26 x");
    assert.deepEqual(movie.parsedActors, ["Lisa Vicari", "Louis Hofmann"]);
    assert.deepEqual(movie.parsedDirectors, ["Baran bo Odar"]);
    assert.deepEqual(movie.studioList, ["N", "D"]);
    assert.equal(movie.posterUrl.endsWith("/dark-2017.avif"), true);
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

  test("formatYearRangeLabel formatea rangos abiertos para UI móvil", () => {
    assert.equal(utils.formatYearRangeLabel("2005-"), "desde 2005");
    assert.equal(utils.formatYearRangeLabel("-2005"), "hasta 2005");
    assert.equal(utils.formatYearRangeLabel("1990-2005"), "1990-2005");
    assert.equal(utils.formatYearRangeLabel("2005"), "2005");
    assert.equal(utils.formatYearRangeLabel(null), "");
  });
});

describe("normalización de filtros", () => {
  test("parseYearRangeRaw convierte cadenas de año en tuplas [min, max]", () => {
    assert.deepEqual(contracts.parseYearRangeRaw("1990-2010"), [1990, 2010]);
    assert.deepEqual(contracts.parseYearRangeRaw("1995"), [1995, 1995]);
    assert.deepEqual(contracts.parseYearRangeRaw("2011-"), [2011, constants.CONFIG.YEAR_MAX]);
    assert.deepEqual(contracts.parseYearRangeRaw("-1970"), [constants.CONFIG.YEAR_MIN, 1970]);
    assert.deepEqual(contracts.parseYearRangeRaw(""), [constants.CONFIG.YEAR_MIN, constants.CONFIG.YEAR_MAX]);
    assert.deepEqual(contracts.parseYearRangeRaw(null), [constants.CONFIG.YEAR_MIN, constants.CONFIG.YEAR_MAX]);
  });

  test("normalizeYearRange produce formas canónicas y rangos abiertos limpios", () => {
    assert.equal(contracts.normalizeYearRange("2011-"), "2011-");
    assert.equal(contracts.normalizeYearRange(`2011-${constants.CONFIG.YEAR_MAX}`), "2011-");
    assert.equal(contracts.normalizeYearRange("-1970"), "-1970");
    assert.equal(contracts.normalizeYearRange("1900-1970"), "-1970");
    assert.equal(contracts.normalizeYearRange("1995"), "1995");
    assert.equal(contracts.normalizeYearRange("1990-2010"), "1990-2010");
    assert.equal(contracts.normalizeYearRange(`${constants.CONFIG.YEAR_MIN}-${constants.CONFIG.YEAR_MAX}`), null);
    assert.equal(contracts.normalizeYearRange(""), null);
  });

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
      year: "1990-2005",
      excludedGenres: [" Drama ", "", "Drama"],
      excludedCountries: "España,,España,Francia",
    });

    assert.equal(filters.year, "1990-2005");
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

describe("state.js y Pretty Paths", () => {
  test("setters mantienen el contrato de filtros y exclusividad mutua", () => {
    assert.equal(state.setFilter("year", "1990-2005", true), true);
    assert.equal(state.setFilter("excludedGenres", [" Terror ", "Terror", ""], true), true);
    state.setSort("unknown,desc");
    state.setMediaType("clips");

    const filters = state.getActiveFilters();
    assert.equal(filters.year, "1990-2005");
    assert.deepEqual(filters.excludedGenres, ["Terror"]);
    assert.equal(filters.sort, constants.DEFAULTS.SORT);
    assert.equal(filters.mediaType, constants.DEFAULTS.MEDIA_TYPE);

    // Exclusividad mutua entre selection y studio
    state.setFilter("studio", "warner", true);
    assert.equal(state.getActiveFilters().studio, "warner");
    assert.equal(state.getActiveFilters().selection, null);

    state.setFilter("selection", "criterion", true);
    assert.equal(state.getActiveFilters().selection, "criterion");
    assert.equal(state.getActiveFilters().studio, null);

    // toggleExcludedFilter limpia director y actor
    state.setFilter("director", "Christopher Nolan", true);
    assert.equal(state.getActiveFilters().director, "Christopher Nolan");
    state.toggleExcludedFilter("genre", "Terror");
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Terror"]);
    assert.equal(state.getActiveFilters().director, null);
    assert.equal(state.getActiveFilters().actor, null);

    state.setFilter("actor", "Leonardo DiCaprio", true);
    assert.equal(state.getActiveFilters().actor, "Leonardo DiCaprio");
    state.toggleExcludedFilter("country", "EEUU");
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU"]);
    // Director y Actor limpian year y viceversa
    state.setFilter("year", "1990-2005", true);
    assert.equal(state.getActiveFilters().year, "1990-2005");
    state.setFilter("director", "Christopher Nolan", true);
    assert.equal(state.getActiveFilters().year, null);
    assert.equal(state.getActiveFilters().director, "Christopher Nolan");

    state.setFilter("year", "1990-2005", true);
    assert.equal(state.getActiveFilters().year, "1990-2005");
    assert.equal(state.getActiveFilters().director, null);

    state.setFilter("actor", "Leonardo DiCaprio", true);
    assert.equal(state.getActiveFilters().year, null);
    assert.equal(state.getActiveFilters().actor, "Leonardo DiCaprio");

    // Exclusividad Estricta Directa: genre <-> excludedGenres
    state.resetFiltersState();
    state.setFilter("genre", "Terror", true);
    assert.equal(state.getActiveFilters().genre, "Terror");
    // Toggle de exclusión del MISMO género: anula el positivo homónimo y activa exclusión
    state.toggleExcludedFilter("genre", "Terror");
    assert.equal(state.getActiveFilters().genre, null);
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Terror"]);
    // Toggle de exclusión de OTRO género sobre positivo: anula el positivo y reemplaza exclusión
    state.setFilter("genre", "Drama", true);
    assert.equal(state.getActiveFilters().genre, "Drama");
    assert.deepEqual(state.getActiveFilters().excludedGenres, []); // Fijar positivo limpia exclusiones
    state.toggleExcludedFilter("genre", "Animación");
    assert.equal(state.getActiveFilters().genre, null);
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Animación"]);
    // setFilter directo con array excludedGenres anula positivo
    state.setFilter("genre", "Comedia", true);
    assert.equal(state.getActiveFilters().genre, "Comedia");
    state.setFilter("excludedGenres", ["Terror"], true);
    assert.equal(state.getActiveFilters().genre, null);
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Terror"]);

    // Exclusividad Estricta Directa: country <-> excludedCountries
    state.resetFiltersState();
    state.setFilter("country", "España", true);
    assert.equal(state.getActiveFilters().country, "España");
    state.toggleExcludedFilter("country", "España");
    assert.equal(state.getActiveFilters().country, null);
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["España"]);
    state.setFilter("country", "Francia", true);
    assert.equal(state.getActiveFilters().country, "Francia");
    assert.deepEqual(state.getActiveFilters().excludedCountries, []);
    state.setFilter("excludedCountries", ["EEUU"], true);
    assert.equal(state.getActiveFilters().country, null);
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU"]);

    // Sin retrocompatibilidad: códigos de 1 letra desconocidos no se aplican
    assert.equal(contracts.normalizeStudioCode("W"), null);
    assert.equal(contracts.normalizeSelectionCode("C"), null);
  });

  test("stateToPrettyUrl y syncStateWithUrl sincronizan estado bidireccionalmente", () => {
    // 1. Catálogo multidimensional
    state.setFilter("genre", "Drama", true);
    state.setFilter("country", "EEUU", true);
    state.setFilter("selection", "criterion", true);
    state.setFilter("year", "1980-2007", true);
    state.setSort("fa_votes,desc");
    state.setCurrentPage(3);

    const { pathname, search } = state.stateToPrettyUrl(state.getActiveFilters(), state.getCurrentPage());
    assert.equal(pathname, "/drama/eeuu/criterion/");
    assert.equal(search, "year=1980-2007&sort=votos-fa&p=3");

    // Sincronización inversa
    state.resetFiltersState();
    state.syncStateWithUrl("/drama/eeuu/criterion/", "?year=1980-2007&sort=votos-fa&p=3");

    const active = state.getActiveFilters();
    assert.equal(active.genre, "Drama");
    assert.equal(active.country, "EEUU");
    assert.equal(active.selection, "criterion");
    assert.equal(active.studio, null);
    assert.equal(active.year, "1980-2007");
    assert.equal(active.sort, "fa_votes,desc");
    assert.equal(state.getCurrentPage(), 3);

    // 2. Vista de Persona / Director
    state.resetFiltersState();
    state.setFilter("director", "Brian De Palma", true);
    state.setSort("fa_votes,desc");
    state.setCurrentPage(2);

    const dirUrl = state.stateToPrettyUrl(state.getActiveFilters(), state.getCurrentPage());
    assert.equal(dirUrl.pathname, "/director/brian-de-palma/");
    assert.equal(dirUrl.search, "sort=votos-fa&p=2");

    state.resetFiltersState();
    state.syncStateWithUrl("/director/brian-de-palma/", "?sort=votos-fa&p=2");
    assert.equal(state.getActiveFilters().director, "brian de palma");
    assert.equal(state.getActiveFilters().genre, null);
    assert.equal(state.getActiveFilters().country, null);

    // 3. Exclusiones puras
    state.resetFiltersState();
    state.setFilter("excludedGenres", ["Animación"], true);
    state.setFilter("excludedCountries", ["EEUU"], true);
    const exUrl = state.stateToPrettyUrl(state.getActiveFilters(), 1);
    assert.equal(exUrl.pathname, "/no-animacion/no-eeuu/");
    assert.equal(exUrl.search, "");

    state.resetFiltersState();
    state.syncStateWithUrl("/no-animacion/no-eeuu/", "");
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Animación"]);
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU"]);
  });

  test("toggleExcludedFilter y setFilter garantizan exclusividad mutua en el estado", () => {
    // toggleExcludedFilter anula SIEMPRE el género positivo activo (incluso si son distintos)
    state.resetFiltersState();
    state.setFilter("genre", "Drama", true);
    state.toggleExcludedFilter("genre", "Animación");
    assert.equal(state.getActiveFilters().genre, null);
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Animación"]);

    // toggleExcludedFilter anula SIEMPRE el país positivo activo
    state.resetFiltersState();
    state.setFilter("country", "España", true);
    state.toggleExcludedFilter("country", "EEUU");
    assert.equal(state.getActiveFilters().country, null);
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU"]);

    // setFilter positivo con género vacía SIEMPRE excludedGenres
    state.setFilter("genre", "Terror", true);
    assert.equal(state.getActiveFilters().genre, "Terror");
    assert.deepEqual(state.getActiveFilters().excludedGenres, []);

    // setFilter positivo con país vacía SIEMPRE excludedCountries
    state.setFilter("country", "Francia", true);
    assert.equal(state.getActiveFilters().country, "Francia");
    assert.deepEqual(state.getActiveFilters().excludedCountries, []);
  });

  test("setSearchTerm normaliza texto y limpia filtros incompatibles", () => {
    state.setFilter("genre", "Drama", true);
    state.setFilter("country", "España", true);
    state.setFilter("director", "Nolan", true);
    state.setFilter("actor", "DiCaprio", true);
    state.setFilter("excludedGenres", ["Terror"], true);

    const clearedFilters = state.setSearchTerm("  Matrix  ");

    const filters = state.getActiveFilters();
    assert.equal(clearedFilters, true);
    assert.equal(filters.searchTerm, "Matrix");
    assert.equal(filters.genre, null);
    assert.equal(filters.country, null);
    assert.equal(filters.director, null);
    assert.equal(filters.actor, null);
    assert.deepEqual(filters.excludedGenres, []);
  });

  test("getActiveFilterCount cuenta los filtros activos ignorando valores por defecto", () => {
    assert.equal(state.getActiveFilterCount(), 0);

    state.setFilter("genre", "Acción", true);
    assert.equal(state.getActiveFilterCount(), 1);

    state.setFilter("country", "España", true);
    assert.equal(state.getActiveFilterCount(), 2);

    state.setFilter("year", "1990-2000", true);
    assert.equal(state.getActiveFilterCount(), 3);

    state.resetFiltersState();
    assert.equal(state.getActiveFilterCount(), 0);
  });

  test("sincroniza URL con estado seguro", () => {
    state.syncStateWithUrl("/", "?p=-10&type=bad&sort=bad&list=true&year=1800-3000&exg=Drama,,Drama");

    const snapshot = state.getState();
    assert.equal(snapshot.currentPage, 1);
    assert.equal(snapshot.activeFilters.mediaType, constants.DEFAULTS.MEDIA_TYPE);
    assert.equal(snapshot.activeFilters.sort, constants.DEFAULTS.SORT);
    assert.equal(snapshot.activeFilters.myList, "mixed");
    assert.equal(snapshot.activeFilters.year, null);
    assert.deepEqual(snapshot.activeFilters.excludedGenres, ["Drama"]);
  });

  test("normaliza datos de usuario por película", () => {
    const rawEntry = contracts.normalizeUserMovieEntry({ rating: "8", onWatchlist: true });
    assert.equal(Object.isFrozen(rawEntry), true);

    state.updateUserDataForMovie("42", { rating: "8", onWatchlist: true });
    state.updateUserDataForMovie("bad-id", { rating: 10, onWatchlist: true });

    assert.deepEqual(state.getUserDataForMovie(42), { rating: 8, onWatchlist: true });
    assert.equal(state.getUserDataForMovie("bad-id"), undefined);
    assert.equal(state.getWatchlistCount(), 1);
  });

  // ── canonicalizeCurrentUrl ──────────────────────────────────────────────────
  test("canonicalizeCurrentUrl normaliza la URL activa sin añadir historial", () => {
    const origWindow = global.window;
    try {
      // Caso 1: Segmentos invertidos /uk/drama/ -> /drama/uk/
      {
        const mock = createMockWindow("/uk/drama/");
        global.window = mock;
        state.syncStateWithUrl("/uk/drama/", "");
        // Corregir window.location.pathname para que refleje la entrada original
        mock.location.pathname;
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/drama/uk/", "Caso 1: segmentos invertidos");
      }

      // Caso 2: Alias ?page=2 -> ?p=2
      {
        const mock = createMockWindow("/", "?page=2");
        global.window = mock;
        state.syncStateWithUrl("/", "?page=2");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?p=2", "Caso 2: alias ?page=2 -> ?p=2");
      }

      // Caso 3: Sort interno ?sort=fa_rating,desc -> ?sort=nota-fa
      {
        const mock = createMockWindow("/", "?sort=fa_rating%2Cdesc");
        global.window = mock;
        state.syncStateWithUrl("/", "?sort=fa_rating,desc");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?sort=nota-fa", "Caso 3: sort interno");
      }

      // Caso 4: ?q=bestas o ?buscar=bestas -> ?search=bestas
      {
        const mock = createMockWindow("/", "?q=bestas");
        global.window = mock;
        state.syncStateWithUrl("/", "?q=bestas");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?search=bestas", "Caso 4: ?q= -> ?search=");

        const mock2 = createMockWindow("/", "?buscar=bestas");
        global.window = mock2;
        state.syncStateWithUrl("/", "?buscar=bestas");
        state.canonicalizeCurrentUrl();
        assert.equal(mock2.getLastReplaced(), "/?search=bestas", "Caso 4b: ?buscar= -> ?search=");
      }

      // Caso 5: Exclusión en QS ?exg=Animación -> /no-animacion/
      {
        const mock = createMockWindow("/", "?exg=Animaci%C3%B3n");
        global.window = mock;
        state.syncStateWithUrl("/", "?exg=Animación");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/no-animacion/", "Caso 5: ?exg= -> /no-animacion/");
      }

      // Caso 6: Trailing slash ausente /drama/uk -> /drama/uk/
      {
        const mock = createMockWindow("/drama/uk");
        global.window = mock;
        state.syncStateWithUrl("/drama/uk", "");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/drama/uk/", "Caso 6: trailing slash");
      }

      // Caso 7: URL ya canónica -> no se llama replaceState
      {
        const mock = createMockWindow("/drama/uk/");
        global.window = mock;
        state.syncStateWithUrl("/drama/uk/", "");
        const result = state.canonicalizeCurrentUrl();
        assert.equal(result, false, "Caso 7: URL ya canónica no genera replaceState");
        assert.equal(mock.getLastReplaced(), null, "Caso 7: replaceState no llamado");
      }
    } finally {
      global.window = origWindow;
    }
  });
});

describe("yearSlider.ts (DualRangeSlider)", () => {
  test("instancia el slider y gestiona valores min/max/pivot sin errores", () => {
    const { teardown } = setupGlobalDom({ fallbackCreate: true });

    try {
      const container = createMockDomElement("div");
      const slider = new yearSliderModule.DualRangeSlider(container, {
        min: 1900,
        max: 2026,
        pivotYear: 2000,
        start: [1970, 2020],
      });

      assert.deepEqual(slider.get(), [1970, 2020]);

      slider.set([1980, 2010], false);
      assert.deepEqual(slider.get(), [1980, 2010]);

      // Test snap calculation: raw values before 2000 snap to decade
      assert.equal(slider["snapYear"](1934), 1930);
      assert.equal(slider["snapYear"](1936), 1940);
      assert.equal(slider["snapYear"](1998), 2000);
      // Values after 2000 snap to exact year
      assert.equal(slider["snapYear"](2003), 2003);
      assert.equal(slider["snapYear"](2021), 2021);

      // Test push & separation logic during slider interaction:
      // Arrastrar selector izquierdo a 1950 (estando el derecho en 1950) empuja el derecho a 1960
      slider.set([1930, 1950], false);
      slider["updateValuesForHandle"](0, 1950);
      assert.deepEqual(slider.get(), [1950, 1960]);

      // Arrastrar selector derecho a 1980 (estando el izquierdo en 1980) empuja el izquierdo a 1970
      slider.set([1980, 2000], false);
      slider["updateValuesForHandle"](1, 1980);
      assert.deepEqual(slider.get(), [1970, 1980]);

      // La entrada manual mediante campos de texto sigue permitiendo intervalos del mismo año (ej. 1950-1950)
      slider.set([1950, 1950], false);
      assert.deepEqual(slider.get(), [1950, 1950]);

      // Teardown / destroy limpia callbacks, DOM y clases
      slider.destroy();
      assert.equal(container.innerHTML, "");
      assert.equal(container.classList.contains("custom-year-slider"), false);
    } finally {
      teardown();
    }
  });
});

describe("contracts.ts - isAbortError", () => {
  test("identifica correctamente errores de aborto con o sin AbortSignal explícito", () => {
    const ac = new AbortController();
    ac.abort();
    assert.equal(contracts.isAbortError(new Error("cualquier error"), ac.signal), true);

    const activeAc = new AbortController();
    assert.equal(contracts.isAbortError(new Error("AbortError: The user aborted a request."), activeAc.signal), false);

    assert.equal(contracts.isAbortError({ name: "AbortError" }), true);
    assert.equal(contracts.isAbortError({ message: "The request was aborted" }), true);
    assert.equal(contracts.isAbortError({ message: "Network error" }), false);
  });
});



