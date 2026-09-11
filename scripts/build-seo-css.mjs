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
  position: absolute !important;
  bottom: 6px !important;
  left: 8px !important;
  right: 28px !important;
  height: 22px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 8px !important;
  font-size: 0.72rem !important;
  font-weight: 600 !important;
  color: var(--color-text-secondary) !important;
  background: var(--color-surface-2) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: var(--radius-pill) !important;
  text-decoration: none !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  z-index: 25 !important;
  pointer-events: auto !important;
  transition: all var(--duration-quick) ease !important;
}
.card-ficha-btn:hover {
  background: var(--color-accent) !important;
  color: #fff !important;
  border-color: var(--color-accent) !important;
}

/* Ocultar 'Ficha completa' cuando el reverso está expandido */
.flip-card-back.is-expanded .card-ficha-btn {
  display: none !important;
  pointer-events: none !important;
}

/* Botón '+' de sinopsis en la esquina inferior derecha */
.flip-card-back .expand-content-btn {
  position: absolute !important;
  bottom: 8px !important;
  right: 6px !important;
  width: 18px !important;
  height: 18px !important;
  border-radius: 50% !important;
  z-index: 25 !important;
  pointer-events: auto !important;
}

/* Botón '+' de reparto en la esquina derecha del bloque de actores sin romper line-clamp */
.detail-item[data-template="actors-container"] {
  position: relative !important;
  overflow: hidden !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 3 !important;
  line-clamp: 3 !important;
  -webkit-box-orient: vertical !important;
  padding-right: 20px !important;
  line-height: 1.4 !important;
}

.actors-expand-btn {
  position: absolute !important;
  bottom: 1px !important;
  right: 0 !important;
  width: 18px !important;
  height: 18px !important;
  border-radius: 50% !important;
  z-index: 25 !important;
  pointer-events: auto !important;
}

/* Título original en el reverso compacto y limpio en la cabecera */
.movie-card:not(.is-quick-view) .back-original-title-wrapper {
  margin-top: 2px !important;
  margin-bottom: 4px !important;
  min-height: 0 !important;
}

/* Margen inferior del scrollable-content para despejar la barra de botones */
.flip-card-back:not(.is-expanded) .scrollable-content {
  margin-bottom: 30px !important;
}

/* Alineación de año y bandera a la derecha si no hay iconos de plataformas */
.year-country-line {
  margin-left: auto !important;
}
.year-flag-group {
  justify-content: flex-end !important;
}

/* Las fichas de persona (director / actor) no voltean */
.person-card {
  cursor: default !important;
}
.person-card .flip-card-inner {
  transform: none !important;
}
.person-card a, .person-card button {
  cursor: pointer !important;
}

/* Iconos de plataformas/estudios no clickables en fichas de película */
.platform-icon {
  cursor: default !important;
  pointer-events: none;
}

.btn-header-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 9999px;
  text-decoration: none;
  transition: all 0.2s ease;
}
.btn-header-cta:hover {
  background: #f59e0b;
  color: #0d0d0d;
  transform: scale(1.08);
}
.btn-header-cta svg {
  width: 20px;
  height: 20px;
}

/* Interacción de volteo en SSR (solo películas normales en cuadrícula) */
.movie-card:not(.person-card):not(.is-quick-view) {
  cursor: pointer;
}
.movie-card:not(.person-card):not(.is-quick-view) a,
.movie-card:not(.person-card):not(.is-quick-view) button {
  cursor: pointer;
}

/* Margen lateral en páginas SEO del tamaño del sidebar replegado (65px a ambos lados) */
@media (min-width: 769px) {
  :is(.collection-wall, .person-wall) .main-layout {
    padding-inline: 65px;
    box-sizing: border-box;
  }
}
@media (max-width: 768px) {
  :is(.collection-wall, .person-wall) .main-layout {
    padding-inline: var(--space-xs, 8px);
    box-sizing: border-box;
  }
}

/* Interacción de volteo en SSR (solo películas normales en cuadrícula) */
.movie-card:not(.person-card):not(.is-quick-view) {
  cursor: pointer;
}
.movie-card:not(.person-card):not(.is-quick-view) a,
.movie-card:not(.person-card):not(.is-quick-view) button {
  cursor: pointer;
}

/* Aislamiento estricto de capas 3D y eventos de puntero (solo cuadrícula) */
.movie-card:not(.is-quick-view) .flip-card-inner {
  transform-style: preserve-3d;
}
.movie-card:not(.is-quick-view) .flip-card-front,
.movie-card:not(.is-quick-view) .flip-card-back {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* Cara trasera inactiva e invisible cuando no está volteada */
.movie-card:not(.is-quick-view) .flip-card-inner:not(.is-flipped) .flip-card-back,
.movie-card:not(.is-quick-view) .flip-card-inner:not(.is-flipped) .flip-card-back * {
  pointer-events: none !important;
  visibility: hidden !important;
}

.movie-card:not(.is-quick-view) .flip-card-inner:not(.is-flipped) .flip-card-front {
  pointer-events: auto !important;
  visibility: visible !important;
  z-index: 2 !important;
  transform: rotateY(0deg) translateZ(1px);
}

/* Cara frontal inactiva e invisible para el puntero cuando está volteada */
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-front,
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-front * {
  pointer-events: none !important;
  visibility: hidden !important;
  z-index: 1 !important;
  transform: rotateY(0deg) translateZ(-1px);
}

/* Cara trasera activa cuando está volteada (avanza en el plano Z para ganar el hit-testing) */
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back {
  pointer-events: auto !important;
  visibility: visible !important;
  z-index: 10 !important;
  transform: rotateY(180deg) translateZ(1px);
}

.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back * {
  visibility: visible !important;
}

/* Asegurar interactividad y clics en enlaces y botones traseros cuando está volteada */
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back a {
  pointer-events: auto !important;
  cursor: pointer !important;
}

.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back button {
  pointer-events: auto !important;
  cursor: pointer !important;
}

.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back [role="button"] {
  pointer-events: auto !important;
  cursor: pointer !important;
}

/* Enlaces externos específicos */
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back [data-template="wikipedia-link"],
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back [data-template="justwatch-link"],
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back [data-template="imdb-link"],
.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back [data-template="fa-link"] {
  pointer-events: auto !important;
  cursor: pointer !important;
  z-index: 10 !important;
}

/* Overlay de actores y géneros */
.flip-card-back.is-expanded.show-actors .actors-scrollable-content {
  z-index: 40 !important;
  pointer-events: auto !important;
}

/* Ventana modal de vista rápida siempre por encima del header al hacer zoom */
.quick-view-modal {
  z-index: calc(var(--z-index-overlay, 1999) + 10) !important;
}
`;

fs.writeFileSync("public/seo-card-v7.css", combined);
execSync("npx esbuild public/seo-card-v7.css --minify --outfile=public/seo-card-v7.min.css");
const minified = fs.readFileSync("public/seo-card-v7.min.css", "utf8");



// Also update cloudflare/seo/seo-card-css.js to export the minified string
const jsContent = `// Generado automáticamente a partir de public/seo-card-v7.min.css\nexport const SEO_CARD_CSS = ${JSON.stringify(minified)};\n`;
fs.writeFileSync("cloudflare/seo/seo-card-css.js", jsContent);

console.log("Successfully generated public/seo-card-v7.css and cloudflare/seo/seo-card-css.js");
console.log("Unminified size:", combined.length, "Minified size:", minified.length);


