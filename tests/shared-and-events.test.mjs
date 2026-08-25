import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let sharedConstants;
let spaConstants;
let sharedFormatters;
let utilsModule;
let stateModule;
let astroFormatModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/shared/constants.ts",
    "/src/js/constants.ts",
    "/src/shared/formatters.ts",
    "/src/js/utils.ts",
    "/src/js/state.ts",
    "/seo-site/src/lib/format.ts",
  ]);
  [
    sharedConstants,
    spaConstants,
    sharedFormatters,
    utilsModule,
    stateModule,
    astroFormatModule,
  ] = viteEnv.modules;
});

after(async () => {
  await viteEnv?.close();
});

describe("src/shared/formatters.ts (Formateadores y Reglas de Negocio Compartidas)", () => {
  test("getPosterUrl maneja el centinela '.' y genera URLs válidas", () => {
    assert.equal(sharedFormatters.getPosterUrl(null), "");
    assert.equal(sharedFormatters.getPosterUrl(""), "");
    assert.equal(sharedFormatters.getPosterUrl("."), "");
    assert.equal(
      sharedFormatters.getPosterUrl("poster123"),
      "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/poster123.webp"
    );
  });

  test("parseList divide listas por comas y elimina espacios en blanco", () => {
    assert.deepEqual(sharedFormatters.parseList(null), []);
    assert.deepEqual(sharedFormatters.parseList(""), []);
    assert.deepEqual(
      sharedFormatters.parseList("Acción, Drama,  Ciencia Ficción "),
      ["Acción", "Drama", "Ciencia Ficción"]
    );
    assert.deepEqual(
      sharedFormatters.parseList(", , Acción, ,"),
      ["Acción"]
    );
  });

  test("isSeriesType detecta correctamente series de televisión", () => {
    assert.equal(sharedFormatters.isSeriesType("S"), true);
    assert.equal(sharedFormatters.isSeriesType("series"), true);
    assert.equal(sharedFormatters.isSeriesType("SERIES"), true);
    assert.equal(sharedFormatters.isSeriesType("M"), false);
    assert.equal(sharedFormatters.isSeriesType("movie"), false);
    assert.equal(sharedFormatters.isSeriesType(null), false);
    assert.equal(sharedFormatters.isSeriesType(undefined), false);
    assert.equal(sharedFormatters.isSeriesType(""), false);
  });

  test("formatRuntime formatea minutos para películas y series", () => {
    assert.equal(sharedFormatters.formatRuntime(null, false), "Película");
    assert.equal(sharedFormatters.formatRuntime(null, true), "Serie TV");
    assert.equal(sharedFormatters.formatRuntime(0, false), "Película");
    assert.equal(sharedFormatters.formatRuntime(45, true), "45′");
    assert.equal(sharedFormatters.formatRuntime(50, false), "50 m");
    assert.equal(sharedFormatters.formatRuntime(120, false), "2 h");
    assert.equal(sharedFormatters.formatRuntime(135, false), "2 h 15 m");
    assert.equal(sharedFormatters.formatRuntime("135", false), "2 h 15 m");
  });

  test("formatYear formatea rangos de emisión para series y películas", () => {
    assert.equal(sharedFormatters.formatYear(1994, null, false), "1994");
    assert.equal(sharedFormatters.formatYear(2017, "2020", true), "2017-20");
    assert.equal(sharedFormatters.formatYear(2022, "current", true), "2022-");
    assert.equal(sharedFormatters.formatYear(2020, "present", true), "2020-");
    assert.equal(sharedFormatters.formatYear(2015, "actualidad", true), "2015-");
    assert.equal(sharedFormatters.formatYear(2018, "-", true), "2018-");
    assert.equal(sharedFormatters.formatYear(2019, "M", true), "2019 (M)");
    assert.equal(sharedFormatters.formatYear(null, null, false, "N/A"), "N/A");
  });

  test("getTitleLengthClass clasifica longitudes según umbrales de diseño", () => {
    assert.equal(sharedFormatters.getTitleLengthClass("Corto"), "");
    assert.equal(sharedFormatters.getTitleLengthClass("Título de veinte car"), "title-medium"); // len 20 (>15)
    assert.equal(sharedFormatters.getTitleLengthClass("Título con treinta caracteres."), "title-long"); // len 30 (>25)
    assert.equal(sharedFormatters.getTitleLengthClass("Título de exactamente cuarenta caracteres!"), "title-xl-long"); // len 42 (>35)
    assert.equal(sharedFormatters.getTitleLengthClass("Título de más de cincuenta caracteres para probar el umbral xxl"), "title-xxl-long"); // len 63 (>50)
    assert.equal(sharedFormatters.getTitleLengthClass("Un título descomunalmente largo que supera con creces los setenta caracteres de longitud"), "title-xxxl-long"); // len 88 (>70)
  });

  test("normalizeText normaliza diacríticos, acentos y caracteres internacionales exhaustivamente", () => {
    assert.equal(sharedFormatters.normalizeText(null), "");
    assert.equal(sharedFormatters.normalizeText(""), "");
    assert.equal(sharedFormatters.normalizeText("Árbol Película Único"), "arbol pelicula unico");
    assert.equal(sharedFormatters.normalizeText("Møller Hæder København"), "moller haeder kobenhavn");
    assert.equal(sharedFormatters.normalizeText("Groß Strauß Coeur Œil"), "gross strauss coeur oeil");
    assert.equal(sharedFormatters.normalizeText("Łódź Kraków Wałęsa"), "lodz krakow walesa");
    assert.equal(sharedFormatters.normalizeText("Þórður Garðar"), "thordur gardar");
    assert.equal(sharedFormatters.normalizeText("İstanbul Ħamrun"), "istanbul hamrun");
    assert.equal(sharedFormatters.normalizeText("L’Étranger ‘Matrix’ `Alien`"), "l'etranger 'matrix' 'alien'");
    assert.equal(sharedFormatters.normalizeText("  El    Padrino   (1972)  "), "el padrino (1972)");
  });

  test("calculateWeightedAverageRating calcula promedio ponderado FilmAffinity + IMDb", () => {
    // FA: 7.0 (+0.5 = 7.5), IMDb: 8.0 (-0.3 = 7.7) -> (7.5 + 7.7) / 2 = 7.6
    assert.equal(sharedFormatters.calculateWeightedAverageRating(7.0, 8.0), 7.6);
    assert.equal(sharedFormatters.calculateWeightedAverageRating(null, 8.0), null);
    assert.equal(sharedFormatters.calculateWeightedAverageRating(0, 0), null);
    assert.equal(sharedFormatters.calculateWeightedAverageRating(6.5, 6.5), 6.6); // (7.0 + 6.2)/2 = 6.6
  });

  test("calculateAverageStars e interpolación continua de 3 estrellas", () => {
    assert.equal(sharedFormatters.calculateAverageStars(null), 0);
    assert.equal(sharedFormatters.calculateAverageStars(5.0), 0); // <= 5.5 es 0
    assert.equal(sharedFormatters.calculateAverageStars(9.0), 3);
    assert.equal(sharedFormatters.calculateAverageStars(9.5), 3);
    // 7.25 está a mitad de camino entre 5.5 y 9.0 -> 1.5 estrellas
    assert.equal(sharedFormatters.calculateAverageStars(7.25), 1.5);
  });

  test("formatVotesUnified formatea votos según reglas por intervalos", () => {
    assert.equal(sharedFormatters.formatVotesUnified(null), "");
    assert.equal(sharedFormatters.formatVotesUnified(""), "");
    assert.equal(sharedFormatters.formatVotesUnified("   "), "");
    assert.equal(sharedFormatters.formatVotesUnified("sin votos"), "");
    assert.equal(sharedFormatters.formatVotesUnified(0), "");
    // Menos de 100: poner 100
    assert.equal(sharedFormatters.formatVotesUnified(1), "100");
    assert.equal(sharedFormatters.formatVotesUnified(42), "100");
    assert.equal(sharedFormatters.formatVotesUnified(99), "100");
    // De 100 a 999: redondear al 50
    assert.equal(sharedFormatters.formatVotesUnified(100), "100");
    assert.equal(sharedFormatters.formatVotesUnified(361), "350");
    assert.equal(sharedFormatters.formatVotesUnified(375), "400");
    assert.equal(sharedFormatters.formatVotesUnified(974), "950");
    // De 1000 a 9999: redondear al 100 con punto de millares
    assert.equal(sharedFormatters.formatVotesUnified(1000), "1.000");
    assert.equal(sharedFormatters.formatVotesUnified(1240), "1.200");
    assert.equal(sharedFormatters.formatVotesUnified(1260), "1.300");
    assert.equal(sharedFormatters.formatVotesUnified(9940), "9.900");
    // De 10000 a 99999: redondear al 500 con punto de millares
    assert.equal(sharedFormatters.formatVotesUnified(10000), "10.000");
    assert.equal(sharedFormatters.formatVotesUnified(12340), "12.500");
    assert.equal(sharedFormatters.formatVotesUnified(12750), "13.000");

    // De 100000 a 999999: redondear al 1000, truncar 000 y presentar con "k"
    assert.equal(sharedFormatters.formatVotesUnified(100000), "100 k");
    assert.equal(sharedFormatters.formatVotesUnified(261400), "261 k");
    assert.equal(sharedFormatters.formatVotesUnified(261800), "262 k");
    assert.equal(sharedFormatters.formatVotesUnified(999499), "999 k");
    assert.equal(sharedFormatters.formatVotesUnified("161,200 votos"), "161 k");
    // Desde 1000000: redondear al 1000, truncar al 10000 y presentar con "M"
    assert.equal(sharedFormatters.formatVotesUnified(1000000), "1 M");
    assert.equal(sharedFormatters.formatVotesUnified(1050000), "1,05 M");
    assert.equal(sharedFormatters.formatVotesUnified(1726000), "1,73 M");
    assert.equal(sharedFormatters.formatVotesUnified(2000000), "2 M");
    assert.equal(sharedFormatters.formatVotesUnified(2800000), "2,8 M");
  });


  test("preserveHyphenatedWords sustituye guiones en palabras por guiones no divisibles", () => {
    assert.equal(sharedFormatters.preserveHyphenatedWords(null), "");
    assert.equal(sharedFormatters.preserveHyphenatedWords(""), "");
    assert.equal(sharedFormatters.preserveHyphenatedWords("Sci-Fi"), "Sci\u2011Fi");
    assert.equal(sharedFormatters.preserveHyphenatedWords("Joseph Gordon-Levitt"), "Joseph Gordon\u2011Levitt");
    assert.equal(sharedFormatters.preserveHyphenatedWords("Daniel Day-Lewis"), "Daniel Day\u2011Lewis");
    assert.equal(sharedFormatters.preserveHyphenatedWords("2010 - 2015"), "2010 - 2015"); // guión aislado sin tocar
  });

  test("Equivalencia SPA vs SEO en formateadores unificados", () => {
    // 1. isSeriesType y isMovieSeries
    assert.equal(sharedFormatters.isSeriesType("S"), utilsModule.isMovieSeries("S"));
    assert.equal(sharedFormatters.isSeriesType("M"), utilsModule.isMovieSeries("M"));

    // 2. formatYear y formatYearRange
    assert.equal(sharedFormatters.formatYear(1994, null, false), utilsModule.formatYearRange(1994, null, false));
    assert.equal(sharedFormatters.formatYear(2017, "2020", true), utilsModule.formatYearRange(2017, "2020", true));

    // 3. formatRuntime
    assert.equal(sharedFormatters.formatRuntime(125, false), utilsModule.formatRuntime(125, false));
    assert.equal(sharedFormatters.formatRuntime(50, true), utilsModule.formatRuntime(50, true));

    // 4. normalizeText
    const testSample = "  L'Étranger (1942) - Møller & Strauß  ";
    assert.equal(sharedFormatters.normalizeText(testSample), utilsModule.normalizeText(testSample));

    // 5. formatVotesUnified
    assert.equal(sharedFormatters.formatVotesUnified(161200), utilsModule.formatVotesUnified(161200));

    // 6. computePersonAgeInfo
    assert.deepEqual(
      sharedFormatters.computePersonAgeInfo("1970-07-30", null),
      utilsModule.computePersonAgeInfo("1970-07-30", null)
    );
    assert.deepEqual(
      sharedFormatters.computePersonAgeInfo("1928-07-26", "1999-03-07"),
      utilsModule.computePersonAgeInfo("1928-07-26", "1999-03-07")
    );
  });

  test("Compatibilidad directa entre SPA y Astro (seo-site/src/lib/format.ts)", () => {
    // 1. getPosterUrl en Astro Pick<MovieRow, 'image'> vs SPA getPosterUrl(image)
    assert.equal(astroFormatModule.getPosterUrl({ image: "matrix_1999" }), sharedFormatters.getPosterUrl("matrix_1999"));
    assert.equal(astroFormatModule.getPosterUrl({ image: "." }), "");
    assert.equal(astroFormatModule.getPosterUrl({ image: "" }), "");

    // 2. parseList re-exportado en Astro
    assert.deepEqual(
      astroFormatModule.parseList("Drama, Thriller"),
      sharedFormatters.parseList("Drama, Thriller")
    );
  });
});

