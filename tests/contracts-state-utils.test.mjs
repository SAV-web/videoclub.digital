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
      slug: "dark-2017",
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
    assert.equal(movie.posterUrl.endsWith("/dark-2017.webp"), true);
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

  test("formatYearRangeLabel formatea rangos abiertos para UI móvil", () => {
    assert.equal(utils.formatYearRangeLabel("2005-"), "desde 2005");
    assert.equal(utils.formatYearRangeLabel("-2005"), "hasta 2005");
    assert.equal(utils.formatYearRangeLabel("1990-2005"), "1990-2005");
    assert.equal(utils.formatYearRangeLabel("2005"), "2005");
    assert.equal(utils.formatYearRangeLabel(null), "");
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
  test("toSlug normaliza acentos, mayúsculas y caracteres especiales", () => {
    assert.equal(contracts.toSlug("Ciencia Ficción"), "ciencia-ficcion");
    assert.equal(contracts.toSlug("Acción"), "accion");
    assert.equal(contracts.toSlug("Bélico"), "belico");
    assert.equal(contracts.toSlug("España"), "espana");
    assert.equal(contracts.toSlug("Corea del Sur"), "corea-del-sur");
    assert.equal(contracts.toSlug("1001 Movies"), "1001-movies");
    assert.equal(contracts.toSlug("Daniel Day-Lewis"), "daniel-day-lewis");
    assert.equal(contracts.toSlug("Vincent D'Onofrio"), "vincent-d-onofrio");
    assert.equal(contracts.toSlug("Chris O'Dowd"), "chris-o-dowd");
    assert.equal(contracts.toSlug("Jean-Luc Godard"), "jean-luc-godard");
  });

  test("genreToSlug y countryToSlug aplican whitelist estricta (no fallback algorítmico)", () => {
    // Catálogo canónico oficial de 21 géneros (1:1 con slugs oficiales)
    const EXPECTED_GENRES = {
      "Acción": "accion",
      "Animación": "animacion",
      "Aventuras": "aventuras",
      "Bélico": "belico",
      "Biografía": "biografia",
      "Noir": "noir",
      "Comedia": "comedia",
      "Crimen": "crimen",
      "Deporte": "deporte",
      "Documental": "documental",
      "Drama": "drama",
      "Familiar": "familiar",
      "Fantasía": "fantasia",
      "Histórico": "historico",
      "Intriga": "intriga",
      "Música": "musica",
      "Romance": "romance",
      "Sci-Fi": "sci-fi",
      "Terror": "terror",
      "Thriller": "thriller",
      "Western": "western",
    };

    for (const [name, expectedSlug] of Object.entries(EXPECTED_GENRES)) {
      assert.equal(contracts.genreToSlug(name), expectedSlug, `Género: ${name}`);
      assert.equal(contracts.buildFilterUrl("genre", name), `/${expectedSlug}/`, `URL: ${name}`);
    }

    // Los aliases y etiquetas temáticas NO generan URLs (devuelven null en genreToSlug)
    assert.equal(contracts.genreToSlug("Cine negro"), null);
    assert.equal(contracts.genreToSlug("Action"), null);
    assert.equal(contracts.genreToSlug("adrenalina"), null);
    assert.equal(contracts.genreToSlug("dibujos"), null);
    assert.equal(contracts.genreToSlug("cgi"), null);
    assert.equal(contracts.genreToSlug("épico"), null);
    assert.equal(contracts.genreToSlug("guerra"), null);
    assert.equal(contracts.genreToSlug("Biopic"), null);
    assert.equal(contracts.genreToSlug("FilmNoir"), null);
    assert.equal(contracts.genreToSlug("humor"), null);
    assert.equal(contracts.genreToSlug("policiaco"), null);
    assert.equal(contracts.genreToSlug("Sport"), null);
    assert.equal(contracts.genreToSlug("Family"), null);
    assert.equal(contracts.genreToSlug("Musical"), null);
    assert.equal(contracts.genreToSlug("miedo"), null);
    assert.equal(contracts.genreToSlug("vaqueros"), null);

    // Géneros desconocidos fuera del catálogo → null (no genera segmento en URL)
    assert.equal(contracts.genreToSlug("Experimental"), null);
    assert.equal(contracts.genreToSlug("Peplum"), null);

    // Países conocidos → slug correcto
    assert.equal(contracts.countryToSlug("España"), "espana");
    assert.equal(contracts.countryToSlug("EEUU"), "eeuu");
    assert.equal(contracts.countryToSlug("Corea del Sur"), "corea-del-sur");
    assert.equal(contracts.countryToSlug("Kazajistán"), "kazajistan");
    assert.equal(contracts.countryToSlug("Mozambique"), "mozambique");

    // Países desconocidos / no catalogados → null (no genera segmento en URL)
    assert.equal(contracts.countryToSlug("Atlantida"), null);
    assert.equal(contracts.countryToSlug("Narnia"), null);

    // buildPrettyPath no genera segmento para valores fuera del mapa
    assert.equal(contracts.buildPrettyPath({ genre: "Experimental" }), "/");
    assert.equal(contracts.buildPrettyPath({ country: "Atlantida" }), "/");
    assert.equal(contracts.buildPrettyPath({ genre: "Drama", country: "Narnia" }), "/drama/");

    // parsePrettyPath: slug desconocido es ignorado silenciosamente
    const pUnknown = contracts.parsePrettyPath("/experimental/");
    assert.equal(pUnknown.genre, null);
    assert.equal(pUnknown.country, null);
    assert.equal(pUnknown.studio, null);
    assert.equal(pUnknown.selection, null);
  });

  test("buildPrettyPath construye rutas canónicas ordenadas y parsePrettyPath las resuelve", () => {
    // 1. Catálogo completo
    assert.equal(contracts.buildPrettyPath({}), "/");

    // 2. Solo género
    assert.equal(contracts.buildPrettyPath({ genre: "Drama" }), "/drama/");

    // 3. Género + País
    assert.equal(contracts.buildPrettyPath({ genre: "Acción", country: "España" }), "/accion/espana/");

    // 4. Género + País + Selección
    assert.equal(contracts.buildPrettyPath({ genre: "Drama", country: "EEUU", selection: "criterion" }), "/drama/eeuu/criterion/");

    // 5. Solo Estudio
    assert.equal(contracts.buildPrettyPath({ studio: "warner" }), "/warner/");

    // 6. Género + Estudio
    assert.equal(contracts.buildPrettyPath({ genre: "Sci-Fi", studio: "disney" }), "/sci-fi/disney/");

    // 7. Director (excluyente con catálogo)
    assert.equal(contracts.buildPrettyPath({ director: "Brian De Palma" }), "/director/brian-de-palma/");

    // 8. Actor (excluyente con catálogo)
    assert.equal(contracts.buildPrettyPath({ actor: "Clint Eastwood" }), "/actor/clint-eastwood/");

    // 9. Exclusiones de género y país
    assert.equal(contracts.buildPrettyPath({ excludedGenres: ["Animación"] }), "/no-animacion/");
    assert.equal(contracts.buildPrettyPath({ excludedGenres: ["Documental"] }), "/no-documental/");
    assert.equal(contracts.buildPrettyPath({ excludedCountries: ["EEUU"] }), "/no-eeuu/");
    assert.equal(contracts.buildPrettyPath({ excludedCountries: ["España"] }), "/no-espana/");
    assert.equal(contracts.buildPrettyPath({ genre: "Drama", excludedGenres: ["Animación"], excludedCountries: ["EEUU"] }), "/drama/no-animacion/no-eeuu/");

    // Parsing inverso semántico
    const p1 = contracts.parsePrettyPath("/drama/eeuu/criterion/");
    assert.equal(p1.genre, "Drama");
    assert.equal(p1.country, "EEUU");
    assert.equal(p1.selection, "criterion");
    assert.equal(p1.studio, null);

    const p2 = contracts.parsePrettyPath("/warner/");
    assert.equal(p2.studio, "warner");
    assert.equal(p2.genre, null);
    assert.equal(p2.country, null);
    assert.equal(p2.selection, null);

    const p3 = contracts.parsePrettyPath("/espana/accion/");
    assert.equal(p3.genre, "Acción");
    assert.equal(p3.country, "España");

    // Parsing de exclusiones
    const pEx1 = contracts.parsePrettyPath("/no-animacion/");
    assert.deepEqual(pEx1.excludedGenres, ["Animación"]);
    assert.deepEqual(pEx1.excludedCountries, []);

    const pEx2 = contracts.parsePrettyPath("/drama/no-eeuu/no-animacion/");
    assert.equal(pEx2.genre, "Drama");
    assert.deepEqual(pEx2.excludedCountries, ["EEUU"]);
    assert.deepEqual(pEx2.excludedGenres, ["Animación"]);

    // Soporte con subpath de GitHub Pages
    const p4 = contracts.parsePrettyPath("/videoclub.digital/comedia/francia/");
    assert.equal(p4.genre, "Comedia");
    assert.equal(p4.country, "Francia");

    // Parsing de personas
    const p5 = contracts.parsePrettyPath("/director/brian-de-palma/");
    assert.equal(p5.director, "brian de palma");
    assert.equal(p5.actor, null);
    assert.equal(p5.genre, null);

    const p6 = contracts.parsePrettyPath("/actor/clint-eastwood/");
    assert.equal(p6.actor, "clint eastwood");
    assert.equal(p6.director, null);

    // Parsing de los 21 slugs canónicos oficiales hacia su nombre oficial
    assert.equal(contracts.parsePrettyPath("/deporte/").genre, "Deporte");
    assert.equal(contracts.parsePrettyPath("/accion/").genre, "Acción");
    assert.equal(contracts.parsePrettyPath("/animacion/").genre, "Animación");
    assert.equal(contracts.parsePrettyPath("/musica/").genre, "Música");
    assert.equal(contracts.parsePrettyPath("/noir/").genre, "Noir");
    assert.equal(contracts.parsePrettyPath("/sci-fi/").genre, "Sci-Fi");
    assert.deepEqual(contracts.parsePrettyPath("/no-animacion/").excludedGenres, ["Animación"]);

    // Términos no canónicos/aliases en URL no se reconocen como géneros (pertenecen al buscador)
    assert.equal(contracts.parsePrettyPath("/sport/").genre, null);
    assert.equal(contracts.parsePrettyPath("/dibujos/").genre, null);
    assert.equal(contracts.parsePrettyPath("/humor/").genre, null);
    assert.equal(contracts.parsePrettyPath("/epico/").genre, null);
  });

  test("buildFilterUrl genera URLs canónicas y absolutas para enlaces de entidades", () => {
    assert.equal(contracts.buildFilterUrl("director", "Robert Zemeckis"), "/director/robert-zemeckis/");
    assert.equal(contracts.buildFilterUrl("actor", "Tom Hanks"), "/actor/tom-hanks/");
    assert.equal(contracts.buildFilterUrl("genre", "Comedia"), "/comedia/");
    assert.equal(contracts.buildFilterUrl("country", "España"), "/espana/");
    assert.equal(contracts.buildFilterUrl("studio", "warner"), "/warner/");
    assert.equal(contracts.buildFilterUrl("selection", "criterion"), "/criterion/");
    assert.equal(contracts.buildFilterUrl("year", "1994"), "/?year=1994");
  });

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
    assert.equal(state.getActiveFilters().director, null);
    assert.equal(state.getActiveFilters().actor, null);

    // Sin retrocompatibilidad: códigos de 1 letra desconocidos no se aplican
    assert.equal(contracts.normalizeStudioCode("W"), null);
    assert.equal(contracts.normalizeSelectionCode("C"), null);
  });

  test("stateToPrettyUrl y syncStateWithUrl sincronizan estado bidireccionalmente", () => {
    state.setFilter("genre", "Drama", true);
    state.setFilter("country", "EEUU", true);
    state.setFilter("selection", "criterion", true);
    state.setFilter("year", "1980-2007", true);
    state.setSort("fa_votes,desc");
    state.setCurrentPage(3);

    const { pathname, search } = state.stateToPrettyUrl(state.getActiveFilters(), state.getCurrentPage());
    assert.equal(pathname, "/drama/eeuu/criterion/");
    assert.equal(search, "year=1980-2007&sort=votos-fa&p=3");

    // Sincronización inversa desde slug amigable
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

    // Prueba con Rangos de Año Abiertos (year=2011- y year=-1970)
    state.resetFiltersState();
    state.setFilter("year", "2011-", true);
    const urlOpenFuture = state.stateToPrettyUrl(state.getActiveFilters(), 1);
    assert.equal(urlOpenFuture.search, "year=2011-");

    state.resetFiltersState();
    state.syncStateWithUrl("/", "?year=2011-");
    assert.equal(state.getActiveFilters().year, "2011-");

    state.resetFiltersState();
    state.setFilter("year", "-1970", true);
    const urlOpenPast = state.stateToPrettyUrl(state.getActiveFilters(), 1);
    assert.equal(urlOpenPast.search, "year=-1970");

    state.resetFiltersState();
    state.syncStateWithUrl("/", "?year=-1970");
    assert.equal(state.getActiveFilters().year, "-1970");

    // Prueba con Director
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
    // Prueba con Exclusiones
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

    // Prueba de exclusividad: si hay género positivo y exclusión de género, prevalece la última (/drama/no-animacion/ -> no-animacion anula drama)
    state.resetFiltersState();
    state.syncStateWithUrl("/drama/no-animacion/", "");
    assert.equal(state.getActiveFilters().genre, null);
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Animación"]);

    // Prueba de exclusividad: si hay país positivo y exclusión de país, prevalece la última (/espana/no-eeuu/ -> no-eeuu anula espana)
    state.resetFiltersState();
    state.syncStateWithUrl("/espana/no-eeuu/", "");
    assert.equal(state.getActiveFilters().country, null);
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU"]);

    // Prueba de todos los slugs amigables de ordenación
    const slugMap = {
      recientes: "year,desc",
      antiguas: "year,asc",
      "nota-fa": "fa_rating,desc",
      "nota-imdb": "imdb_rating,desc",
      "votos-fa": "fa_votes,desc",
      "votos-imdb": "imdb_votes,desc",
    };
    for (const [slug, internalValue] of Object.entries(slugMap)) {
      state.resetFiltersState();
      state.syncStateWithUrl("/", `?sort=${slug}`);
      assert.equal(state.getActiveFilters().sort, internalValue);
      const url = state.stateToPrettyUrl(state.getActiveFilters(), 1);
      assert.equal(url.search, `sort=${slug}`);
    }

    // Prueba con Búsqueda (?search= y fallbacks ?buscar= / ?q=)
    state.resetFiltersState();
    state.setSearchTerm("bestas");
    const searchUrl = state.stateToPrettyUrl(state.getActiveFilters(), 1);
    assert.equal(searchUrl.pathname, "/");
    assert.equal(searchUrl.search, "search=bestas");

    state.resetFiltersState();
    state.syncStateWithUrl("/", "?search=bestas");
    assert.equal(state.getActiveFilters().searchTerm, "bestas");

    state.resetFiltersState();
    state.syncStateWithUrl("/", "?buscar=bestas");
    assert.equal(state.getActiveFilters().searchTerm, "bestas");

    state.resetFiltersState();
    state.syncStateWithUrl("/", "?q=bestas");
    assert.equal(state.getActiveFilters().searchTerm, "bestas");
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
    state.updateUserDataForMovie("42", { rating: "8", onWatchlist: true });
    state.updateUserDataForMovie("bad-id", { rating: 10, onWatchlist: true });

    assert.deepEqual(state.getUserDataForMovie(42), { rating: 8, onWatchlist: true });
    assert.equal(state.getUserDataForMovie("bad-id"), undefined);
  });

  // ── canonicalizeCurrentUrl ──────────────────────────────────────────────────
  test("canonicalizeCurrentUrl normaliza la URL activa sin añadir historial", () => {
    // Utilidades de mock de window para entorno Node.js
    const makeWindowMock = (pathname, search = "") => {
      let _href = pathname + search;
      let _pathname = pathname;
      let _search = search;
      let lastReplaced = null;
      const win = {
        location: { get pathname() { return _pathname; }, get search() { return _search; }, hash: "" },
        history: {
          state: null,
          replaceState(_st, _title, url) { lastReplaced = url; _href = url; const [p, q] = url.split("?"); _pathname = p; _search = q ? `?${q}` : ""; }
        },
        getLastReplaced: () => lastReplaced,
      };
      return win;
    };

    const origWindow = global.window;
    try {
      // Caso 1: Segmentos invertidos /uk/drama/ -> /drama/uk/
      {
        const mock = makeWindowMock("/uk/drama/");
        global.window = mock;
        state.syncStateWithUrl("/uk/drama/", "");
        // Corregir window.location.pathname para que refleje la entrada original
        mock.location.pathname;
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/drama/uk/", "Caso 1: segmentos invertidos");
      }

      // Caso 2: Alias ?page=2 -> ?p=2
      {
        const mock = makeWindowMock("/", "?page=2");
        global.window = mock;
        state.syncStateWithUrl("/", "?page=2");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?p=2", "Caso 2: alias ?page=2 -> ?p=2");
      }

      // Caso 3: Sort interno ?sort=fa_rating,desc -> ?sort=nota-fa
      {
        const mock = makeWindowMock("/", "?sort=fa_rating%2Cdesc");
        global.window = mock;
        state.syncStateWithUrl("/", "?sort=fa_rating,desc");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?sort=nota-fa", "Caso 3: sort interno");
      }

      // Caso 4: ?q=bestas o ?buscar=bestas -> ?search=bestas
      {
        const mock = makeWindowMock("/", "?q=bestas");
        global.window = mock;
        state.syncStateWithUrl("/", "?q=bestas");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/?search=bestas", "Caso 4: ?q= -> ?search=");

        const mock2 = makeWindowMock("/", "?buscar=bestas");
        global.window = mock2;
        state.syncStateWithUrl("/", "?buscar=bestas");
        state.canonicalizeCurrentUrl();
        assert.equal(mock2.getLastReplaced(), "/?search=bestas", "Caso 4b: ?buscar= -> ?search=");
      }

      // Caso 5: Exclusión en QS ?exg=Animación -> /no-animacion/
      {
        const mock = makeWindowMock("/", "?exg=Animaci%C3%B3n");
        global.window = mock;
        state.syncStateWithUrl("/", "?exg=Animación");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/no-animacion/", "Caso 5: ?exg= -> /no-animacion/");
      }

      // Caso 6: Trailing slash ausente /drama/uk -> /drama/uk/
      {
        const mock = makeWindowMock("/drama/uk");
        global.window = mock;
        state.syncStateWithUrl("/drama/uk", "");
        state.canonicalizeCurrentUrl();
        assert.equal(mock.getLastReplaced(), "/drama/uk/", "Caso 6: trailing slash");
      }

      // Caso 7: URL ya canónica -> no se llama replaceState
      {
        const mock = makeWindowMock("/drama/uk/");
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


