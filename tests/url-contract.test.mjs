import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let constants;
let contracts;
let state;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/constants.ts",
    "/src/js/contracts.ts",
    "/src/js/state.ts",
  ]);
  [constants, contracts, state] = viteEnv.modules;
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

// =========================================================================================
// 1. SEGMENTOS DE RUTA (PATHNAME) — JERARQUÍA POSICIONAL Y LECTURA AGNÓSTICA AL ORDEN
// =========================================================================================
describe("1. Segmentos de ruta (pathname) — Jerarquía posicional y lectura agnóstica", () => {
  test("Persona (director/actor) tiene máxima prioridad y se envía como texto libre sin lista blanca", () => {
    // Director
    const pDir = contracts.parsePrettyPath("/director/christopher-nolan/");
    assert.equal(pDir.director, "christopher nolan");
    assert.equal(pDir.actor, null);
    assert.equal(pDir.genre, null);
    assert.equal(pDir.country, null);

    // Actor
    const pAct = contracts.parsePrettyPath("/actor/clint-eastwood/");
    assert.equal(pAct.actor, "clint eastwood");
    assert.equal(pAct.director, null);
    assert.equal(pAct.genre, null);
    assert.equal(pAct.country, null);
  });

  test("Género: reconoce exactamente los 21 slugs oficiales de GENRE_SLUG_MAP", () => {
    assert.equal(contracts.OFFICIAL_GENRES.length, 21, "Deben existir exactamente 21 géneros oficiales");

    const pSciFi = contracts.parsePrettyPath("/sci-fi/");
    assert.equal(pSciFi.genre, "Sci-Fi");

    const pDrama = contracts.parsePrettyPath("/drama/");
    assert.equal(pDrama.genre, "Drama");

    const pWestern = contracts.parsePrettyPath("/western/");
    assert.equal(pWestern.genre, "Western");
  });

  test("País y grupos regionales: reconoce países individuales y los grupos canónicos /latam/ y /nordic/", () => {
    // País individual
    const pEeuu = contracts.parsePrettyPath("/eeuu/");
    assert.equal(pEeuu.country, "EEUU");

    const pEsp = contracts.parsePrettyPath("/espana/");
    assert.equal(pEsp.country, "España");

    // Grupos regionales
    const pLatam = contracts.parsePrettyPath("/latam/");
    assert.equal(pLatam.country, "latam");

    const pNordic = contracts.parsePrettyPath("/nordic/");
    assert.equal(pNordic.country, "nordic");
  });

  test("Estudio o Selección: clasifica correctamente cada entidad en su diccionario de 1 segmento", () => {
    // Estudio (STUDIO_SLUGS: 15)
    const pWarner = contracts.parsePrettyPath("/warner/");
    assert.equal(pWarner.studio, "warner");
    assert.equal(pWarner.selection, null);

    // Selección (SELECTION_SLUGS: 10)
    const pCriterion = contracts.parsePrettyPath("/criterion/");
    assert.equal(pCriterion.selection, "criterion");
    assert.equal(pCriterion.studio, null);
  });

  test("Exclusiones de género y país: prefijo no- antepuesto al slug cerrado", () => {
    const pEx = contracts.parsePrettyPath("/no-animacion/no-eeuu/");
    assert.deepEqual(pEx.excludedGenres, ["Animación"]);
    assert.deepEqual(pEx.excludedCountries, ["EEUU"]);
    assert.equal(pEx.genre, null);
    assert.equal(pEx.country, null);
  });

  test("buildPrettyPath genera el orden canónico estricto: /{genero}/{pais}/{estudio-o-seleccion}/{no-genero}/{no-pais}/", () => {
    // Género + País + Estudio
    const url1 = contracts.buildPrettyPath({ genre: "Drama", country: "España", studio: "warner" });
    assert.equal(url1, "/drama/espana/warner/");

    // Género + País + Selección
    const url2 = contracts.buildPrettyPath({ genre: "Comedia", country: "Francia", selection: "criterion" });
    assert.equal(url2, "/comedia/francia/criterion/");

    // País + Selección (sin género positivo)
    const url3 = contracts.buildPrettyPath({ country: "Japón", selection: "criterion" });
    assert.equal(url3, "/japon/criterion/");

    // Catálogo vacío
    assert.equal(contracts.buildPrettyPath({}), "/");
  });

  test("parsePrettyPath es agnóstico al orden: clasifica por pertenencia a diccionario, no por posición", () => {
    // /eeuu/drama/ y /drama/eeuu/ deben producir exactamente el mismo resultado
    const pOrden1 = contracts.parsePrettyPath("/drama/eeuu/");
    const pOrden2 = contracts.parsePrettyPath("/eeuu/drama/");
    assert.deepEqual(pOrden1, pOrden2);
    assert.equal(pOrden1.genre, "Drama");
    assert.equal(pOrden1.country, "EEUU");

    // Selección antes de País y Género
    const pOrden3 = contracts.parsePrettyPath("/criterion/francia/comedia/");
    assert.equal(pOrden3.genre, "Comedia");
    assert.equal(pOrden3.country, "Francia");
    assert.equal(pOrden3.selection, "criterion");
  });
});

