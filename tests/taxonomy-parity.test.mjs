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

  test("Países: ACTIVE_COUNTRIES_MAP (Edge) es un subconjunto estricto de COUNTRY_SLUG_MAP (SSOT)", () => {
    const edgeCountryKeys = Object.keys(taxonomyTypes.ACTIVE_COUNTRIES_MAP);
    const sharedCountryMap = sharedSlugs.COUNTRY_SLUG_MAP;
    const totalSharedCountries = Object.keys(sharedCountryMap).length;

    assert.ok(edgeCountryKeys.length > 0, "Edge debe registrar países activos");
    assert.ok(
      edgeCountryKeys.length <= totalSharedCountries,
      `Los países de Edge (${edgeCountryKeys.length}) no deben superar los canónicos de SSOT (${totalSharedCountries})`
    );

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

  test("Sinónimos de Género: GENRE_SYNONYMS mapea deterministamente a slugs oficiales válidos y 'suspense' mapea a 'thriller'", () => {
    const { GENRE_SYNONYMS, GENRE_SLUG_MAP, genreToSlug } = sharedSlugs;

    for (const [synonym, targetSlug] of Object.entries(GENRE_SYNONYMS)) {
      assert.ok(
        targetSlug in GENRE_SLUG_MAP,
        `El sinónimo '${synonym}' debe apuntar a un slug canónico existente (${targetSlug})`
      );
    }

    assert.equal(GENRE_SYNONYMS["suspense"], "thriller", "El sinónimo 'suspense' debe mapear a 'thriller' (coincidente con SQL FTS)");
    assert.equal(genreToSlug("suspense"), "thriller", "genreToSlug('suspense') debe retornar 'thriller'");
    assert.equal(genreToSlug("misterio"), "intriga", "genreToSlug('misterio') debe retornar 'intriga'");
    assert.equal(genreToSlug("aventura"), "aventuras", "genreToSlug('aventura') debe retornar 'aventuras'");
    assert.equal(genreToSlug("belica"), "belico", "genreToSlug('belica') debe retornar 'belico'");
  });
});
