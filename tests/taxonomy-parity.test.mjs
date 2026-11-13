import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let sharedConstants;
let sharedSlugs;
let taxonomyTypes;

describe("Paridad de Taxonomías: Edge SSR (taxonomy-types.js) vs SSOT (src/shared/)", () => {
  before(async () => {
    viteEnv = await startViteSsrServer([
      "/src/shared/constants.ts",
      "/src/shared/slugs.ts",
      "/cloudflare/seo/taxonomy-types.js",
    ]);
    [sharedConstants, sharedSlugs, taxonomyTypes] = viteEnv.modules;
  });

  after(async () => {
    await viteEnv?.close();
  });

  test("Géneros: GENRE_MAP (Edge) y GENRE_SLUG_MAP (SSOT) tienen exactamente los mismos 21 géneros", () => {
    const edgeGenreKeys = Object.keys(taxonomyTypes.GENRE_MAP).sort();
    const sharedGenreKeys = Object.keys(sharedSlugs.GENRE_SLUG_MAP).sort();

    assert.equal(edgeGenreKeys.length, 21, "Deben existir exactamente 21 géneros");
    assert.deepEqual(edgeGenreKeys, sharedGenreKeys, "Las claves de slug deben coincidir exactamente");

    for (const [slug, item] of Object.entries(taxonomyTypes.GENRE_MAP)) {
      const officialName = sharedSlugs.GENRE_SLUG_MAP[slug];
      assert.equal(item.name, officialName, `El nombre oficial para '${slug}' debe ser '${officialName}'`);
    }
  });

  test("Estudios: STUDIO_MAP (Edge) coincide en claves con STUDIO_DATA (SSOT)", () => {
    const edgeStudioKeys = Object.keys(taxonomyTypes.STUDIO_MAP).sort();
    const sharedStudioKeys = Object.keys(sharedConstants.STUDIO_DATA).sort();

    assert.deepEqual(edgeStudioKeys, sharedStudioKeys, "Las claves de estudio deben coincidir exactamente");
  });

  test("Selecciones: SELECTION_MAP (Edge) coincide en claves con SELECTION_SLUGS (SSOT)", () => {
    const edgeSelectionKeys = Object.keys(taxonomyTypes.SELECTION_MAP).sort();
    const sharedSelectionKeys = Array.from(sharedSlugs.SELECTION_SLUGS).sort();

    assert.deepEqual(edgeSelectionKeys, sharedSelectionKeys, "Las claves de selección deben coincidir exactamente");
  });

  test("Grupos Regionales: REGIONAL_GROUPS_MAP (Edge) coincide en slugs con REGIONAL_GROUPS (SSOT)", () => {
    const edgeRegionalKeys = Object.keys(taxonomyTypes.REGIONAL_GROUPS_MAP).sort();
    const sharedRegionalSlugs = Object.values(sharedConstants.REGIONAL_GROUPS).map(g => g.value).sort();

    assert.deepEqual(edgeRegionalKeys, sharedRegionalSlugs, "Los slugs de grupos regionales deben coincidir exactamente");
  });

  test("Países: ACTIVE_COUNTRIES_MAP (Edge) es un subconjunto estricto de COUNTRY_SLUG_MAP (SSOT) (78 de 116)", () => {
    const edgeCountryKeys = Object.keys(taxonomyTypes.ACTIVE_COUNTRIES_MAP);
    const sharedCountryMap = sharedSlugs.COUNTRY_SLUG_MAP;

    assert.equal(edgeCountryKeys.length, 78, "Edge debe registrar exactamente 78 países activos con catálogo");
    assert.equal(Object.keys(sharedCountryMap).length, 116, "SSOT debe mantener los 116 países canónicos");

    for (const slug of edgeCountryKeys) {
      assert.ok(
        slug in sharedCountryMap,
        `El país de Edge '${slug}' debe existir en COUNTRY_SLUG_MAP de shared`
      );
      assert.equal(
        taxonomyTypes.ACTIVE_COUNTRIES_MAP[slug].name,
        sharedCountryMap[slug],
        `El nombre del país para '${slug}' debe coincidir entre Edge y SSOT`
      );
    }
  });
});