// =========================================================================================
// 2. PARÁMETROS DE QUERY STRING — Y SUS ALIAS RECONOCIDOS
// =========================================================================================
describe("2. Parámetros de query string y alias reconocidos", () => {
  test("year acepta años exactos ('1995'), rangos cerrados ('1990-2005') y abiertos ('2011-', '-1970')", () => {
    state.syncStateWithUrl("/", "?year=1995");
    assert.equal(state.getActiveFilters().year, "1995");

    state.syncStateWithUrl("/", "?year=1990-2005");
    assert.equal(state.getActiveFilters().year, "1990-2005");

    state.syncStateWithUrl("/", "?year=2011-");
    assert.equal(state.getActiveFilters().year, "2011-");

    state.syncStateWithUrl("/", "?year=-1970");
    assert.equal(state.getActiveFilters().year, "-1970");
  });

  test("sort acepta slugs descriptivos (votos-fa, nota-fa, recientes), valores técnicos crudos y alias 'orden'", () => {
    // Slugs descriptivos
    state.syncStateWithUrl("/", "?sort=nota-fa");
    assert.equal(state.getActiveFilters().sort, "fa_rating,desc");

    state.syncStateWithUrl("/", "?sort=votos-fa");
    assert.equal(state.getActiveFilters().sort, "fa_votes,desc");

    state.syncStateWithUrl("/", "?sort=recientes");
    assert.equal(state.getActiveFilters().sort, "year,desc");

    // Alias 'orden'
    state.syncStateWithUrl("/", "?orden=nota-imdb");
    assert.equal(state.getActiveFilters().sort, "imdb_rating,desc");

    // Valor técnico crudo directo
    state.syncStateWithUrl("/", "?sort=year,asc");
    assert.equal(state.getActiveFilters().sort, "year,asc");
  });

  test("search acepta texto libre y reconoce alias 'buscar' y 'q'", () => {
    state.syncStateWithUrl("/", "?search=matrix");
    assert.equal(state.getActiveFilters().searchTerm, "matrix");

    state.syncStateWithUrl("/", "?buscar=interstellar");
    assert.equal(state.getActiveFilters().searchTerm, "interstellar");

    state.syncStateWithUrl("/", "?q=pulp fiction");
    assert.equal(state.getActiveFilters().searchTerm, "pulp fiction");
  });

  test("type acepta exclusivamente all, movies y series", () => {
    state.syncStateWithUrl("/", "?type=movies");
    assert.equal(state.getActiveFilters().mediaType, "movies");

    state.syncStateWithUrl("/", "?type=series");
    assert.equal(state.getActiveFilters().mediaType, "series");

    state.syncStateWithUrl("/", "?type=all");
    assert.equal(state.getActiveFilters().mediaType, "all");
  });

  test("p acepta enteros positivos y reconoce el alias 'page'", () => {
    state.syncStateWithUrl("/", "?p=3");
    assert.equal(state.getCurrentPage(), 3);

    state.syncStateWithUrl("/", "?page=7");
    assert.equal(state.getCurrentPage(), 7);
  });

  test("exg y exc procesan listas separadas por comas", () => {
    state.syncStateWithUrl("/", "?exg=Terror,Comedia");
    assert.deepEqual(state.getActiveFilters().excludedGenres, ["Terror", "Comedia"]);

    state.syncStateWithUrl("/", "?exc=EEUU,Francia");
    assert.deepEqual(state.getActiveFilters().excludedCountries, ["EEUU", "Francia"]);
  });

  test("list acepta rated, watchlist, mixed y traduce 'true' a 'mixed'", () => {
    state.syncStateWithUrl("/", "?list=rated");
    assert.equal(state.getActiveFilters().myList, "rated");

    state.syncStateWithUrl("/", "?list=watchlist");
    assert.equal(state.getActiveFilters().myList, "watchlist");

    state.syncStateWithUrl("/", "?list=mixed");
    assert.equal(state.getActiveFilters().myList, "mixed");

    state.syncStateWithUrl("/", "?list=true");
    assert.equal(state.getActiveFilters().myList, "mixed");
  });
});

