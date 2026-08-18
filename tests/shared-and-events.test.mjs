import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let sharedConstants;
let sharedFormatters;
let stateModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/shared/constants.ts",
    "/src/shared/formatters.ts",
    "/src/js/state.ts",
  ]);
  [sharedConstants, sharedFormatters, stateModule] = viteEnv.modules;
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
  });

  test("isSeriesType detecta correctamente series de televisión", () => {
    assert.equal(sharedFormatters.isSeriesType("S"), true);
    assert.equal(sharedFormatters.isSeriesType("series"), true);
    assert.equal(sharedFormatters.isSeriesType("M"), false);
    assert.equal(sharedFormatters.isSeriesType("movie"), false);
    assert.equal(sharedFormatters.isSeriesType(null), false);
  });

  test("formatRuntime formatea minutos para películas y series", () => {
    assert.equal(sharedFormatters.formatRuntime(null, false), "Película");
    assert.equal(sharedFormatters.formatRuntime(null, true), "Serie TV");
    assert.equal(sharedFormatters.formatRuntime(45, true), "45 min/ep");
    assert.equal(sharedFormatters.formatRuntime(50, false), "50 m");
    assert.equal(sharedFormatters.formatRuntime(120, false), "2 h");
    assert.equal(sharedFormatters.formatRuntime(135, false), "2 h 15 m");
  });

  test("formatYear formatea rangos de emisión para series y películas", () => {
    assert.equal(sharedFormatters.formatYear(1994, null, false), "1994");
    assert.equal(sharedFormatters.formatYear(2017, "2020", true), "2017-20");
    assert.equal(sharedFormatters.formatYear(2022, "current", true), "2022-");
  });

  test("getTitleLengthClass clasifica longitudes según umbrales de diseño", () => {
    assert.equal(sharedFormatters.getTitleLengthClass("Corto"), "");
    assert.equal(sharedFormatters.getTitleLengthClass("Título de veinte car"), "title-medium"); // len 20 (>15)
    assert.equal(sharedFormatters.getTitleLengthClass("Título con treinta caracteres."), "title-long"); // len 30 (>25)
    assert.equal(sharedFormatters.getTitleLengthClass("Título de exactamente cuarenta caracteres!"), "title-xl-long"); // len 42 (>35)
    assert.equal(sharedFormatters.getTitleLengthClass("Título de más de cincuenta caracteres para probar el umbral xxl"), "title-xxl-long"); // len 63 (>50)
    assert.equal(sharedFormatters.getTitleLengthClass("Un título descomunalmente largo que supera con creces los setenta caracteres de longitud"), "title-xxxl-long"); // len 88 (>70)
  });


  test("calculateWeightedAverageRating calcula promedio ponderado FilmAffinity + IMDb", () => {
    // FA: 7.0 (+0.5 = 7.5), IMDb: 8.0 (-0.3 = 7.7) -> (7.5 + 7.7) / 2 = 7.6
    assert.equal(sharedFormatters.calculateWeightedAverageRating(7.0, 8.0), 7.6);
    assert.equal(sharedFormatters.calculateWeightedAverageRating(null, 8.0), null);
    assert.equal(sharedFormatters.calculateWeightedAverageRating(0, 0), null);
  });

  test("calculateAverageStars e interpolación continua de 3 estrellas", () => {
    assert.equal(sharedFormatters.calculateAverageStars(null), 0);
    assert.equal(sharedFormatters.calculateAverageStars(5.0), 0); // <= 5.5 es 0
    assert.equal(sharedFormatters.calculateAverageStars(9.0), 3);
    assert.equal(sharedFormatters.calculateAverageStars(9.5), 3);
    // 7.25 está a mitad de camino entre 5.5 y 9.0 -> 1.5 estrellas
    assert.equal(sharedFormatters.calculateAverageStars(7.25), 1.5);
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
});
