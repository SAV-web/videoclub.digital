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
  sanitizeExternalUrl,
  parseList,
  isSeriesType,
  formatRuntime,
  formatYear,
  getTitleLengthClass,
  computeRatingPresentation,
  preserveHyphenatedWords,
  toSlug,
  genreToSlug,
  STUDIO_DATA,
  getPosterUrl,
  buildItemListSchema,
  SPECULATION_RULES
} from './seo-types.js';
import { renderSeoHead, renderStarsHtml, renderCollectionWallPage } from './html-fragments.js';

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
  const posterUrl = `${siteOrigin}${getPosterUrl(slug)}`;

  // Estrellas continuas (0-3), clip-path y barras de votos FilmAffinity / IMDb
  const {
    isSuspenso,
    avgStars,
    clip1,
    clip2,
    clip3,
    faBarWidth,
    imdbBarWidth,
    formattedFaVotes,
    formattedImdbVotes
  } = computeRatingPresentation(movie);

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
  const safeJw = sanitizeExternalUrl(movie.justwatch);
  const safeWiki = sanitizeExternalUrl(movie.wikipedia);
  const safeFa = sanitizeExternalUrl(movie.fa_id);
  const safeImdb = sanitizeExternalUrl(movie.imdb_id);

  // Directores frontal (enlace directo a la SPA con filtro activo)
  const directorsHtml = directors.map((name, i) => `
    <a href="${baseUrl}?_p=/director/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < directors.length - 1 ? ', ' : ''}
  `).join('');

  // Iconos estudios (no clickables, idénticos a la SPA)
  const validStudios = studios.filter(code => STUDIO_DATA[code]);
  const studiosHtml = validStudios.map(code => {
    const conf = STUDIO_DATA[code];
    return `
      <span class="platform-icon ${conf.class}" title="${escapeHtml(conf.title)}">
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
            <img
              src="${escapeHtml(posterUrl)}"
              alt="Póster de ${escapeHtml(title)}"
              width="428"
              height="535"
              loading="${index < 6 ? 'eager' : 'lazy'}"
              ${index === 0 ? 'fetchpriority="high"' : ''}
              class="${movie.thumbhash_st ? 'lazy-lqip' : 'loaded'}"
              ${movie.thumbhash_st ? `style="background-image: url('${escapeHtml(movie.thumbhash_st)}'); background-size: cover; background-position: center;" onload="this.classList.add('loaded')"` : ''}
              onerror="this.style.opacity='0.2'"
            />
            <div class="poster-overlay-guard"></div>
            <div class="card-rating-block">
              <a href="${baseUrl}?movie=${movie.id}" class="star-rating-container has-average-rating is-interactive" aria-label="Ver valoración y ficha de ${escapeHtml(title)}" style="text-decoration: none; color: inherit; cursor: pointer;">
                ${renderStarsHtml({ isSuspenso, avgStars, clip1, clip2, clip3 }, baseUrl)}
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
                    <a class="country-info" href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : '#'}" title="${escapeHtml(countryName)}" aria-label="Ver títulos de ${escapeHtml(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeHtml(countryCode.toLowerCase())}"></use>
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
              ${safeJw ? `
                <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeHtml(safeJw)}" title="Ver en JustWatch" data-template="justwatch-link">
                  <svg class="rating-icon" fill="#9A1485"><use href="${baseUrl}sprite.svg#icon-justwatch"></use></svg>
                </a>
              ` : ''}
              ${safeWiki ? `
                <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeHtml(safeWiki)}" title="Ver en Wikipedia" data-template="wikipedia-link">
                  <svg class="rating-icon" fill="#B3404A"><use href="${baseUrl}sprite.svg#icon-wikipedia"></use></svg>
                </a>
              ` : ''}
            </div>
          </div>

          <div class="ratings-container">
            ${movie.fa_rating ? `
              <div class="rating-line">
                <a target="_blank" rel="noopener noreferrer" class="rating-left ${safeFa ? '' : 'disabled'}" ${safeFa ? `href="${escapeHtml(safeFa)}"` : ''} data-template="fa-link">
                  <svg class="rating-icon"><use href="${baseUrl}sprite.svg#icon-filmaffinity"></use></svg>
                  <span data-template="fa-rating">${movie.fa_rating.toFixed(1)}</span>
                </a>
                <span class="rating-votes-count">${escapeHtml(formattedFaVotes)}</span>
                <div class="rating-bar-container" data-votes="${escapeHtml(formattedFaVotes)}">
                  <div class="rating-bar" style="width: ${faBarWidth}%;"></div>
                </div>
              </div>
            ` : ''}
            ${movie.imdb_rating ? `
              <div class="rating-line">
                <a target="_blank" rel="noopener noreferrer" class="rating-left ${safeImdb ? '' : 'disabled'}" ${safeImdb ? `href="${escapeHtml(safeImdb)}"` : ''} data-template="imdb-link">
                  <svg class="rating-icon" fill="#F5C618"><use href="${baseUrl}sprite.svg#icon-imdb"></use></svg>
                  <span data-template="imdb-rating">${movie.imdb_rating.toFixed(1)}</span>
                </a>
                <span class="rating-votes-count">${escapeHtml(formattedImdbVotes)}</span>
                <div class="rating-bar-container" data-votes="${escapeHtml(formattedImdbVotes)}">
                  <div class="rating-bar" style="width: ${imdbBarWidth}%;"></div>
                </div>
              </div>
            ` : ''}
          </div>

          ${displayOriginalTitle ? `
            <div class="back-original-title-wrapper">
              <a href="${baseUrl}?movie=${movie.id}" class="back-original-title-link" aria-label="Abrir ${escapeHtml(title)} en el videoclub" title="Abrir en el videoclub">
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
            <div class="plot-summary-final">
              <span class="detail-label"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-synopsis"></use></svg></span>
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
    ? `${siteOrigin}${getPosterUrl(topMovie)}` 
    : `${storageUrl}/assets/og-default.jpg`;

  // 1. Schema.org CollectionPage + ItemList
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": taxInfo.title,
    "description": taxInfo.description,
    "url": canonicalUrl,
    "inLanguage": "es",
    "mainEntity": buildItemListSchema(items, siteOrigin)
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

  // 3. Speculation Rules API (Prerender SPA y rutas de navegación frecuente)
  const speculationRules = SPECULATION_RULES;

  const headHtml = renderSeoHead({
    title: taxInfo.seoTitle,
    description: taxInfo.description,
    canonicalUrl,
    ogType: 'website',
    ogImageUrl,
    includeRobots: true,
    baseUrl,
    schemas: [collectionSchema, breadcrumbSchema],
    speculationRules,
  });

  const headerFilterHtml = taxInfo.type === 'selection'
    ? `<span class="filter-pill is-active is-static" style="cursor:default; pointer-events:none;">
                <span>${escapeHtml(taxInfo.name)}</span>
              </span>`
    : `<a href="${escapeHtml(spaRedirectUrl)}" class="filter-pill is-active" title="Abrir ${escapeHtml(taxInfo.name)} en el videoclub interactivo" style="text-decoration:none;">
                <span>${escapeHtml(taxInfo.name)}</span>
              </a>`;

  return renderCollectionWallPage({
    headHtml,
    headerFilterHtml,
    h1Title: taxInfo.title,
    gridAriaLabel: `Películas de ${taxInfo.name}`,
    gridContentHtml: items.map((m, index) => renderSpaMovieCard(m, index, siteOrigin, baseUrl)).join(''),
    baseUrl,
    expandNoun: 'sinopsis',
  });
}