// =========================================================================================
// 3. REGLAS DE EXCLUSIVIDAD SEMÁNTICA
// =========================================================================================
describe("3. Reglas de exclusividad semántica", () => {
  test("Persona (director/actor) anula todo lo demás en URL retornando inmediatamente", () => {
    // Si la URL arranca con /director/... o /actor/..., parsePrettyPath retorna inmediatamente
    const pDir = contracts.parsePrettyPath("/director/christopher-nolan/");
    assert.equal(pDir.director, "christopher nolan");
    assert.equal(pDir.genre, null, "No debe procesar género");
    assert.equal(pDir.country, null, "No debe procesar país");
    assert.equal(pDir.studio, null, "No debe procesar estudio");
    assert.equal(pDir.selection, null, "No debe procesar selección");
    assert.deepEqual(pDir.excludedGenres, []);
    assert.deepEqual(pDir.excludedCountries, []);

    // Si alguien intentara combinar /director/... con otros segmentos, no se procesan como catálogo
    const pMixed = contracts.parsePrettyPath("/director/christopher-nolan/drama/");
    assert.equal(pMixed.genre, null, "El segmento 'drama' nunca se procesa como género");
    assert.equal(pMixed.country, null);

    const pAct = contracts.parsePrettyPath("/actor/tom-hanks/");
    assert.equal(pAct.actor, "tom hanks");
    assert.equal(pAct.genre, null, "No debe procesar género");
    assert.equal(pAct.country, null);
  });

  test("genre ↔ excludedGenres: la presencia de cualquier no-{género} anula el género positivo", () => {
    const parsed = contracts.parsePrettyPath("/drama/no-terror/");
    assert.equal(parsed.genre, null, "El positivo se anula al convivir con una exclusión");
    assert.deepEqual(parsed.excludedGenres, ["Terror"]);
  });

  test("country ↔ excludedCountries: la presencia de cualquier no-{país} anula el país positivo", () => {
    const parsed = contracts.parsePrettyPath("/espana/no-eeuu/");
    assert.equal(parsed.country, null, "El país positivo se anula ante cualquier exclusión de país");
    assert.deepEqual(parsed.excludedCountries, ["EEUU"]);
  });

  test("selection ↔ studio: son mutuamente excluyentes entre sí en el estado", () => {
    state.setFilter("studio", "warner", true);
    assert.equal(state.getActiveFilters().studio, "warner");
    assert.equal(state.getActiveFilters().selection, null);

    state.setFilter("selection", "criterion", true);
    assert.equal(state.getActiveFilters().selection, "criterion");
    assert.equal(state.getActiveFilters().studio, null, "Fijar selección debe vaciar estudio");

    state.setFilter("studio", "disney", true);
    assert.equal(state.getActiveFilters().studio, "disney");
    assert.equal(state.getActiveFilters().selection, null, "Fijar estudio debe vaciar selección");
  });

  test("director/actor por interacción en estado limpian catálogo, año y exclusiones", () => {
    // Estado previo cargado
    state.setFilter("genre", "Acción", true);
    state.setFilter("country", "España", true);
    state.setFilter("studio", "warner", true);
    state.setFilter("year", "1990-2000", true);
    state.setFilter("excludedGenres", ["Terror"], true);
    state.setFilter("excludedCountries", ["EEUU"], true);
    state.setMediaType("movies");

    // Fijar director limpia todo lo anterior
    state.setFilter("director", "Denis Villeneuve", true);
    const filters = state.getActiveFilters();

    assert.equal(filters.director, "Denis Villeneuve");
    assert.equal(filters.genre, null);
    assert.equal(filters.country, null);
    assert.equal(filters.studio, null);
    assert.equal(filters.selection, null);
    assert.equal(filters.year, null);
    assert.deepEqual(filters.excludedGenres, []);
    assert.deepEqual(filters.excludedCountries, []);
    assert.equal(filters.mediaType, constants.DEFAULTS.MEDIA_TYPE);
  });
});

