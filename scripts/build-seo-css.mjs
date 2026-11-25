import fs from "fs";
import { transformSync } from "esbuild";

const files = [
  "src/css/variables.css",
  "src/css/globals.css",
  "src/css/layout.css",
  "src/css/components/button.css",
  "src/css/components/card.css",
  "src/css/components/header.css",
  "src/css/components/rating.css",
  "src/css/components/sidebar.css",
  "src/css/components/modal.css",
  "src/css/utilities.css",
  "src/css/seo-edge.css",
];

let combined = "/* VIDEOCLUB DIGITAL - UNIFIED EDGE CSS (v4) */\n";
for (const f of files) {
  if (fs.existsSync(f)) {
    combined += `/* ${f} */\n${fs.readFileSync(f, "utf8")}\n`;
  }
}

const { code: minified } = transformSync(combined, { loader: "css", minify: true });

// Escribir directamente el CSS minificado en public/seo-card-v7.css y módulo Edge
fs.writeFileSync("public/seo-card-v7.css", minified);
const jsContent = `// Generado automáticamente a partir de public/seo-card-v7.css (minificado)\nexport const SEO_CARD_CSS = ${JSON.stringify(minified)};\n`;
fs.writeFileSync("cloudflare/seo/seo-card-css.js", jsContent);

console.log("Successfully generated public/seo-card-v7.css (minified) and cloudflare/seo/seo-card-css.js");
console.log("Original combined size:", combined.length, "Final minified size:", minified.length);
