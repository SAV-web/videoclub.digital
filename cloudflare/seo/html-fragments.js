/**
 * =================================================================
 *   SHARED HTML FRAGMENTS FOR EDGE SSR (cloudflare/seo/html-fragments.js)
 * =================================================================
 * Centraliza el marcado compartido entre render-movie, render-person y
 * render-taxonomy: serialización JSON-LD segura, estrellas de 3 niveles,
 * <head> SEO anti-FOUC y shell común de muros de colección.
 */

import { escapeHtml, SPECULATION_RULES } from './seo-types.js';

const EDGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://wibygecgfczcvaqewleq.supabase.co https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https://wibygecgfczcvaqewleq.supabase.co https://*.supabase.co https://videoclub.digital; style-src 'self' 'unsafe-inline'; font-src 'self' data: https://*.supabase.co; object-src 'none'; base-uri 'self';";

const ANTI_FLICKER_THEME_SCRIPT = `<script>
    (function () {
      try {
        var cookieMatch = document.cookie.match(/(?:^|;\\s*)theme=([^;]*)/);
        var stored = localStorage.getItem("theme") || (cookieMatch ? cookieMatch[1] : null);
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored ? stored === "dark" : systemDark;
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  </script>`;

export function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function renderStarsHtml({ isSuspenso, avgStars, clip1, clip2, clip3 }, baseUrl = '/') {
  const clips = [clip1, clip2, clip3];
  return clips
    .map((clip, idx) => {
      const level = idx + 1;
      const isVisible = level === 1 ? (isSuspenso || avgStars > 0) : (!isSuspenso && avgStars > idx);
      return `<svg class="star-icon" data-rating-level="${level}" style="${isVisible ? 'opacity: 1;' : 'opacity: 0;'}">
                  <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip}% 0 0);"></use>
                </svg>`;
    })
    .join('\n                ');
}

export function renderSeoHead({
  title,
  description,
  canonicalUrl,
  ogType = 'website',
  ogImageUrl = '',
  includeRobots = false,
  baseUrl = '/',
  schemas = [],
  speculationRules = SPECULATION_RULES,
  extraHeadHtml = '',
}) {
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${EDGE_CSP}" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronización exacta de modo claro/oscuro entre SPA y SEO -->
  ${ANTI_FLICKER_THEME_SCRIPT}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  ${includeRobots ? '<meta name="robots" content="index, follow, max-image-preview:large" />' : ''}

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="${escapeHtml(ogType)}" />
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />` : ''}
  <meta property="og:site_name" content="Videoclub Digital" />
  <meta property="og:locale" content="es_ES" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${ogImageUrl ? `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />` : ''}

  <!-- Tipografía Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preload" href="${baseUrl}assets/fonts/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Structured Data & Speculation Rules -->
  ${schemas.map((schema) => `<script type="application/ld+json">${safeJsonLd(schema)}</script>`).join('\n  ')}
  <script type="speculationrules">${safeJsonLd(speculationRules)}</script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens y contrato completo de tarjeta) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v7.css" />
  <link rel="icon" type="image/svg+xml" href="${baseUrl}assets/brand/videoclub-mark.svg" />
  ${extraHeadHtml}
</head>`;
}