// =========================================================================================
// 4. TABLA 4: URLS PROHIBIDAS, RECHAZADAS O NORMALIZADAS EXPLÍCITAMENTE
// =========================================================================================
describe("4. Tabla 4: URLs prohibidas, rechazadas o normalizadas explícitamente", () => {
  test("Fila 1: /ciencia-ficcion/ se rechaza e ignora en silencio porque el slug canónico real es 'sci-fi'", () => {
    // 'ciencia-ficcion' no existe en GENRE_SLUG_MAP; slugToGenre devuelve null
    assert.equal(contracts.slugToGenre("ciencia-ficcion"), null);

    const parsed = contracts.parsePrettyPath("/ciencia-ficcion/");
    assert.equal(parsed.genre, null, "Debe ignorarse silenciosamente sin registrar género");
  });

  test("Fila 2: /w/ (código de estudio legado de 1 letra) se descarta (studio: null) por no pertenecer a STUDIO_SLUGS", () => {
    // STUDIO_SLUGS contiene mnemónicos ('warner', 'disney'...), las letras únicas ya no son válidas
    assert.equal(contracts.STUDIO_SLUGS.has("w"), false);
    assert.equal(contracts.normalizeStudioCode("w"), null);

    const parsed = contracts.parsePrettyPath("/w/");
    assert.equal(parsed.studio, null, "El código de 1 letra debe descartarse a null");
  });

  test("Fila 3: ?sort=nota-negativa (valor inventado) cae al valor por defecto DEFAULTS.SORT", () => {
    assert.equal(contracts.normalizeSort("nota-negativa"), constants.DEFAULTS.SORT);

    state.syncStateWithUrl("/", "?sort=nota-negativa");
    assert.equal(state.getActiveFilters().sort, constants.DEFAULTS.SORT);
  });

  test("Fila 4: ?type=documentales (valor no contemplado en MEDIA_TYPES) cae a DEFAULTS.MEDIA_TYPE", () => {
    assert.equal(contracts.normalizeMediaType("documentales"), constants.DEFAULTS.MEDIA_TYPE);

    state.syncStateWithUrl("/", "?type=documentales");
    assert.equal(state.getActiveFilters().mediaType, constants.DEFAULTS.MEDIA_TYPE);
  });

  test("Fila 5: ?p=-3 o ?p=abc (números no positivos o no numéricos) caen a página 1", () => {
    assert.equal(contracts.normalizePageNumber("-3"), 1);
    assert.equal(contracts.normalizePageNumber("abc"), 1);
    assert.equal(contracts.normalizePageNumber(0), 1);

    state.syncStateWithUrl("/", "?p=-3");
    assert.equal(state.getCurrentPage(), 1);

    state.syncStateWithUrl("/", "?p=abc");
    assert.equal(state.getCurrentPage(), 1);
  });

  test("Fila 6: ?year=3000 y ?year=1800 se recortan a los límites reales CONFIG.YEAR_MIN y YEAR_MAX", () => {
    // Año 3000 recortado a YEAR_MAX (ej: 2026)
    const normalizedMax = contracts.normalizeYearRange("3000");
    assert.equal(normalizedMax, String(constants.CONFIG.YEAR_MAX));

    // Año 1800 recortado a YEAR_MIN (1900)
    const normalizedMin = contracts.normalizeYearRange("1800");
    assert.equal(normalizedMin, String(constants.CONFIG.YEAR_MIN));

    // Rango 1800-3000 cubre todo el espectro [1900, YEAR_MAX] -> se normaliza a null (sin filtro)
    assert.equal(contracts.normalizeYearRange("1800-3000"), null);

    // Rango recortado hacia el pasado: 1800-1950 -> -1950
    assert.equal(contracts.normalizeYearRange("1800-1950"), "-1950");

    // Rango recortado hacia el futuro: 2010-3000 -> 2010-
    assert.equal(contracts.normalizeYearRange("2010-3000"), "2010-");
  });

  test("Fila 7: /drama/no-drama/ (excluir el mismo género que se pide) anula el positivo conservando solo la exclusión", () => {
    const parsed = contracts.parsePrettyPath("/drama/no-drama/");
    assert.equal(parsed.genre, null, "El positivo debe ser anulado por la exclusión");
    assert.deepEqual(parsed.excludedGenres, ["Drama"], "Solo debe conservarse la exclusión");
  });

  test("Fila 8: ?list=true se traduce especialmente a 'mixed' antes de validar", () => {
    assert.equal(contracts.normalizeMyList("true"), "mixed");
    assert.equal(contracts.normalizeMyList(true), "mixed");

    state.syncStateWithUrl("/", "?list=true");
    assert.equal(state.getActiveFilters().myList, "mixed");
  });

  test("Fila 9: Segmentos con mayúsculas y espacios (/Drama/, /EEUU/) se toleran mediante .trim().toLowerCase()", () => {
    const pUpperGenre = contracts.parsePrettyPath("/Drama/");
    assert.equal(pUpperGenre.genre, "Drama");

    const pUpperCountry = contracts.parsePrettyPath("/EEUU/");
    assert.equal(pUpperCountry.country, "EEUU");

    const pSpaced = contracts.parsePrettyPath("/ drama /");
    assert.equal(pSpaced.genre, "Drama");
  });

  test("Fila 10: Segmentos que no coinciden con ningún diccionario (/estrenos/, typos) se ignoran en silencio sin ser comodines", () => {
    const parsed = contracts.parsePrettyPath("/estrenos/");
    assert.equal(parsed.genre, null);
    assert.equal(parsed.country, null);
    assert.equal(parsed.studio, null);
    assert.equal(parsed.selection, null);
    assert.equal(parsed.director, null);
    assert.equal(parsed.actor, null);
    assert.deepEqual(parsed.excludedGenres, []);
    assert.deepEqual(parsed.excludedCountries, []);

    // Con typo en género
    const pTypo = contracts.parsePrettyPath("/dramaa/");
    assert.equal(pTypo.genre, null, "El typo no debe inventar ni inferir géneros");
  });
});
