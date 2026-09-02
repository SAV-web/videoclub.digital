import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

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

  test("Los 21 géneros oficiales están documentados con su slug canónico en ambos archivos", () => {
    const { OFFICIAL_GENRES, toSlug } = slugsModule;
    assert.equal(OFFICIAL_GENRES.length, 21, "Deben existir exactamente 21 géneros oficiales");

    for (const genre of OFFICIAL_GENRES) {
      const slug = toSlug(genre);
      assert.ok(
        llmsTxt.includes(`/${slug}/`),
        `llms.txt debe listar el slug canónico /${slug}/ para el género ${genre}`
      );
      assert.ok(
        llmsFullTxt.includes(`/${slug}/`),
        `llms-full.txt debe listar el slug canónico /${slug}/ para el género ${genre}`
      );
    }
  });

  test("Los 15 estudios oficiales están documentados con su slug canónico en ambos archivos", () => {
    const { STUDIO_SLUGS } = slugsModule;
    assert.equal(STUDIO_SLUGS.size, 15, "Deben existir exactamente 15 estudios oficiales");

    for (const studio of STUDIO_SLUGS) {
      assert.ok(
        llmsTxt.includes(`/${studio}/`),
        `llms.txt debe listar el slug canónico /${studio}/`
      );
      assert.ok(
        llmsFullTxt.includes(`/${studio}/`),
        `llms-full.txt debe listar el slug canónico /${studio}/`
      );
    }
  });

  test("Las 10 selecciones oficiales están documentadas con su slug canónico en ambos archivos", () => {
    const { SELECTION_SLUGS } = slugsModule;
    assert.equal(SELECTION_SLUGS.size, 10, "Deben existir exactamente 10 selecciones oficiales");

    for (const sel of SELECTION_SLUGS) {
      assert.ok(
        llmsTxt.includes(`/${sel}/`),
        `llms.txt debe listar el slug canónico /${sel}/`
      );
      assert.ok(
        llmsFullTxt.includes(`/${sel}/`),
        `llms-full.txt debe listar el slug canónico /${sel}/`
      );
    }
  });

  test("Los países clave utilizan sus slugs canónicos reales y no traducciones inventadas", () => {
    // EEUU debe ser /eeuu/, no /estados-unidos/
    assert.ok(llmsTxt.includes("/eeuu/"));
    assert.ok(llmsFullTxt.includes("/eeuu/"));
    assert.ok(!llmsTxt.includes("/estados-unidos/"));
    assert.ok(!llmsFullTxt.includes("`/estados-unidos/` —"));

    // UK debe ser /uk/, no /reino-unido/
    assert.ok(llmsTxt.includes("/uk/"));
    assert.ok(llmsFullTxt.includes("/uk/"));
    assert.ok(!llmsTxt.includes("/reino-unido/"));
    assert.ok(!llmsFullTxt.includes("`/reino-unido/` —"));
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

  test("Las entidades de persona se documentan obligatoriamente con prefijos de ruta canónicos", () => {
    assert.ok(llmsTxt.includes("/director/{slug}/"));
    assert.ok(llmsTxt.includes("/actor/{slug}/"));
    assert.ok(llmsFullTxt.includes("/director/{slug}/"));
    assert.ok(llmsFullTxt.includes("/actor/{slug}/"));
  });
});