describe("src/js/state.ts (appEvents Lifecycle y Prevención de Fugas de Memoria)", () => {
  test("appEvents.on devuelve una función unsubscribe que elimina el listener", () => {
    let callCount = 0;
    const handler = () => { callCount++; };

    const unsubscribe = stateModule.appEvents.on("uiActionTriggered", handler);

    stateModule.appEvents.emit("uiActionTriggered");
    assert.equal(callCount, 1);

    stateModule.appEvents.emit("uiActionTriggered");
    assert.equal(callCount, 2);

    // Desuscribir listener
    unsubscribe();

    stateModule.appEvents.emit("uiActionTriggered");
    assert.equal(callCount, 2, "El handler no debe ejecutarse tras llamar a unsubscribe()");
  });

  test("appEvents.off elimina el listener explícitamente", () => {
    let callCount = 0;
    const handler = () => { callCount++; };

    stateModule.appEvents.on("userDataUpdated", handler);
    stateModule.appEvents.emit("userDataUpdated");
    assert.equal(callCount, 1);

    stateModule.appEvents.off("userDataUpdated", handler);
    stateModule.appEvents.emit("userDataUpdated");
    assert.equal(callCount, 1);
  });

  test("appEvents.clear vacía todos los listeners de un evento específico sin afectar a otros", () => {
    let sidebarCount = 0;
    let userCount = 0;
    stateModule.appEvents.on("updateSidebarUI", () => { sidebarCount++; });
    stateModule.appEvents.on("userDataUpdated", () => { userCount++; });

    stateModule.appEvents.emit("updateSidebarUI");
    stateModule.appEvents.emit("userDataUpdated");
    assert.equal(sidebarCount, 1);
    assert.equal(userCount, 1);

    stateModule.appEvents.clear("updateSidebarUI");
    stateModule.appEvents.emit("updateSidebarUI");
    stateModule.appEvents.emit("userDataUpdated");
    assert.equal(sidebarCount, 1, "updateSidebarUI no debe recibir más eventos tras clear()");
    assert.equal(userCount, 2, "userDataUpdated debe seguir recibiendo eventos");
  });

  test("appEvents.clearAll vacía el registro completo de listeners", () => {
    let count = 0;
    stateModule.appEvents.on("filtersReset", () => { count++; });
    stateModule.appEvents.on("userDataUpdated", () => { count++; });

    stateModule.appEvents.clearAll();
    stateModule.appEvents.emit("filtersReset", {});
    stateModule.appEvents.emit("userDataUpdated");
    assert.equal(count, 0);
  });
});

