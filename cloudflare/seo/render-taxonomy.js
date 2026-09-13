// =================================================================
//      RENDERIZADOR HTML DE LANDINGS DE TAXONOMÍAS EN EL EDGE
//             (cloudflare/seo/render-taxonomy.js)
// =================================================================
// Renderiza el muro oficial de tarjetas 3D idéntico a la SPA
// para géneros, países, estudios cinematográficos y selecciones.
// Mantiene Schema.org CollectionPage, ItemList, BreadcrumbList,
// Open Graph, Speculation Rules API y accesibilidad WCAG.
// =================================================================

import {
  escapeHtml,
  escapeAttr,
  parseList,
  isSeriesType,
  formatRuntime,
  formatYear,
  getTitleLengthClass,
  calculateAverageStars,
  formatVotesUnified,
  preserveHyphenatedWords,
  toSlug,
  genreToSlug,
  STUDIO_DATA
} from './seo-types.js';

const SQRT_MAX_VOTES = {
  FA: Math.sqrt(220000),
  IMDB: Math.sqrt(3200000)
};

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Renderiza una tarjeta de película idéntica al componente oficial de la SPA (.movie-card)
 * con soporte para giro 3D (flip card), estrellas doradas dinámicas, banderas SVG,
 * notas de FilmAffinity / IMDb, sinopsis y expansión interactiva de reparto.
 */
