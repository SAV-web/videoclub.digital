import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";
import {
  GENRE_MAP,
  STUDIO_MAP,
  SELECTION_MAP,
  REGIONAL_GROUPS_MAP
} from "../cloudflare/seo/taxonomy-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");
const publicDir = path.resolve(projectRoot, "public");

describe("Especificación Canónica llms.txt y llms-full.txt", () => {
  let viteEnv;
  let slugsModule;
  let llmsTxt;
  let llmsFullTxt;

  before(async () => {
    viteEnv = await startViteSsrServer(["/src/shared/slugs.ts"]);
    [slugsModule] = viteEnv.modules;

    llmsTxt = fs.readFileSync(path.join(publicDir, "llms.txt"), "utf-8");
    llmsFullTxt = fs.readFileSync(path.join(publicDir, "llms-full.txt"), "utf-8");
  });

  after(async () => {
    await viteEnv?.close();
  });

  test("Los 21 géneros oficiales están documentados con su ruta canónica /genero/:slug/ en ambos archivos", () => {
    const { OFFICIAL_GENRES, toSlug } = slugsModule;
    assert.equal(OFFICIAL_GENRES.length, 21, "Deben existir exactamente 21 géneros oficiales");

    for (const genre of OFFICIAL_GENRES) {
      const slug = toSlug(genre);
      assert.ok(
        llmsTxt.includes(`/genero/${slug}/`),
        `llms.txt debe listar la ruta canónica /genero/${slug}/ para el género ${genre}`
      );
      assert.ok(
        llmsFullTxt.includes(`/genero/${slug}/`),
        `llms-full.txt debe listar la ruta canónica /genero/${slug}/ para el género ${genre}`
      );
    }
  });

  test("Los 15 estudios oficiales están documentados con su ruta canónica /estudio/:slug/ en ambos archivos", () => {
    const { STUDIO_SLUGS } = slugsModule;
    assert.equal(STUDIO_SLUGS.size, 15, "Deben existir exactamente 15 estudios oficiales");

    for (const studio of STUDIO_SLUGS) {
      assert.ok(
        llmsTxt.includes(`/estudio/${studio}/`),
        `llms.txt debe listar la ruta canónica /estudio/${studio}/`
      );
      assert.ok(
        llmsFullTxt.includes(`/estudio/${studio}/`),
        `llms-full.txt debe listar la ruta canónica /estudio/${studio}/`
      );
    }
  });

  test("Las 10 selecciones oficiales están documentadas con su ruta canónica /seleccion/:slug/ en ambos archivos", () => {
    const { SELECTION_SLUGS } = slugsModule;
    assert.equal(SELECTION_SLUGS.size, 10, "Deben existir exactamente 10 selecciones oficiales");

    for (const sel of SELECTION_SLUGS) {
      assert.ok(
        llmsTxt.includes(`/seleccion/${sel}/`),
        `llms.txt debe listar la ruta canónica /seleccion/${sel}/`
      );
      assert.ok(
        llmsFullTxt.includes(`/seleccion/${sel}/`),
        `llms-full.txt debe listar la ruta canónica /seleccion/${sel}/`
      );
    }
  });

  test("Los países clave utilizan sus rutas canónicas reales /pais/:slug/ y no traducciones inventadas", () => {
    // EEUU debe ser /pais/eeuu/, no /estados-unidos/
    assert.ok(llmsTxt.includes("/pais/eeuu/"));
    assert.ok(llmsFullTxt.includes("/pais/eeuu/"));
    assert.ok(!llmsTxt.includes("/estados-unidos/"));
    assert.ok(!llmsFullTxt.includes("`/estados-unidos/` —"));
    assert.ok(!llmsFullTxt.includes("`/pais/estados-unidos/` —"));

    // UK debe ser /pais/uk/, no /reino-unido/
    assert.ok(llmsTxt.includes("/pais/uk/"));
    assert.ok(llmsFullTxt.includes("/pais/uk/"));
    assert.ok(!llmsTxt.includes("/reino-unido/"));
    assert.ok(!llmsFullTxt.includes("`/reino-unido/` —"));
    assert.ok(!llmsFullTxt.includes("`/pais/reino-unido/` —"));
  });

  test("No se listan rutas erróneas o inventadas señaladas en la auditoría", () => {
    const forbiddenPatterns = [
      "/ciencia-ficcion/",
      "/cine-negro/",
      "/fantastico/",
      "/musical/",
      "/filmin/",
      "/prime-video/",
      "/hbo-max/",
      "/1001-peliculas/",
      "/tspdt-top-1000/",
      "/criterion-collection/",
      "/?director=",
      "/anos-70/",
      "/anos-80/",
      "/2024/",
    ];

    for (const pattern of forbiddenPatterns) {
      assert.ok(
        !llmsTxt.includes(pattern),
        `llms.txt no debe contener la ruta inventada o incorrecta: ${pattern}`
      );
    }
  });

  test("Las entidades de persona se documentan con la raíz VIP canónica y los prefijos de la SPA", () => {
    assert.ok(llmsTxt.includes("/{vip-slug}/"));
    assert.ok(llmsFullTxt.includes("/{vip-slug}/"));
    assert.ok(llmsTxt.includes("/director/{slug}/"));
    assert.ok(llmsTxt.includes("/actor/{slug}/"));
    assert.ok(llmsFullTxt.includes("/director/{slug}/"));
    assert.ok(llmsFullTxt.includes("/actor/{slug}/"));
  });

  test("Contrato Arquitectónico: llms.txt y llms-full.txt declaran que las rutas combinadas son funcionales de la SPA y no SEO SSR", () => {
    const requiredClause = "Las rutas combinadas son rutas funcionales de la SPA, pero no forman parte del conjunto de landing pages SEO SSR.";
    assert.ok(
      llmsTxt.includes(requiredClause),
      `llms.txt debe contener explícitamente la cláusula: "${requiredClause}"`
    );
    assert.ok(
      llmsFullTxt.includes(requiredClause),
      `llms-full.txt debe contener explícitamente la cláusula: "${requiredClause}"`
    );
  });

  test("Paridad Canónica Estricta: slugs.ts (Identidad) vs taxonomy-types.js (Representación SEO)", () => {
    const { GENRE_SLUG_MAP, STUDIO_SLUGS, SELECTION_SLUGS, COUNTRY_SLUG_MAP } = slugsModule;

    // 1. Géneros
    const slugsGenres = Object.keys(GENRE_SLUG_MAP).sort();
    const taxonomyGenres = Object.keys(GENRE_MAP).sort();
    assert.deepEqual(
      slugsGenres,
      taxonomyGenres,
      "Discrepancia entre slugs.ts (GENRE_SLUG_MAP) y taxonomy-types.js (GENRE_MAP)"
    );

    // 2. Estudios
    const slugsStudios = Array.from(STUDIO_SLUGS).sort();
    const taxonomyStudios = Object.keys(STUDIO_MAP).sort();
    assert.deepEqual(
      slugsStudios,
      taxonomyStudios,
      "Discrepancia entre slugs.ts (STUDIO_SLUGS) y taxonomy-types.js (STUDIO_MAP)"
    );

    // 3. Selecciones
    const slugsSelections = Array.from(SELECTION_SLUGS).sort();
    const taxonomySelections = Object.keys(SELECTION_MAP).sort();
    assert.deepEqual(
      slugsSelections,
      taxonomySelections,
      "Discrepancia entre slugs.ts (SELECTION_SLUGS) y taxonomy-types.js (SELECTION_MAP)"
    );

    // 4. Grupos Regionales
    for (const region of Object.keys(REGIONAL_GROUPS_MAP)) {
      assert.ok(
        COUNTRY_SLUG_MAP[region],
        `El grupo regional '${region}' debe existir como identificador canónico en slugs.ts`
      );
    }
  });
});