describe("src/shared/constants.ts (Fuente Única de Verdad - SSOT)", () => {
  test("SHARED_CONFIG mantiene los contratos reales del negocio", () => {
    assert.equal(sharedConstants.SHARED_CONFIG.MAX_ACTIVE_FILTERS, 20);
    assert.equal(sharedConstants.SHARED_CONFIG.YEAR_MAX, new Date().getFullYear());
    assert.equal(sharedConstants.SHARED_CONFIG.YEAR_MIN, 1900);
    assert.equal(typeof sharedConstants.PROFILE_BASE_URL, "string");
    assert.ok(sharedConstants.PROFILE_BASE_URL.includes("/vips/"));
    assert.ok(sharedConstants.POSTER_BASE_URL.includes("/posters/"));
  });

  test("spaConstants re-exporta exactamente las mismas referencias del SSOT", () => {
    assert.strictEqual(spaConstants.CONFIG.MAX_ACTIVE_FILTERS, sharedConstants.SHARED_CONFIG.MAX_ACTIVE_FILTERS);
    assert.strictEqual(spaConstants.CONFIG.YEAR_MAX, sharedConstants.SHARED_CONFIG.YEAR_MAX);
    assert.strictEqual(spaConstants.CONFIG.YEAR_MIN, sharedConstants.SHARED_CONFIG.YEAR_MIN);
    assert.strictEqual(spaConstants.PROFILE_BASE_URL, sharedConstants.PROFILE_BASE_URL);
    assert.strictEqual(spaConstants.POSTER_BASE_URL, sharedConstants.POSTER_BASE_URL);
    assert.strictEqual(spaConstants.IGNORED_ACTORS, sharedConstants.IGNORED_ACTORS);
    assert.strictEqual(spaConstants.REGIONAL_GROUPS, sharedConstants.REGIONAL_GROUPS);
    assert.strictEqual(spaConstants.TEXT_FILTER_KEYS, sharedConstants.TEXT_FILTER_KEYS);
    assert.strictEqual(spaConstants.STUDIO_DATA, sharedConstants.STUDIO_DATA);
  });

  test("TEXT_FILTER_KEYS define exactamente las taxonomías textuales requeridas", () => {
    assert.ok(sharedConstants.TEXT_FILTER_KEYS instanceof Set);
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("searchTerm"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("genre"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("country"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("director"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("actor"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("studio"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("selection"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("excludedGenres"));
    assert.ok(sharedConstants.TEXT_FILTER_KEYS.has("excludedCountries"));
  });

  test("STUDIO_DATA contiene mapeos canónicos de estudios cinematográficos", () => {
    assert.ok(sharedConstants.STUDIO_DATA.disney);
    assert.equal(sharedConstants.STUDIO_DATA.disney.title, "Disney");
    assert.ok(sharedConstants.STUDIO_DATA.warner);
    assert.equal(sharedConstants.STUDIO_DATA.warner.title, "Warner Bros.");
    assert.ok(sharedConstants.STUDIO_DATA.universal);
    assert.equal(sharedConstants.STUDIO_DATA.universal.title, "Universal");
    assert.ok(sharedConstants.STUDIO_DATA.netflix);
    assert.equal(sharedConstants.STUDIO_DATA.netflix.title, "Netflix");
  });


  test("IGNORED_ACTORS incluye etiquetas de animación, documental y créditos en inglés", () => {
    const list = sharedConstants.IGNORED_ACTORS;
    assert.ok(list.includes("(a)"));
    assert.ok(list.includes("(A)"));
    assert.ok(list.includes("animación"));
    assert.ok(list.includes("animation"));
    assert.ok(list.includes("documental"));
    assert.ok(list.includes("documentary"));
    assert.ok(sharedConstants.IGNORED_ACTORS_SET.has("animacion"));
  });

  test("REGIONAL_GROUPS contiene códigos ISO de país para filtrado en PostgreSQL", () => {
    assert.ok(sharedConstants.REGIONAL_GROUPS.NORDICS);
    assert.ok(sharedConstants.REGIONAL_GROUPS.NORDICS.codes.includes("DK"));
    assert.ok(sharedConstants.REGIONAL_GROUPS.NORDICS.codes.includes("NO"));
    assert.ok(sharedConstants.REGIONAL_GROUPS.LATAM);
    assert.ok(sharedConstants.REGIONAL_GROUPS.LATAM.codes.includes("AR"));
    assert.ok(sharedConstants.REGIONAL_GROUPS.LATAM.codes.includes("MX"));
  });
});