export function renderSpaMovieCard(movie, index, siteOrigin, baseUrl = '/') {
  const isSeries = isSeriesType(movie.type);
  const title = movie.title || movie.original_title || 'Sin título';
  const displayOriginalTitle = movie.original_title?.trim() || title;
  const slug = movie.slug || '';
  const movieUrl = `${siteOrigin}/titulo/${slug}/`;
  const posterUrl = `${siteOrigin}/posters/${slug}.webp`;

  // Estrellas continuas (0-3) y cálculo de clip-path
  const isSuspenso = typeof movie.avg_rating === 'number' && movie.avg_rating > 0 && movie.avg_rating <= 5.5;
  const avgStars = calculateAverageStars(movie.avg_rating);
  const clip1 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 0))) * 100;
  const clip2 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 1))) * 100;
  const clip3 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 2))) * 100;

  // Barras de votos
  const faBarWidth = movie.fa_votes ? Math.min(100, (Math.sqrt(movie.fa_votes) / SQRT_MAX_VOTES.FA) * 100) : 0;
  const imdbBarWidth = movie.imdb_votes ? Math.min(100, (Math.sqrt(movie.imdb_votes) / SQRT_MAX_VOTES.IMDB) * 100) : 0;
  const formattedFaVotes = formatVotesUnified(movie.fa_votes);
  const formattedImdbVotes = formatVotesUnified(movie.imdb_votes);

  const rawGenres = parseList(movie.genres || movie.genres_list);
  const directors = parseList(movie.directors || movie.directors_list);
  const actors = parseList(movie.actors || movie.actors_list);
  const studios = parseList(movie.studios_list);

  const countryCode = movie.country_code || movie.countries?.code || null;
  const countryName = movie.country || movie.countries?.name || '';
  const countrySlug = countryCode ? toSlug(countryName) : null;

  const durationText = formatRuntime(movie.minutes, isSeries);
  const episodesText = isSeries && movie.episodes ? `${movie.episodes} x` : null;

  const titleLengthClass = getTitleLengthClass(title);
  const origTitleLengthClass = getTitleLengthClass(displayOriginalTitle);

  // Directores frontal (enlace directo a la SPA con filtro activo)
  const directorsHtml = directors.map((name, i) => `
    <a href="${baseUrl}?_p=/director/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < directors.length - 1 ? ', ' : ''}
  `).join('');

  // Iconos estudios (no clickables, idénticos a la SPA)
  const validStudios = studios.filter(code => STUDIO_DATA[code]);
  const studiosHtml = validStudios.map(code => {
    const conf = STUDIO_DATA[code];
    return `
      <span class="platform-icon ${conf.class}" title="${escapeAttr(conf.title)}">
        <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="0 0 24 24">
          <use href="${baseUrl}sprite.svg#${conf.id}"></use>
        </svg>
      </span>
    `;
  }).join('');

  // Reparto frontal resumido (solo texto plano hasta pulsar el botón +)
  const shortActorsText = actors.length > 0 
    ? actors.slice(0, 4).join(', ') + (actors.length > 4 ? '...' : '') 
    : 'Reparto no disponible';

  return `
    <article class="movie-card" data-movie-id="${movie.id}" style="--card-index: ${index};">
      <div class="flip-card-inner">
        <!-- Cara frontal -->
        <div class="flip-card-front">
          <div class="poster-container">
            <a href="${baseUrl}?movie=${movie.id}" class="poster-media-link" aria-label="Abrir ${escapeAttr(title)} en el videoclub" style="display:block; width:100%; height:100%; position:relative; text-decoration:none; color:inherit;">
              <img
                src="${escapeAttr(posterUrl)}"
                alt="Póster de ${escapeAttr(title)}"
                width="400"
                height="496"
                loading="${index < 6 ? 'eager' : 'lazy'}"
                ${index === 0 ? 'fetchpriority="high"' : ''}
                class="loaded"
                onerror="this.style.opacity='0.2'"
              />
              <div class="poster-overlay-guard"></div>
            </a>
            <div class="card-rating-block">
              <a href="${baseUrl}?movie=${movie.id}" class="star-rating-container has-average-rating is-interactive" aria-label="Ver valoración y ficha de ${escapeAttr(title)}" style="text-decoration: none; color: inherit; cursor: pointer;">
                <svg class="star-icon" data-rating-level="1" style="${isSuspenso || avgStars > 0 ? 'opacity: 1;' : 'opacity: 0;'}">
                  <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip1}% 0 0);"></use>
                </svg>
                <svg class="star-icon" data-rating-level="2" style="${!isSuspenso && avgStars > 1 ? 'opacity: 1;' : 'opacity: 0;'}">
                  <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip2}% 0 0);"></use>
                </svg>
                <svg class="star-icon" data-rating-level="3" style="${!isSuspenso && avgStars > 2 ? 'opacity: 1;' : 'opacity: 0;'}">
                  <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip3}% 0 0);"></use>
                </svg>
              </a>
              <span class="wall-rating-number" data-template="wall-rating">${movie.avg_rating ? movie.avg_rating.toFixed(1) : ''}</span>
              <a href="${baseUrl}?movie=${movie.id}" class="card-action-btn" aria-label="Añadir a mi lista en el videoclub" title="Añadir a mi lista">
                <svg class="icon-watchlist"><use href="${baseUrl}sprite.svg#icon-bookmark-plus"></use></svg>
              </a>
            </div>
          </div>

          <div class="movie-info movie-summary">
            <div class="title-director-block">
              <h3 data-template="title" class="${titleLengthClass}">
                <a href="${baseUrl}?movie=${movie.id}" class="movie-card-title-link" style="color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
              </h3>
              <div class="front-director-info" data-template="director">
                ${directorsHtml}
              </div>
            </div>
            <div class="movie-meta">
              ${studiosHtml ? `<div class="card-icons-line ${validStudios.length >= 3 ? 'compact' : ''}">${studiosHtml}</div>` : ''}
              <div class="year-country-line">
                <div class="year-flag-group">
                  <span data-template="year">
                    ${movie.year ? `<a href="${baseUrl}?_p=/&_q=year%3D${movie.year}" class="year-link" data-year-value="${movie.year}">${movie.year}</a>${escapeHtml(formatYear(movie.year, movie.year_end, isSeries, '', movie.type).substring(String(movie.year).length))}` : ''}
                  </span>
                  ${countryCode ? `
                    <a class="country-info" href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : '#'}" title="${escapeAttr(countryName)}" aria-label="Ver títulos de ${escapeAttr(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use>
                        </svg>
                      </span>
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cara trasera (Estructura y diseño idénticos a la SPA) -->
        <div class="flip-card-back">
          <div class="back-meta-header">
            <div class="episode-duration-group">
              ${episodesText ? `<span data-template="episodes">${escapeHtml(episodesText)}</span>` : ''}
              ${durationText ? `<span data-template="duration">${escapeHtml(durationText)}</span>` : ''}
              ${movie.justwatch ? `
                <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeAttr(movie.justwatch)}" title="Ver en JustWatch" data-template="justwatch-link">
                  <svg class="rating-icon" fill="#9A1485"><use href="${baseUrl}sprite.svg#icon-justwatch"></use></svg>
                </a>
              ` : ''}
              ${movie.wikipedia ? `
                <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeAttr(movie.wikipedia)}" title="Ver en Wikipedia" data-template="wikipedia-link">
                  <svg class="rating-icon" fill="#B3404A"><use href="${baseUrl}sprite.svg#icon-wikipedia"></use></svg>
                </a>
              ` : ''}
            </div>
          </div>

          <div class="ratings-container">
            ${movie.fa_rating ? `
              <div class="rating-line">
                <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.fa_id || '#')}" data-template="fa-link">
                  <svg class="rating-icon"><use href="${baseUrl}sprite.svg#icon-filmaffinity"></use></svg>
                  <span data-template="fa-rating">${movie.fa_rating.toFixed(1)}</span>
                </a>
                <span class="rating-votes-count">${escapeHtml(formattedFaVotes)}</span>
                <div class="rating-bar-container" data-votes="${escapeAttr(formattedFaVotes)}">
                  <div class="rating-bar" style="width: ${faBarWidth}%;"></div>
                </div>
              </div>
            ` : ''}
            ${movie.imdb_rating ? `
              <div class="rating-line">
                <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.imdb_id || '#')}" data-template="imdb-link">
                  <svg class="rating-icon" fill="#F5C618"><use href="${baseUrl}sprite.svg#icon-imdb"></use></svg>
                  <span data-template="imdb-rating">${movie.imdb_rating.toFixed(1)}</span>
                </a>
                <span class="rating-votes-count">${escapeHtml(formattedImdbVotes)}</span>
                <div class="rating-bar-container" data-votes="${escapeAttr(formattedImdbVotes)}">
                  <div class="rating-bar" style="width: ${imdbBarWidth}%;"></div>
                </div>
              </div>
            ` : ''}
          </div>

          ${displayOriginalTitle ? `
            <div class="back-original-title-wrapper">
              <a href="${baseUrl}?movie=${movie.id}" class="back-original-title-link" aria-label="Abrir ${escapeAttr(title)} en el videoclub" title="Abrir en el videoclub">
                <span data-template="original-title" class="${origTitleLengthClass}">${escapeHtml(displayOriginalTitle)}</span>
              </a>
            </div>
          ` : ''}

          <div class="details-list">
            ${rawGenres.length > 0 ? `
              <div class="detail-item" data-template="genre-container">
                <span class="detail-label" title="Género"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-clapperboard"></use></svg></span>
                <span class="detail-data" data-template="genre"><span>${escapeHtml(preserveHyphenatedWords(rawGenres.join(', ')))}</span></span>
              </div>
            ` : ''}
            ${actors.length > 0 ? `
              <div class="detail-item" data-template="actors-container">
                <span class="detail-label" title="Reparto"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-cast"></use></svg></span>
                <span class="detail-data" data-template="actors">${escapeHtml(preserveHyphenatedWords(shortActorsText))}</span>
                <button type="button" class="actors-expand-btn" aria-label="Ver detalles de géneros y reparto">+</button>
              </div>
            ` : ''}
          </div>

          <div class="scrollable-content">
            <div class="plot-summary-final" title="Sinopsis">
              <span class="detail-label" title="Sinopsis"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-synopsis"></use></svg></span>
              <span data-template="synopsis">${escapeHtml(preserveHyphenatedWords(movie.synopsis || 'Sinopsis no disponible.'))}</span>
            </div>
          </div>

          <!-- Overlay deslizante completo de reparto y géneros detallados (se activa al pulsar + en reparto) -->
          <div class="actors-scrollable-content">
            ${rawGenres.length > 0 ? `
              <h4>Géneros</h4>
              <div class="actors-list-text genres-list-text">
                ${rawGenres.map(g => {
                  const s = genreToSlug(g) || toSlug(g);
                  return `<a class="actor-list-item genre-list-item" href="${baseUrl}?_p=/${s}/">${escapeHtml(preserveHyphenatedWords(g))}</a>`;
                }).join('')}
              </div>
            ` : ''}
            ${actors.length > 0 ? `
              <h4>Reparto</h4>
              <div class="actors-list-text">
                ${actors.map(a => `<a class="actor-list-item" href="${baseUrl}?_p=/actor/${toSlug(a)}/">${escapeHtml(preserveHyphenatedWords(a))}</a>`).join('')}
              </div>
            ` : ''}
          </div>

          <button type="button" class="expand-content-btn" aria-label="Expandir sinopsis">+</button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renderiza la página HTML completa para la taxonomía en el Edge.
 * 
 * @param {object} taxInfo Información de la taxonomía resuelta
 * @param {Array} items Lista de películas/series destacadas
 * @param {object} options Opciones de contexto ({ siteOrigin, storageUrl, baseUrl })
 * @returns {string} HTML5 válido y semántico
 */
export function renderTaxonomyHtml(taxInfo, items, options = {}) {
  const siteOrigin = options.siteOrigin || 'https://videoclub.digital';
  const baseUrl = options.baseUrl || '/';
  const storageUrl = options.storageUrl || 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public';
  const canonicalUrl = taxInfo.canonicalPath 
    ? `${siteOrigin}${taxInfo.canonicalPath}`
    : `${siteOrigin}/${taxInfo.canonicalSlug}/`;
  const spaRedirectUrl = `${baseUrl}?_p=/${taxInfo.canonicalSlug}/`;

  const topMovie = items && items.length > 0 ? items[0] : null;
  const ogImageUrl = topMovie && topMovie.slug 
    ? `${siteOrigin}/posters/${topMovie.slug}.webp` 
    : `${storageUrl}/assets/og-default.jpg`;

  // 1. Schema.org CollectionPage + ItemList
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": taxInfo.title,
    "description": taxInfo.description,
    "url": canonicalUrl,
    "inLanguage": "es",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": items.length,
      "itemListElement": items.map((m, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": (m.type && String(m.type).toLowerCase().startsWith('s')) ? "TVSeries" : "Movie",
          "name": m.title || m.original_title,
          "url": `${siteOrigin}/titulo/${m.slug}/`,
          "image": `${siteOrigin}/posters/${m.slug}.webp`,
          ...(m.year ? { "datePublished": String(m.year) } : {}),
          ...(m.fa_rating ? {
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": String(m.fa_rating),
              "bestRating": "10",
              "worstRating": "1",
              "ratingCount": m.fa_votes || 1
            }
          } : {})
        }
      }))
    }
  };

  // 2. Schema.org BreadcrumbList
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Videoclub",
        "item": `${siteOrigin}/`
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": taxInfo.categoryBreadcrumb,
        "item": `${siteOrigin}/`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": taxInfo.name,
        "item": canonicalUrl
      }
    ]
  };

  // 3. Speculation Rules API (Prerender SPA y prefetch de primeros títulos)
  const topSlugsUrls = items.slice(0, 5).map(m => `${siteOrigin}/titulo/${m.slug}/`);
  const speculationRules = {
    prerender: [{ source: "list", urls: ["/"] }],
    prefetch: [{ source: "list", urls: topSlugsUrls }]
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronización exacta de modo claro/oscuro entre SPA y SEO -->
  <script>
    (function () {
      try {
        var cookieMatch = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);
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
  </script>
  <title>${escapeHtml(taxInfo.seoTitle)}</title>
  <meta name="description" content="${escapeAttr(taxInfo.description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(taxInfo.seoTitle)}" />
  <meta property="og:description" content="${escapeAttr(taxInfo.description)}" />
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${escapeAttr(ogImageUrl)}" />
  <meta property="og:site_name" content="Videoclub Digital" />
  <meta property="og:locale" content="es_ES" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(taxInfo.seoTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(taxInfo.description)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />

  <!-- Tipografía Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Structured Data: CollectionPage & Breadcrumbs -->
  <script type="application/ld+json">${safeJsonLd(collectionSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbSchema)}</script>
  <script type="speculationrules">${safeJsonLd(speculationRules)}</script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens y contrato completo de tarjeta) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v7.css" />
  <link rel="icon" type="image/svg+xml" href="${baseUrl}favicon.svg" />
</head>
<body class="collection-wall">
  <div class="main-layout">
    <div class="main-content-wrapper">
      <!-- Cabecera Minimalista Estilo SPA -->
      <header class="main-header">
        <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto;">
          <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
            <span class="logo-line-1">videoclub</span>
            <span class="logo-line-2">.digital</span>
          </a>
          
          <!-- Controles de cabecera: filtro activo -->
          <div class="active-filters-list" style="display:flex; align-items:center; gap:8px; margin:0; padding:0;">
            ${taxInfo.type === 'selection' ? `
              <span class="filter-pill is-active is-static" style="cursor:default; pointer-events:none;">
                <span>${escapeHtml(taxInfo.name)}</span>
              </span>
            ` : `
              <a href="${escapeAttr(spaRedirectUrl)}" class="filter-pill is-active" title="Abrir ${escapeAttr(taxInfo.name)} en el videoclub interactivo" style="text-decoration:none;">
                <span>${escapeHtml(taxInfo.name)}</span>
              </a>
            `}
          </div>
        </div>
      </header>

      <!-- Muro Principal de Películas (42 fichas oficiales) -->
      <main class="content">
        <h1 class="sr-only">${escapeHtml(taxInfo.title)}</h1>
        <section id="grid-container" class="grid-container" aria-label="Películas de ${escapeAttr(taxInfo.name)}">
          ${items.map((m, index) => renderSpaMovieCard(m, index, siteOrigin, baseUrl)).join('')}
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

  <!-- Handler de expansión de reparto y sinopsis en Vanilla JS -->
  <script>
    (function () {
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
              expandBtn.setAttribute("aria-label", "Expandir sinopsis");
              var scrolls = back.querySelectorAll(".scrollable-content, .actors-scrollable-content");
              scrolls.forEach(function (s) { s.scrollTop = 0; });
            } else {
              back.classList.add("is-expanded");
              expandBtn.textContent = "−";
              expandBtn.setAttribute("aria-label", "Contraer sinopsis");
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
              btn.setAttribute("aria-label", "Expandir sinopsis");
            }
            var scrolls = expandedBack.querySelectorAll(".scrollable-content, .actors-scrollable-content");
            scrolls.forEach(function (s) { s.scrollTop = 0; });
            return;
          }
        }
      });
    })();
  </script>
</body>
</html>`;
}
