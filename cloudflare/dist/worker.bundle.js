// cloudflare/seo/seo-types.js
var MOVIE_PROJECTION = [
  "id",
  "title",
  "original_title",
  "slug",
  "year",
  "year_end",
  "type",
  "genres_list",
  "directors_list",
  "actors_list",
  "studios_list",
  "synopsis",
  "minutes",
  "episodes",
  "fa_id",
  "fa_rating",
  "fa_votes",
  "imdb_id",
  "imdb_rating",
  "imdb_votes",
  "avg_rating",
  "wikipedia",
  "justwatch",
  "countries(name, code)"
].join(", ");
var POSTER_BASE_URL = "/posters/";
var STUDIO_DATA = {
  netflix: { id: "icon-netflix", class: "netflix-icon", title: "Netflix", w: 20, h: 20 },
  disney: { id: "icon-disney", class: "disney-icon", title: "Disney", w: 20, h: 20 },
  warner: { id: "icon-wb", class: "wb-icon", title: "Warner Bros.", w: 20, h: 20 },
  universal: { id: "icon-universal", class: "universal-icon", title: "Universal", w: 20, h: 20 },
  sony: { id: "icon-sony", class: "sony-icon", title: "Sony-Columbia", w: 20, h: 20 },
  paramount: { id: "icon-paramount", class: "paramount-icon", title: "Paramount", w: 20, h: 20 },
  lionsgate: { id: "icon-lionsgate", class: "lionsgate-icon", title: "Lionsgate", w: 20, h: 20 },
  amazon: { id: "icon-amazon", class: "amazon-icon", title: "Amazon MGM", w: 20, h: 20 },
  fox: { id: "icon-twenty", class: "twenty-icon", title: "20th Century Fox", w: 20, h: 20 },
  a24: { id: "icon-a24", class: "a24-icon", title: "A24", w: 20, h: 20 },
  movistar: { id: "icon-movistar", class: "movistar-icon", title: "Movistar", w: 20, h: 20 },
  miramax: { id: "icon-miramax", class: "miramax-icon", title: "Miramax", w: 20, h: 20 },
  apple: { id: "icon-apple", class: "apple-icon", title: "Apple TV", w: 20, h: 20 },
  canalplus: { id: "icon-canalplus", class: "canalplus-icon", title: "StudioCanal", w: 20, h: 20 },
  bbc: { id: "icon-bbc", class: "bbc-icon", title: "BBC", w: 20, h: 20 }
};
var OFFICIAL_GENRES = [
  "Acci\xF3n",
  "Animaci\xF3n",
  "Aventuras",
  "B\xE9lico",
  "Biograf\xEDa",
  "Noir",
  "Comedia",
  "Crimen",
  "Deporte",
  "Documental",
  "Drama",
  "Familiar",
  "Fantas\xEDa",
  "Hist\xF3rico",
  "Intriga",
  "M\xFAsica",
  "Romance",
  "Sci-Fi",
  "Terror",
  "Thriller",
  "Western"
];
function toSlug(text) {
  if (!text) return "";
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
var GENRE_SLUG_MAP = Object.fromEntries(
  OFFICIAL_GENRES.map((g) => [toSlug(g), g])
);
function genreToSlug(name) {
  if (!name) return null;
  const s = toSlug(name);
  return GENRE_SLUG_MAP[s] ? s : null;
}
function escapeHtml(str) {
  if (str === null || str === void 0) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(str) {
  return escapeHtml(str);
}
function parseList(value) {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function isSeriesType(type) {
  return Boolean(type && String(type).trim().toLowerCase().startsWith("s"));
}
function formatRuntime(minutes, isSeries = false) {
  const num = typeof minutes === "number" ? minutes : parseInt(String(minutes || 0), 10);
  if (!num || isNaN(num) || num <= 0) {
    return isSeries ? "Serie TV" : "Pel\xEDcula";
  }
  if (isSeries) {
    return `${num}\u2032`;
  }
  const hrs = Math.floor(num / 60);
  const mins = num % 60;
  if (hrs === 0) return `${mins} m`;
  if (mins === 0) return `${hrs} h`;
  return `${hrs} h ${mins} m`;
}
function formatYear(year, yearEnd, isSeries = false, fallback = "", type = "") {
  if (!year) return fallback;
  const text = String(year);
  const typeUpper = (type || "").toUpperCase().trim();
  const isMini = typeUpper === "SM" || typeUpper === "SAM" || typeUpper === "SDM" || String(yearEnd).trim().toUpperCase() === "M";
  const isOngoing = typeUpper.startsWith("S") && typeUpper.endsWith("-") || String(yearEnd).trim().toLowerCase() === "current" || String(yearEnd).trim().toLowerCase() === "present" || String(yearEnd).trim().toLowerCase() === "actualidad" || String(yearEnd).trim() === "-";
  if (isSeries) {
    if (isOngoing) return `${text}-`;
    if (yearEnd && String(yearEnd).trim() !== "M" && String(yearEnd).trim() !== "") {
      const normEnd = String(yearEnd).trim();
      const endSuffix = normEnd.length === 4 ? normEnd.slice(-2) : normEnd;
      const formatted = `${text}-${endSuffix}`;
      return isMini ? `${formatted} (M)` : formatted;
    }
    if (isMini) return `${text} (M)`;
  }
  return text;
}
function getTitleLengthClass(title) {
  if (!title) return "";
  const len = title.length;
  if (len > 70) return "title-xxxl-long";
  if (len > 50) return "title-xxl-long";
  if (len > 35) return "title-xl-long";
  if (len > 25) return "title-long";
  if (len > 15) return "title-medium";
  return "";
}
var MIN_STAR_THRESHOLD = 5.5;
function calculateAverageStars(averageRating) {
  if (averageRating === null || averageRating === void 0 || averageRating <= MIN_STAR_THRESHOLD) return 0;
  if (averageRating >= 9) return 3;
  return (averageRating - MIN_STAR_THRESHOLD) / 3.5 * 3;
}
function formatVotesUnified(votes) {
  if (votes === null || votes === void 0 || votes === "") return "";
  const numVotes = typeof votes === "number" ? votes : parseInt(String(votes).replace(/\D/g, ""), 10);
  if (!numVotes || isNaN(numVotes) || numVotes <= 0) return "";
  if (numVotes >= 1e6) {
    const roundedThousand = Math.round(numVotes / 1e3) * 1e3;
    const millions = Math.round(roundedThousand / 1e4) / 100;
    const formatted = String(millions).replace(".", ",");
    return `${formatted} M`;
  }
  if (numVotes >= 1e5) {
    const k = Math.round(numVotes / 1e3);
    if (k >= 1e3) return "1 M";
    return `${k} k`;
  }
  if (numVotes >= 1e4) {
    const rounded = Math.round(numVotes / 500) * 500;
    if (rounded >= 1e5) return `${rounded / 1e3} k`;
    return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  if (numVotes >= 1e3) {
    const rounded = Math.round(numVotes / 100) * 100;
    return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  if (numVotes >= 100) {
    const rounded = Math.round(numVotes / 50) * 50;
    return String(rounded);
  }
  return "100";
}
function preserveHyphenatedWords(text) {
  if (!text) return "";
  const sanitized = text.replace(/\s+([,.:;!?])/g, "$1");
  return sanitized.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])-(?=[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])/g, "$1\u2011");
}
function getPosterUrl(movie) {
  if (!movie || !movie.slug) return "";
  return `${POSTER_BASE_URL}${movie.slug}.webp`;
}

// cloudflare/seo/render-movie.js
var SQRT_MAX_VOTES = {
  FA: Math.sqrt(22e4),
  IMDB: Math.sqrt(32e5)
};
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
function renderMovieHtml(movie, options = {}) {
  const siteOrigin = options.siteOrigin || "https://videoclub.digital";
  const baseUrl = options.baseUrl || "/";
  const isSeries = isSeriesType(movie.type);
  const mediaTypePath = isSeries ? "series" : "peliculas";
  const mediaTypeName = isSeries ? "Series" : "Pel\xEDculas";
  const posterPath = getPosterUrl(movie);
  const absolutePosterUrl = posterPath ? `${siteOrigin}${posterPath}` : "";
  const rawGenres = parseList(movie.genres_list);
  const directors = parseList(movie.directors_list);
  const actors = parseList(movie.actors_list);
  const studios = parseList(movie.studios_list);
  const canonicalUrl = `${siteOrigin}/titulo/${movie.slug}/`;
  const pageTitle = `${movie.title}${movie.year ? ` (${movie.year})` : ""} \u2014 Videoclub Digital`;
  const description = movie.synopsis ? movie.synopsis.slice(0, 155) + (movie.synopsis.length > 155 ? "\u2026" : "") : `Ficha de ${movie.title} en Videoclub Digital.`;
  const countryCode = movie.countries?.code || null;
  const countryName = movie.countries?.name || "";
  const durationText = formatRuntime(movie.minutes, isSeries);
  const episodesText = movie.episodes ? `${movie.episodes} ep` : null;
  const titleLengthClass = getTitleLengthClass(movie.title);
  const displayOriginalTitle = movie.original_title?.trim() || movie.title;
  const origTitleLengthClass = getTitleLengthClass(displayOriginalTitle);
  const isSuspenso = typeof movie.avg_rating === "number" && movie.avg_rating > 0 && movie.avg_rating <= 5.5;
  const avgStars = calculateAverageStars(movie.avg_rating);
  const clip1 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 0))) * 100;
  const clip2 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 1))) * 100;
  const clip3 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 2))) * 100;
  const faBarWidth = movie.fa_votes ? Math.min(100, Math.sqrt(movie.fa_votes) / SQRT_MAX_VOTES.FA * 100) : 0;
  const imdbBarWidth = movie.imdb_votes ? Math.min(100, Math.sqrt(movie.imdb_votes) / SQRT_MAX_VOTES.IMDB * 100) : 0;
  const formattedFaVotes = formatVotesUnified(movie.fa_votes);
  const formattedImdbVotes = formatVotesUnified(movie.imdb_votes);
  const primaryGenre = rawGenres.length > 0 ? rawGenres[0] : null;
  const primaryGenreSlug = primaryGenre ? genreToSlug(primaryGenre) : null;
  const sameAs = [movie.imdb_id, movie.fa_id, movie.wikipedia, movie.justwatch].filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": isSeries ? "TVSeries" : "Movie",
    name: movie.title,
    ...sameAs.length ? { sameAs } : {},
    ...movie.original_title ? { alternateName: movie.original_title } : {},
    ...movie.year ? { datePublished: String(movie.year) } : {},
    ...movie.synopsis ? { description: movie.synopsis } : {},
    ...absolutePosterUrl ? { image: absolutePosterUrl } : {},
    ...directors.length ? { director: directors.map((name) => ({ "@type": "Person", name })) } : {},
    ...actors.length ? { actor: actors.map((name) => ({ "@type": "Person", name })) } : {},
    ...movie.avg_rating ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: movie.avg_rating.toFixed(1),
        bestRating: "10",
        ratingCount: (movie.fa_votes || 0) + (movie.imdb_votes || 0)
      }
    } : {}
  };
  const breadcrumbElements = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Inicio",
      item: `${siteOrigin}/`
    },
    {
      "@type": "ListItem",
      position: 2,
      name: mediaTypeName,
      item: `${siteOrigin}/${mediaTypePath}/`
    }
  ];
  if (primaryGenre && primaryGenreSlug) {
    breadcrumbElements.push({
      "@type": "ListItem",
      position: 3,
      name: primaryGenre,
      item: `${siteOrigin}/genero/${primaryGenreSlug}/${mediaTypePath}/`
    });
  }
  breadcrumbElements.push({
    "@type": "ListItem",
    position: breadcrumbElements.length + 1,
    name: movie.title,
    item: canonicalUrl
  });
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbElements
  };
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronizaci\xF3n de modo claro/oscuro con el grid -->
  <script>
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored === "dark" || (!stored && systemDark);
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else if (stored === "light" || (!stored && !systemDark)) {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  <\/script>
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />

  <!-- OpenGraph / Facebook / WhatsApp -->
  <meta property="og:type" content="video.movie" />
  <meta property="og:title" content="${escapeAttr(pageTitle)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  ${absolutePosterUrl ? `<meta property="og:image" content="${escapeAttr(absolutePosterUrl)}" />` : ""}
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(pageTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  ${absolutePosterUrl ? `<meta name="twitter:image" content="${escapeAttr(absolutePosterUrl)}" />` : ""}

  <!-- Tipograf\xEDa Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Hoja de Estilos Externa Cacheable (SSOT con cache busting) -->
  <link rel="stylesheet" href="${baseUrl}seo-card.css?v=2" />

  <script type="application/ld+json">${safeJsonLd(jsonLd)}<\/script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbLd)}<\/script>

  <!-- Speculation Rules API: Prerender nativo instant\xE1neo entre fichas de pel\xEDcula (Chromium) -->
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
  <\/script>
