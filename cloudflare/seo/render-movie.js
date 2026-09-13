/**
 * =================================================================
 *   EDGE SEO RENDERER (cloudflare/seo/render-movie.js)
 * =================================================================
 * Módulo modular independiente que renderiza la ficha HTML completa,
 * semántica, segura (con escapado) y con paridad contractual respecto
 * al antiguo template Astro.
 */

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
  getPosterUrl,
  toSlug,
  genreToSlug,
  STUDIO_DATA
} from './seo-types.js';

const SQRT_MAX_VOTES = {
  FA: Math.sqrt(220000),
  IMDB: Math.sqrt(3200000)
};

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function renderMovieHtml(movie, options = {}) {
  const siteOrigin = options.siteOrigin || 'https://videoclub.digital';
  const baseUrl = options.baseUrl || '/';

  const isSeries = isSeriesType(movie.type);
  const mediaTypePath = isSeries ? 'series' : 'peliculas';
  const mediaTypeName = isSeries ? 'Series' : 'Películas';

  const posterPath = getPosterUrl(movie);
  const absolutePosterUrl = posterPath ? `${siteOrigin}${posterPath}` : '';

  const rawGenres = parseList(movie.genres_list);
  const directors = parseList(movie.directors_list);
  const actors = parseList(movie.actors_list);
  const studios = parseList(movie.studios_list);

  const canonicalUrl = `${siteOrigin}/titulo/${movie.slug}/`;

  const pageTitle = `${movie.title}${movie.year ? ` (${movie.year})` : ''} — Videoclub Digital`;
  const description = movie.synopsis
    ? movie.synopsis.slice(0, 155) + (movie.synopsis.length > 155 ? '…' : '')
    : `Ficha de ${movie.title} en Videoclub Digital.`;

  const countryCode = movie.countries?.code || null;
  const countryName = movie.countries?.name || '';
  const countrySlug = countryName ? toSlug(countryName) : null;

  const firstDirector = directors.length > 0 ? directors[0] : null;
  const firstDirectorSlug = firstDirector ? toSlug(firstDirector) : null;
  const spaTargetUrl = firstDirectorSlug
    ? `${baseUrl}?_p=/director/${firstDirectorSlug}/&movie=${movie.id}`
    : `${baseUrl}?movie=${movie.id}`;

  const durationText = formatRuntime(movie.minutes, isSeries);
  const episodesText = isSeries && movie.episodes ? `${movie.episodes} x` : null;

  const titleLengthClass = getTitleLengthClass(movie.title);
  const displayOriginalTitle = movie.original_title?.trim() || movie.title;
  const origTitleLengthClass = getTitleLengthClass(displayOriginalTitle);

  // Estrellas continuas (0-3) y cálculo de clip-path
  const isSuspenso = typeof movie.avg_rating === 'number' && movie.avg_rating > 0 && movie.avg_rating <= 5.5;
  const avgStars = calculateAverageStars(movie.avg_rating);
  const clip1 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 0))) * 100;
  const clip2 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 1))) * 100;
  const clip3 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 2))) * 100;

  // Barras de votos FilmAffinity / IMDb
  const faBarWidth = movie.fa_votes ? Math.min(100, (Math.sqrt(movie.fa_votes) / SQRT_MAX_VOTES.FA) * 100) : 0;
  const imdbBarWidth = movie.imdb_votes ? Math.min(100, (Math.sqrt(movie.imdb_votes) / SQRT_MAX_VOTES.IMDB) * 100) : 0;
  const formattedFaVotes = formatVotesUnified(movie.fa_votes);
  const formattedImdbVotes = formatVotesUnified(movie.imdb_votes);

  const primaryGenre = rawGenres.length > 0 ? rawGenres[0] : null;
  const primaryGenreSlug = primaryGenre ? genreToSlug(primaryGenre) : null;

  // 1. JSON-LD Schema.org Movie / TVSeries
  const sameAs = [movie.imdb_id, movie.fa_id, movie.wikipedia, movie.justwatch].filter(Boolean);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isSeries ? 'TVSeries' : 'Movie',
    name: movie.title,
    ...(sameAs.length ? { sameAs } : {}),
    ...(movie.original_title ? { alternateName: movie.original_title } : {}),
    ...(movie.year ? { datePublished: String(movie.year) } : {}),
    ...(movie.synopsis ? { description: movie.synopsis } : {}),
    ...(absolutePosterUrl ? { image: absolutePosterUrl } : {}),
    ...(directors.length ? { director: directors.map(name => ({ '@type': 'Person', name })) } : {}),
    ...(actors.length ? { actor: actors.map(name => ({ '@type': 'Person', name })) } : {}),
    ...(movie.avg_rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: movie.avg_rating.toFixed(1),
            bestRating: '10',
            ratingCount: (movie.fa_votes || 0) + (movie.imdb_votes || 0),
          },
        }
      : {}),
  };

  // 2. BreadcrumbList Schema.org
  const breadcrumbElements = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: `${siteOrigin}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: mediaTypeName,
      item: `${siteOrigin}/${mediaTypePath}/`,
    },
  ];

  if (primaryGenre && primaryGenreSlug) {
    breadcrumbElements.push({
      '@type': 'ListItem',
      position: 3,
      name: primaryGenre,
      item: `${siteOrigin}/genero/${primaryGenreSlug}/${mediaTypePath}/`,
    });
  }

  breadcrumbElements.push({
    '@type': 'ListItem',
    position: breadcrumbElements.length + 1,
    name: movie.title,
    item: canonicalUrl,
  });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbElements,
  };

  // 3. Render HTML Markup
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
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
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />

  <!-- OpenGraph / Facebook / WhatsApp -->
  <meta property="og:type" content="video.movie" />
  <meta property="og:title" content="${escapeAttr(pageTitle)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  ${absolutePosterUrl ? `<meta property="og:image" content="${escapeAttr(absolutePosterUrl)}" />` : ''}
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(pageTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  ${absolutePosterUrl ? `<meta name="twitter:image" content="${escapeAttr(absolutePosterUrl)}" />` : ''}

  <!-- Tipografía Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Hoja de Estilos Externa Cacheable (SSOT con versionado perimetral) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v7.css" />

  <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbLd)}</script>

  <!-- Speculation Rules API: Prerender nativo instantáneo entre fichas de película (Chromium) -->
  <script type="speculationrules">
    {
      "prerender": [
        {
          "where": {
            "and": [
              { "href_matches": "/titulo/*" },
              { "not": { "href_matches": "/titulo/*#*" } }
            ]
          },
          "eagerness": "moderate"
        }
      ]
    }
  </script>
</head>
<body>
  <!-- Header Superior de Marca (Logo repartido a izquierda y derecha de la ficha) -->
  <header class="main-header movie-seo-header" style="position: relative; z-index: calc(var(--z-index-overlay, 1999) + 2);">
    <div class="header-content movie-header-content">
      <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
        <span class="logo-line-1">videoclub</span>
        <span class="logo-line-2">.digital</span>
      </a>
    </div>
  </header>

  <!-- Cortina Oscura (Overlay sin desenfoque/blur en vista SEO para preservar nitidez del fondo y clics en header) -->
  <a href="${baseUrl}" class="quick-view-overlay is-visible" style="backdrop-filter: none; -webkit-backdrop-filter: none; background-color: rgba(0, 0, 0, 0.05); text-decoration: none;" aria-label="Volver al videoclub"></a>

  <!-- Contenedor Ventana Modal (Quick View con z-index superior al header para evitar solapamientos con zoom) -->
  <div id="quick-view-modal" class="quick-view-modal is-visible" role="dialog" aria-modal="true" style="z-index: calc(var(--z-index-overlay, 1999) + 10);">
    <div id="quick-view-content" class="quick-view-content">
      
      <!-- Ficha de Película con contrato de clases de la SPA -->
      <article class="movie-card is-quick-view" data-movie-id="${movie.id}">
        <div class="flip-card-inner">

          <!-- COLUMNA IZQUIERDA EN DESKTOP / ARRIBA EN MÓVIL (FRONTCARD) -->
          <div class="flip-card-front">
            
            <!-- Contenedor del Póster -->
            <div class="poster-container">
              <a href="${escapeAttr(spaTargetUrl)}" class="poster-media-link" aria-label="Abrir ${escapeAttr(movie.title)} en el videoclub" style="display:block; width:100%; height:100%; position:relative; text-decoration:none; color:inherit;">
                ${posterPath ? `
                  <img 
                    src="${escapeAttr(posterPath)}" 
                    alt="Póster de ${escapeAttr(movie.title)}" 
                    width="400" 
                    height="496" 
                    loading="eager" 
                    fetchpriority="high"
                    class="loaded"
                  />
                ` : `
                  <div class="poster-fallback" style="aspect-ratio:2/3; display:flex; align-items:center; justify-content:center; font-size:3rem; background:var(--color-surface);">🎬</div>
                `}
                <div class="poster-overlay-guard"></div>
              </a>

              <!-- Bloque de estrellas y valoración -->
              <div class="card-rating-block">
                <a href="${escapeAttr(spaTargetUrl)}" class="star-rating-container has-average-rating is-interactive" style="display:flex; text-decoration:none;" title="Valorar en Videoclub Digital" aria-label="Valorar en Videoclub Digital">
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

                <!-- Botón CTA para abrir modal interactivo en SPA -->
                <a href="${escapeAttr(spaTargetUrl)}" class="card-action-btn" title="Añadir a mi lista en el videoclub" aria-label="Añadir a mi lista en el videoclub">
                  <svg class="icon-watchlist"><use href="${baseUrl}sprite.svg#icon-bookmark-plus"></use></svg>
                </a>
              </div>
            </div>

            <!-- Resumen: Título, Estudios y Año -->
            <div class="movie-info movie-summary">
              <div class="title-director-block">
                <h1 data-template="title" class="movie-main-title ${titleLengthClass}">
                  <a href="${escapeAttr(spaTargetUrl)}" class="movie-title-link" style="color:inherit; text-decoration:none;">${escapeHtml(movie.title)}</a>
                </h1>
              </div>

              <div class="movie-meta">
                ${studios.length > 0 ? `
                  <div class="card-icons-line">
                    ${studios.map(code => {
                      const conf = STUDIO_DATA[code];
                      if (!conf) return '';
                      return `
                        <span class="platform-icon ${conf.class}" title="${escapeAttr(conf.title)}">
                          <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="0 0 24 24">
                            <use href="${baseUrl}sprite.svg#${conf.id}"></use>
                          </svg>
                        </span>
                      `;
                    }).join('')}
                  </div>
                ` : ''}
                <div class="modal-horizontal-divider"></div>
                <div class="year-country-line">
                  <div class="year-flag-group">
                    ${movie.year ? `
                      <span data-template="year">
                        <a href="${baseUrl}?year=${movie.year}" class="year-link">${movie.year}</a>${escapeHtml(formatYear(movie.year, movie.year_end, isSeries, '', movie.type).substring(String(movie.year).length))}
                      </span>
                    ` : ''}
                    ${countryCode ? `
                      <a href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : '#'}" class="country-info" data-template="country-container" style="display:flex; text-decoration:none;" title="${escapeAttr(countryName)}" aria-label="Ver títulos de ${escapeAttr(countryName)} en el videoclub">
                        <span class="country-flag-icon" title="${escapeAttr(countryName)}">
                          <svg width="28" height="28"><use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use></svg>
                        </span>
                      </a>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- COLUMNA DERECHA EN DESKTOP / ABAJO EN MÓVIL (FRONTCARD) -->
          <div class="flip-card-back">
            
            <!-- Duración, Episodios y Links Externos -->
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

            <!-- Sección Puntuaciones: FilmAffinity e IMDb con barras -->
            <div class="ratings-container">
              ${movie.fa_rating ? `
                <div class="rating-line">
                  <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.fa_id || '#')}" data-template="fa-link">
                    <svg class="rating-icon"><use href="${baseUrl}sprite.svg#icon-filmaffinity"></use></svg>
                    <span data-template="fa-rating">${movie.fa_rating.toFixed(1)}</span>
                  </a>
                  <span class="rating-votes-count">${escapeHtml(formattedFaVotes)}</span>
                  <div class="rating-bar-container" style="display:block;" data-votes="${escapeAttr(formattedFaVotes)}">
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
                  <div class="rating-bar-container" style="display:block;" data-votes="${escapeAttr(formattedImdbVotes)}">
                    <div class="rating-bar" style="width: ${imdbBarWidth}%;"></div>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Título Original tras las Puntuaciones -->
            <div class="back-original-title-wrapper">
              <a href="${escapeAttr(spaTargetUrl)}" class="back-original-title-link" aria-label="Abrir ${escapeAttr(movie.title)} en el videoclub" title="Abrir en el videoclub">
                <span data-template="original-title" class="${origTitleLengthClass}">${escapeHtml(displayOriginalTitle)}</span>
              </a>
            </div>

            <!-- Director tras el Título Original -->
            ${directors.length > 0 ? `
              <div class="front-director-info" data-template="director">
                ${directors.map((name, i) => `
                  <a href="${baseUrl}director/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < directors.length - 1 ? ', ' : ''}
                `).join('')}
              </div>
            ` : ''}

            <!-- Géneros y Reparto Principal -->
            <div class="details-list">
              ${rawGenres.length > 0 ? `
                <div class="detail-item" data-template="genre-container">
                  <span class="detail-label">
                    <svg class="detail-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-clapperboard"></use></svg>
                  </span>
                  <strong class="detail-label-title">Género.</strong>
                  <span class="detail-data" data-template="genre">
                    <span>${escapeHtml(preserveHyphenatedWords(rawGenres.join(', ')))}</span>
                  </span>
                </div>
              ` : ''}

              ${actors.length > 0 ? `
                <div class="detail-item" data-template="actors-container">
                  <span class="detail-label">
                    <svg class="detail-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-cast"></use></svg>
                  </span>
                  <strong class="detail-label-title">Reparto.</strong>
                  <span class="detail-data" data-template="actors">
                    ${actors.map((name, i) => `
                      <a href="${baseUrl}actor/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < actors.length - 1 ? ', ' : ''}
                    `).join('')}
                  </span>
                </div>
              ` : ''}
            </div>

            <!-- Sinopsis -->
            ${movie.synopsis ? `
              <div class="scrollable-content">
                <div class="plot-summary-final" title="Sinopsis">
                  <span class="detail-label">
                    <svg class="detail-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-synopsis"></use></svg>
                  </span>
                  <strong class="detail-label-title">Sinopsis.</strong>
                  <span data-template="synopsis">${escapeHtml(preserveHyphenatedWords(movie.synopsis))}</span>
                </div>
              </div>
            ` : ''}

          </div>

        </div>
      </article>

    </div>
  </div>


</body>
</html>
`;
}