export function renderCollectionWallPage({
  headHtml,
  headerFilterHtml,
  h1Title,
  gridAriaLabel,
  gridContentHtml,
  baseUrl = '/',
  extraInitScript = '',
  expandNoun = 'detalles',
}) {
  return `<!DOCTYPE html>
<html lang="es">
${headHtml}
<body class="collection-wall">
  <div class="main-layout">
    <div class="main-content-wrapper">
      <!-- Cabecera Minimalista Estilo SPA -->
      <header class="main-header">
        <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto;">
          <a href="${baseUrl}" class="brand-logo-text" aria-label="videoclub.digital - Inicio">
            <svg class="brand-logo-full" viewBox="0 0 200 95" fill="none" role="img" aria-hidden="true" width="130" height="62">
              <text x="100" y="38" text-anchor="middle" class="brand-text" font-size="34" letter-spacing="-0.03em">videoclub</text>
              <g transform="translate(46.5, 0)">
                <circle cx="5" cy="73" r="5" class="brand-dot" />
                <text x="15" y="80" class="brand-text" font-size="34" letter-spacing="-0.03em">digital</text>
              </g>
            </svg>
          </a>
          <div class="active-filters-list" style="display:flex; align-items:center; gap:8px; margin:0; padding:0;">
            ${headerFilterHtml}
          </div>
        </div>
      </header>

      <main class="content">
        <h1 class="sr-only">${escapeHtml(h1Title)}</h1>
        <section id="grid-container" class="grid-container" aria-label="${escapeHtml(gridAriaLabel)}">
          ${gridContentHtml}
        </section>
      </main>

      <!-- Pie de página oficial con avisos legales de la SPA -->
      <footer class="site-footer">
        <ul class="footer-links">
          <li class="footer-brand">videoclub.digital</li>
          <li><a href="${baseUrl}?legal=about" class="footer-legal-link">Quiénes somos</a></li>
          <li><a href="${baseUrl}?legal=contact" class="footer-legal-link">Contacto</a></li>
          <li><a href="${baseUrl}?legal=legal" class="footer-legal-link">Aviso legal</a></li>
          <li><a href="${baseUrl}?legal=privacy" class="footer-legal-link">Privacidad</a></li>
          <li><a href="${baseUrl}?legal=cookies" class="footer-legal-link">Cookies</a></li>
          <li class="footer-copy">2025-2026 © Copyright.</li>
        </ul>
      </footer>
    </div>
  </div>

  <script>
    (function () {
      var activeCard = null;

      // Preservar orden del catálogo seleccionado en la SPA (localStorage preferred_sort)
      try {
        var prefSort = localStorage.getItem("preferred_sort");
        if (prefSort) {
          document.querySelectorAll("a[href*='_p=']").forEach(function (a) {
            if (!a.href.includes("_q=")) {
              a.href += (a.href.includes("?") ? "&" : "?") + "_q=sort%3D" + encodeURIComponent(prefSort);
            } else if (!a.href.includes("sort%3D") && !a.href.includes("sort=")) {
              a.href += "%26sort%3D" + encodeURIComponent(prefSort);
            }
          });
        }
      } catch (e) {}

      ${extraInitScript}

      document.addEventListener("click", function (e) {
        // 1. Botón + de actores: despliega la lista completa de actores y géneros en overlay
        var actorsExpandBtn = e.target.closest(".actors-expand-btn");
        if (actorsExpandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = actorsExpandBtn.closest(".flip-card-back");
          if (back) {
            back.classList.add("is-expanded", "show-actors");
            var bottomBtn = back.querySelector(".expand-content-btn");
            if (bottomBtn) {
              bottomBtn.textContent = "−";
              bottomBtn.setAttribute("aria-label", "Cerrar detalles");
            }
          }
          return;
        }

        // 2. Botón inferior de expansión / contracción (+ / −)
        var expandBtn = e.target.closest(".expand-content-btn");
        if (expandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = expandBtn.closest(".flip-card-back");
          if (back) {
            if (back.classList.contains("show-actors") || back.classList.contains("is-expanded")) {
              back.classList.remove("is-expanded", "show-actors");
              expandBtn.textContent = "+";
              expandBtn.setAttribute("aria-label", "Expandir ${expandNoun}");
              var scrolls = back.querySelectorAll(".scrollable-content, .actors-scrollable-content");
              scrolls.forEach(function (s) { s.scrollTop = 0; });
            } else {
              back.classList.add("is-expanded");
              expandBtn.textContent = "−";
              expandBtn.setAttribute("aria-label", "Contraer ${expandNoun}");
            }
          }
          return;
        }

        // 3. Trasera ampliada: retroceder a la trasera normal al pulsar fuera del área de enlaces
        var expandedBack = e.target.closest(".flip-card-back.is-expanded");
        if (expandedBack) {
          var isInteractive = e.target.closest("a[href], button, [role='button'], [data-action]");
          if (!isInteractive) {
            var sel = window.getSelection ? window.getSelection() : null;
            if (sel && sel.toString().trim().length > 0) {
              e.stopPropagation();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            expandedBack.classList.remove("is-expanded", "show-actors");
            var btn = expandedBack.querySelector(".expand-content-btn");
            if (btn) {
              btn.textContent = "+";
              btn.setAttribute("aria-label", "Expandir ${expandNoun}");
            }
            var scrolls = expandedBack.querySelectorAll(".scrollable-content, .actors-scrollable-content");
            scrolls.forEach(function (s) { s.scrollTop = 0; });
            return;
          }
        }

        // 4. Volteo a la trasera al pulsar el cartel o cualquier lugar de la ficha
        var card = e.target.closest(".movie-card:not(.person-card)");
        if (card) {
          if (e.target.closest("a, button, [role='button'], .actors-scrollable-content, .scrollable-content")) return;
          var inner = card.querySelector(".flip-card-inner");
          if (inner) {
            var isFlipped = inner.classList.toggle("is-flipped");
            if (isFlipped) {
              if (activeCard && activeCard !== inner) {
                activeCard.classList.remove("is-flipped");
                var prevBack = activeCard.querySelector(".flip-card-back");
                if (prevBack) {
                  prevBack.classList.remove("is-expanded", "show-actors");
                  var prevBtn = prevBack.querySelector(".expand-content-btn");
                  if (prevBtn) prevBtn.textContent = "+";
                }
              }
              activeCard = inner;
            } else if (activeCard === inner) {
              var back = inner.querySelector(".flip-card-back");
              if (back) {
                back.classList.remove("is-expanded", "show-actors");
                var btn = back.querySelector(".expand-content-btn");
                if (btn) btn.textContent = "+";
              }
              activeCard = null;
            }
          }
        } else if (activeCard) {
          activeCard.classList.remove("is-flipped");
          var back = activeCard.querySelector(".flip-card-back");
          if (back) {
            back.classList.remove("is-expanded", "show-actors");
            var btn = back.querySelector(".expand-content-btn");
            if (btn) btn.textContent = "+";
          }
          activeCard = null;
        }
      });

      // Sincronización para imágenes LQIP completadas en caché
      document.querySelectorAll(".movie-card img.lazy-lqip").forEach(function (img) {
        if (img.complete) {
          img.classList.add("loaded");
        } else {
          img.addEventListener("load", function () { img.classList.add("loaded"); });
        }
      });
    })();
  </script>
</body>
</html>`;
}