</head>
<body>
  <!-- Header Superior de Marca -->
  <header class="site-header">
    <div class="header-content">
      <a href="${baseUrl}" class="brand-logo" aria-label="Videoclub Digital">
        <span class="logo-line-1">videoclub</span>
        <span class="logo-line-2">.digital</span>
      </a>
      <div class="header-controls">
        <a href="${baseUrl}?movie=${movie.id}" class="btn-header-cta" title="Abrir ficha en el videoclub" aria-label="Abrir ficha en el videoclub">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </a>
      </div>
    </div>
  </header>

  <!-- Cortina Oscura (Overlay) -->
  <div class="quick-view-overlay is-visible"></div>

  <!-- Contenedor Ventana Modal (Quick View) -->
  <div id="quick-view-modal" class="quick-view-modal is-visible" role="dialog" aria-modal="true">
    <div id="quick-view-content" class="quick-view-content">
      
      <!-- Ficha de Pel\xEDcula con contrato de clases de la SPA -->
      <article class="movie-card is-quick-view" data-movie-id="${movie.id}">
        <div class="flip-card-inner">

          <!-- COLUMNA IZQUIERDA EN DESKTOP / ARRIBA EN M\xD3VIL (FRONTCARD) -->
          <div class="flip-card-front">
            
            <!-- Contenedor del P\xF3ster -->
            <div class="poster-container">
              ${posterPath ? `
                <img 
                  src="${escapeAttr(posterPath)}" 
                  alt="P\xF3ster de ${escapeAttr(movie.title)}" 
                  width="400" 
                  height="496" 
                  loading="eager" 
                  fetchpriority="high"
                  class="loaded"
                />
              ` : `
                <div class="poster-fallback" style="aspect-ratio:2/3; display:flex; align-items:center; justify-content:center; font-size:3rem; background:var(--color-surface);">\u{1F3AC}</div>
              `}
              <div class="poster-overlay-guard"></div>

              <!-- Bloque de estrellas y valoraci\xF3n -->
              <div class="card-rating-block">
                <a href="${baseUrl}?movie=${movie.id}" class="star-rating-container has-average-rating is-interactive" style="display:flex; text-decoration:none;" title="Valorar en Videoclub Digital" aria-label="Valorar en Videoclub Digital">
                  <svg class="star-icon" data-rating-level="1" style="${isSuspenso || avgStars > 0 ? "opacity: 1;" : "opacity: 0;"}">
                    <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                    <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip1}% 0 0);"></use>
                  </svg>
                  <svg class="star-icon" data-rating-level="2" style="${!isSuspenso && avgStars > 1 ? "opacity: 1;" : "opacity: 0;"}">
                    <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                    <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip2}% 0 0);"></use>
                  </svg>
                  <svg class="star-icon" data-rating-level="3" style="${!isSuspenso && avgStars > 2 ? "opacity: 1;" : "opacity: 0;"}">
                    <use class="star-icon-path star-icon-path--empty" href="${baseUrl}sprite.svg#icon-star"></use>
                    <use class="star-icon-path star-icon-path--filled" href="${baseUrl}sprite.svg#icon-star" style="clip-path: inset(0 ${clip3}% 0 0);"></use>
                  </svg>
                </a>

                <!-- Bot\xF3n CTA para abrir modal interactivo en SPA -->
                <a href="${baseUrl}?movie=${movie.id}" class="card-action-btn" title="A\xF1adir a mi lista en el videoclub" aria-label="A\xF1adir a mi lista en el videoclub">
                  <svg class="icon-watchlist"><use href="${baseUrl}sprite.svg#icon-bookmark-plus"></use></svg>
                </a>
              </div>
            </div>

            <!-- Resumen: T\xEDtulo, Estudios y A\xF1o -->
            <div class="movie-info movie-summary">
              <div class="title-director-block">
                <h1 data-template="title" class="movie-main-title ${titleLengthClass}">${escapeHtml(movie.title)}</h1>
              </div>

              <div class="movie-meta">
                ${studios.length > 0 ? `
                  <div class="card-icons-line">
                    ${studios.map((code) => {
    const conf = STUDIO_DATA[code];
    if (!conf) return "";
    return `
                        <span class="platform-icon ${conf.class}" title="${escapeAttr(conf.title)}">
                          <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="0 0 24 24">
                            <use href="${baseUrl}sprite.svg#${conf.id}"></use>
                          </svg>
                        </span>
                      `;
  }).join("")}
                  </div>
                ` : ""}
                <div class="modal-horizontal-divider"></div>
                <div class="year-country-line">
                  <div class="year-flag-group">
                    ${movie.year ? `
                      <span data-template="year">
                        <a href="${baseUrl}?year=${movie.year}" class="year-link">${movie.year}</a>${escapeHtml(formatYear(movie.year, movie.year_end, isSeries, "", movie.type).substring(String(movie.year).length))}
                      </span>
                    ` : ""}
                    ${countryCode ? `
                      <span class="country-info" data-template="country-container" style="display:flex;">
                        <span class="country-flag-icon" title="${escapeAttr(countryName)}">
                          <svg width="28" height="28"><use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use></svg>
                        </span>
                      </span>
                    ` : ""}
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- COLUMNA DERECHA EN DESKTOP / ABAJO EN M\xD3VIL (FRONTCARD) -->
          <div class="flip-card-back">
            
            <!-- Duraci\xF3n, Episodios y Links Externos -->
            <div class="back-meta-header">
              <div class="episode-duration-group">
                ${episodesText ? `<span data-template="episodes">${escapeHtml(episodesText)}</span>` : ""}
                ${durationText ? `<span data-template="duration">${escapeHtml(durationText)}</span>` : ""}
                ${movie.justwatch ? `
                  <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeAttr(movie.justwatch)}" title="Ver en JustWatch" data-template="justwatch-link">
                    <svg class="rating-icon" fill="#9A1485"><use href="${baseUrl}sprite.svg#icon-justwatch"></use></svg>
                  </a>
                ` : ""}
                ${movie.wikipedia ? `
                  <a target="_blank" rel="noopener noreferrer" class="rating-line" href="${escapeAttr(movie.wikipedia)}" title="Ver en Wikipedia" data-template="wikipedia-link">
                    <svg class="rating-icon" fill="#B3404A"><use href="${baseUrl}sprite.svg#icon-wikipedia"></use></svg>
                  </a>
                ` : ""}
              </div>
            </div>

            <!-- Secci\xF3n Puntuaciones: FilmAffinity e IMDb con barras -->
            <div class="ratings-container">
              ${movie.fa_rating ? `
                <div class="rating-line">
                  <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.fa_id || "#")}" data-template="fa-link">
                    <svg class="rating-icon"><use href="${baseUrl}sprite.svg#icon-filmaffinity"></use></svg>
                    <span data-template="fa-rating">${movie.fa_rating.toFixed(1)}</span>
                  </a>
                  <span class="rating-votes-count">${escapeHtml(formattedFaVotes)}</span>
                  <div class="rating-bar-container" style="display:block;" data-votes="${escapeAttr(formattedFaVotes)}">
                    <div class="rating-bar" style="width: ${faBarWidth}%;"></div>
                  </div>
                </div>
              ` : ""}

              ${movie.imdb_rating ? `
                <div class="rating-line">
                  <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.imdb_id || "#")}" data-template="imdb-link">
                    <svg class="rating-icon" fill="#F5C618"><use href="${baseUrl}sprite.svg#icon-imdb"></use></svg>
                    <span data-template="imdb-rating">${movie.imdb_rating.toFixed(1)}</span>
                  </a>
                  <span class="rating-votes-count">${escapeHtml(formattedImdbVotes)}</span>
                  <div class="rating-bar-container" style="display:block;" data-votes="${escapeAttr(formattedImdbVotes)}">
                    <div class="rating-bar" style="width: ${imdbBarWidth}%;"></div>
                  </div>
                </div>
              ` : ""}
            </div>

            <!-- T\xEDtulo Original tras las Puntuaciones -->
            <div class="back-original-title-wrapper">
              <span data-template="original-title" class="${origTitleLengthClass}">${escapeHtml(displayOriginalTitle)}</span>
            </div>

            <!-- Director tras el T\xEDtulo Original -->
            ${directors.length > 0 ? `
              <div class="front-director-info" data-template="director">
                ${directors.map((name, i) => `
                  <a href="${baseUrl}director/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < directors.length - 1 ? ", " : ""}
                `).join("")}
              </div>
            ` : ""}

            <!-- G\xE9neros y Reparto Principal -->
            <div class="details-list">
              ${rawGenres.length > 0 ? `
                <div class="detail-item" data-template="genre-container">
                  <span class="detail-label">
                    <svg class="detail-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-clapperboard"></use></svg>
                  </span>
                  <strong class="detail-label-title">G\xE9nero.</strong>
                  <span class="detail-data" data-template="genre">
                    ${rawGenres.map((name, i) => {
    const slug = genreToSlug(name);
    return slug ? `<a href="${baseUrl}${slug}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < rawGenres.length - 1 ? ", " : ""}` : `<span>${escapeHtml(preserveHyphenatedWords(name))}</span>${i < rawGenres.length - 1 ? ", " : ""}`;
  }).join("")}
                  </span>
                </div>
              ` : ""}

              ${actors.length > 0 ? `
                <div class="detail-item" data-template="actors-container">
                  <span class="detail-label">
                    <svg class="detail-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-cast"></use></svg>
                  </span>
                  <strong class="detail-label-title">Reparto.</strong>
                  <span class="detail-data" data-template="actors">
                    ${actors.map((name, i) => `
                      <a href="${baseUrl}actor/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < actors.length - 1 ? ", " : ""}
                    `).join("")}
                  </span>
                </div>
              ` : ""}
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
            ` : ""}

          </div>

        </div>
      </article>

    </div>
  </div>
