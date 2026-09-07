import fs from "fs";
import { execSync } from "child_process";

const files = [
  "src/css/variables.css",
  "src/css/globals.css",
  "src/css/layout.css",
  "src/css/components/button.css",
  "src/css/components/card.css",
  "src/css/components/header.css",
  "src/css/components/rating.css",
  "src/css/components/sidebar.css",
  "src/css/components/modal.css"
];

let combined = "/* VIDEOCLUB DIGITAL - UNIFIED EDGE CSS (v4) */\n";
for (const f of files) {
  if (fs.existsSync(f)) {
    combined += "/* " + f + " */\n" + fs.readFileSync(f, "utf8") + "\n";
  }
}

// Extra helper styles for Edge SSR
combined += `
/* ========================================================== */
/*  EDGE SSR ESPECÍFICOS Y COMPATIBILIDAD CON LA SPA          */
/* ========================================================== */
.brand-logo-text {
  font-family: var(--font-title);
  font-weight: 800;
  font-size: 1.25rem;
  letter-spacing: -0.03em;
  color: var(--color-text-primary);
  text-decoration: none;
  display: flex;
  align-items: baseline;
  line-height: 1;
}
.brand-logo-text .logo-line-1 { font-weight: 800; }
.brand-logo-text .logo-line-2 { font-weight: 400; opacity: 0.75; }

.main-header-primary-controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.total-results-container {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background: var(--color-surface-2);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
}

.total-results-count {
  font-weight: bold;
  color: var(--color-text-primary);
}

.btn-open-spa-subtle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  text-decoration: none;
  transition: all var(--duration-quick) var(--ease-smooth);
}
.btn-open-spa-subtle:hover {
  background: var(--color-surface-2);
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.card-ficha-btn {
  position: absolute;
  bottom: 6px;
  left: 8px;
  right: 32px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 10;
  transition: all var(--duration-quick) ease;
}
.card-ficha-btn:hover {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}

.flip-card-back:not(.is-expanded) .scrollable-content {
  margin-bottom: 24px;
}

/* Estrellas doradas en SSR para paridad exacta con la SPA */
.star-rating-container.has-average-rating .star-icon-path {
  stroke: var(--color-star-gold) !important;
}
.star-rating-container.has-average-rating .star-icon-path--filled {
  fill: var(--color-star-gold) !important;
}

/* Interacción de volteo en SSR */
.movie-card {
  cursor: pointer;
}
.movie-card a, .movie-card button {
  cursor: pointer;
}
`;

fs.writeFileSync("public/seo-card-v5.css", combined);
execSync("npx esbuild public/seo-card-v5.css --minify --outfile=public/seo-card-v5.min.css");
const minified = fs.readFileSync("public/seo-card-v5.min.css", "utf8");

// Mantener compatibilidad con v4
fs.writeFileSync("public/seo-card-v4.css", combined);
fs.writeFileSync("public/seo-card-v4.min.css", minified);

// Also update cloudflare/seo/seo-card-css.js to export the minified string
const jsContent = `// Generado automáticamente a partir de public/seo-card-v5.min.css\nexport const SEO_CARD_CSS = ${JSON.stringify(minified)};\n`;
fs.writeFileSync("cloudflare/seo/seo-card-css.js", jsContent);

console.log("Successfully generated public/seo-card-v4.css and cloudflare/seo/seo-card-css.js");
console.log("Unminified size:", combined.length, "Minified size:", minified.length);
