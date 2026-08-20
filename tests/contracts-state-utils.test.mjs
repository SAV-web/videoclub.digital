import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

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
  test("normaliza texto para búsquedas sin acentos ni espacios extra", () => {
    assert.equal(utils.normalizeText("  Ácción Ñ  "), "accion n");
    assert.equal(utils.normalizeText("Per-Olav Sørensen"), "per-olav sorensen");
    assert.equal(utils.normalizeText("André Øvredal"), "andre ovredal");
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

  test("computePersonAgeInfo calcula correctamente la edad de personas vivas y fallecidas", () => {
    const living = utils.computePersonAgeInfo("1970-05-15", null);
    assert.equal(living.bYear, "1970");
    assert.equal(living.dYear, "");
    assert.equal(living.datesStr, "1970-");
    assert.ok(living.ageStr.startsWith("(") && !living.ageStr.includes("✝"));

    const deceased = utils.computePersonAgeInfo("1920-01-01", "1990-12-31");
    assert.equal(deceased.bYear, "1920");
    assert.equal(deceased.dYear, "1990");
    assert.equal(deceased.datesStr, "1920-1990");
    assert.equal(deceased.ageStr, "(70 ✝)");
  });

  test("applyLengthBasedClass aplica dinámicamente clases CSS por longitud de texto", () => {
    const mockEl = {
      className: "initial-class",
      classList: {
        classes: new Set(["initial-class"]),
        add(c) { this.classes.add(c); },
        has(c) { return this.classes.has(c); }
      }
    };

    const thresholds = [
      [40, "title-xl-long"],
      [25, "title-long"],
      [12, "title-medium"],
    ];

    utils.applyLengthBasedClass(mockEl, "Short", thresholds);
    assert.equal(mockEl.classList.has("title-medium"), false);

    utils.applyLengthBasedClass(mockEl, "A Medium Title!!", thresholds);
    assert.equal(mockEl.classList.has("title-medium"), true);

    utils.applyLengthBasedClass(mockEl, "Very Very Very Long Movie Title Exceeding Forty Characters", thresholds, true);
    assert.equal(mockEl.className, "");
    assert.equal(mockEl.classList.has("title-xl-long"), true);
  });
});

describe("normalización de filtros", () => {
  test("parseYearRangeRaw convierte cadenas de año en tuplas [min, max]", () => {
    assert.deepEqual(contracts.parseYearRangeRaw("1990-2010"), [1990, 2010]);
    assert.deepEqual(contracts.parseYearRangeRaw("1995"), [1995, 1995]);
    assert.deepEqual(contracts.parseYearRangeRaw(""), [constants.CONFIG.YEAR_MIN, constants.CONFIG.YEAR_MAX]);
    assert.deepEqual(contracts.parseYearRangeRaw(null), [constants.CONFIG.YEAR_MIN, constants.CONFIG.YEAR_MAX]);
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

describe("yearSlider.ts (DualRangeSlider)", () => {
  test("instancia el slider y gestiona valores min/max/pivot sin errores", () => {
    // Basic DOM mock for Node.js test environment
    const elementsCreated = [];
    const mockElement = (tag) => {
      const children = [];
      const listeners = {};
      const attrs = {};
      const style = {};
      const el = {
        tagName: tag.toUpperCase(),
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        style,
        innerHTML: "",
        appendChild: (child) => children.push(child),
        setAttribute: (k, v) => { attrs[k] = v; },
        removeAttribute: (k) => { delete attrs[k]; },
        getAttribute: (k) => attrs[k],
        addEventListener: (event, handler) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(handler);
        },
        getBoundingClientRect: () => ({ left: 0, width: 200, top: 0, height: 24 }),
        setPointerCapture: () => {},
        releasePointerCapture: () => {},
      };
      elementsCreated.push(el);
      return el;
    };

    globalThis.document = globalThis.document || {
      createElement: mockElement,
    };
    globalThis.window = globalThis.window || {
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const container = mockElement("div");
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
  });
});