</body>
</html>
`;
}

// cloudflare/worker.js
var DEFAULT_SUPABASE_STORAGE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";
var DEFAULT_SUPABASE_URL = "https://wibygecgfczcvaqewleq.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get("Accept") || "";
    const supabaseUrl = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseAnonKey = env?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    const storageUrl = env?.SUPABASE_STORAGE_URL || DEFAULT_SUPABASE_STORAGE_URL;
    if (url.pathname === "/internal/purge" && request.method === "POST") {
      const purgeSecret = env?.PURGE_SECRET || "videoclub-purge-secret";
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${purgeSecret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const body = await request.json().catch(() => ({}));
      const slugs = Array.isArray(body.slugs) ? body.slugs : [];
      const cache = caches.default;
      let purgedCount = 0;
      for (const slug of slugs) {
        const canonicalTarget = new URL(`/titulo/${slug}/`, url.origin).toString();
        const nonSlashTarget = new URL(`/titulo/${slug}`, url.origin).toString();
        const p1 = await cache.delete(canonicalTarget);
        const p2 = await cache.delete(nonSlashTarget);
        if (p1 || p2) purgedCount++;
      }
      return new Response(JSON.stringify({ success: true, purged: purgedCount, totalRequested: slugs.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname.startsWith("/titulo/") && !url.pathname.endsWith("/")) {
      const canonicalRedirectUrl = new URL(`${url.pathname}/${url.search}`, url.origin);
      return Response.redirect(canonicalRedirectUrl.toString(), 301);
    }
    if (url.pathname.startsWith("/titulo/")) {
      const slug = url.pathname.replace(/^\/titulo\//, "").replace(/\/$/, "").trim();
      if (slug) {
        const cache = caches.default;
        const canonicalKey = new Request(new URL(`/titulo/${slug}/`, url.origin).toString(), request);
        const cached = await cache.match(canonicalKey);
        if (cached) {
          return cached;
        }
        const queryUrl = `${supabaseUrl}/rest/v1/movies?slug=eq.${encodeURIComponent(slug)}&select=${MOVIE_PROJECTION}&limit=1`;
        try {
          const apiResponse = await fetch(queryUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: "application/json"
            }
          });
          if (apiResponse.ok) {
            const rows = await apiResponse.json();
            if (Array.isArray(rows) && rows.length > 0) {
              const movie = rows[0];
              const html = renderMovieHtml(movie, { siteOrigin: url.origin, baseUrl: "/" });
              const responseHeaders = new Headers({
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
                "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
              });
              const response2 = new Response(html, {
                status: 200,
                headers: responseHeaders
              });
              ctx?.waitUntil?.(cache.put(canonicalKey, response2.clone()));
              return response2;
            }
          }
        } catch (err) {
        }
      }
    }
    const isRootPath = url.pathname === "/" || url.pathname === "";
    if (acceptHeader.includes("text/markdown") && isRootPath) {
      const llmsUrl = new URL("/llms.txt", url.origin);
      const llmsResponse = await fetch(llmsUrl.toString(), request);
      const headers2 = new Headers(llmsResponse.headers);
      headers2.set("Content-Type", "text/markdown; charset=utf-8");
      headers2.set("Cache-Control", "public, max-age=3600");
      return new Response(llmsResponse.body, {
        status: llmsResponse.status,
        headers: headers2
      });
    }
    if (url.pathname.startsWith("/posters/")) {
      const imagePath = url.pathname.replace(/^\/posters\//, "");
      const originImageUrl = `${storageUrl}/posters/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }
    if (url.pathname.startsWith("/vips/")) {
      const imagePath = url.pathname.replace(/^\/vips\//, "");
      const originImageUrl = `${storageUrl}/vips/${imagePath}`;
      return fetchAndCacheImage(originImageUrl, request, ctx);
    }
    const response = await fetch(request);
    const headers = new Headers(response.headers);
    if (url.pathname.startsWith("/assets/") || url.pathname === "/seo-card.css") {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (headers.get("Content-Type")?.includes("text/html") || !url.pathname.includes(".")) {
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      headers.set("Link", '</llms.txt>; rel="alternate"; type="text/markdown"');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
async function fetchAndCacheImage(originUrl, request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }
  const originResponse = await fetch(originUrl, {
    cf: {
      cacheTtl: 31536e3,
      cacheEverything: true
    }
  });
  if (!originResponse.ok) {
    return originResponse;
  }
  const headers = new Headers(originResponse.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  response = new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers
  });
  ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
  return response;
}
export {
  worker_default as default
};
