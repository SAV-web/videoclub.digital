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
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
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

  <!-- Hoja de Estilos Externa Cacheable (SSOT con versionado perimetral) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v6.css" />

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
  <header class="main-header">
    <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto; padding: 0 var(--space-lg);">
      <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
        <span class="logo-line-1">VIDEOCLUB</span>
        <span class="logo-line-2">.DIGITAL</span>
      </a>
      <div class="header-controls" style="display:flex; align-items:center;">
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

// cloudflare/seo/seo-card-css.js
var SEO_CARD_CSS = '@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2) format("woff2")}@font-face{font-family:Inter Fallback;src:local("Arial");ascent-override:92.77%;descent-override:24.41%;line-gap-override:0%;size-adjust:107.8%}:root{--font-body: "Inter", "Inter Fallback", system-ui, -apple-system, sans-serif;--font-title: var(--font-body);--font-size-xs: .9rem;--font-size-sm: 1.05rem;--font-size-base: 1.2rem;--font-size-md: 1.35rem;--font-size-lg: 1.5rem;--font-size-xl: 1.8rem;--line-height-tight: 1.1;--line-height-normal: 1.5;--font-weight-normal: 400;--font-weight-medium: 500;--font-weight-semibold: 600;--font-weight-bold: 700;--font-weight-extrabold: 800;--color-bg: #eceff2;--color-surface: #ffffff;--color-surface-rgb: 255, 255, 255;--color-surface-1: #ffffff;--color-surface-2: #ffffff;--color-text-primary: #1a1a1a;--color-text-secondary: #4a4a4a;--color-text-tertiary: #666666;--color-border: #e0e0e0;--color-border-soft: rgba(0, 0, 0, .07);--color-accent: #37474f;--color-accent-darker: #263238;--color-accent-exclude: #90a4ae;--color-accent-exclude-darker: #78909c;--color-focus: rgba(55, 71, 79, .4);--color-error: #dc3545;--color-error-rgb: 220, 53, 69;--color-error-bg: #dc354520;--color-success: #28a745;--color-success-rgb: 40, 167, 69;--color-success-bg: #28a74520;--color-info-rgb: 23, 162, 184;--color-star-gold: #ffbd07;--color-star-gold-rgb: 255, 189, 7;--sidebar-width-mobile: 300px;--tap-target-size: 48px;--space-xxs: .25rem;--space-xs: .5rem;--space-sm: .75rem;--space-md: 1rem;--space-lg: 1.5rem;--space-xl: 2rem;--space-xxl: 3rem;--radius-sm: 4px;--radius-md: 6px;--radius-lg: 8px;--radius-xl: 12px;--radius-xxl: 16px;--radius-round: 50%;--radius-pill: 9999px;--shadow: 0 5px 15px rgba(0, 0, 0, .08);--shadow-sm: 0 1px 2px rgba(0,0,0,.05);--ease-smooth: cubic-bezier(.4, 0, .2, 1);--ease-snap: var(--ease-smooth);--ease-bounce-in: cubic-bezier(.68, -.55, .265, 1.55);--ease-bounce-sharp: cubic-bezier(.34, 1.56, .64, 1);--ease-smooth-out: cubic-bezier(.22, .61, .36, 1);--ease-spring: cubic-bezier(.175, .885, .32, 1.275);--ease-panel: cubic-bezier(.2, .8, .2, 1);--ease-luxury: cubic-bezier(.16, 1, .3, 1);--duration-quick: .2s;--duration-fast: .3s;--duration-normal: .4s;--duration-leisurely: .6s;--transition-duration-fast: var(--duration-fast);--transition-duration-normal: var(--duration-normal);--transition-timing-function: var(--ease-smooth);--z-index-card-content: 20;--z-index-autocomplete: 850;--z-index-header: 900;--z-index-sidebar: 1000;--z-index-overlay: 1999;--z-index-toast: 2100;--bp-mobile-max: 768px;--bp-desktop-min: 769px}@media(min-width:769px)and (min-height:501px){:root{--font-size-xs: .75rem;--font-size-sm: .875rem;--font-size-base: 1rem;--font-size-md: 1.125rem;--font-size-lg: 1.25rem;--font-size-xl: 1.5rem}}html.dark-mode{--color-bg: #0d0d0d;--color-surface: #1a1a1a;--color-surface-rgb: 26, 26, 26;--color-surface-1: #242424;--color-surface-2: #2e2e2e;--color-text-primary: #e0e0e0;--color-text-secondary: #b8b8b8;--color-text-tertiary: #a0a0a0;--color-border: #3a3a3a;--color-border-soft: rgba(255, 255, 255, .12);--color-accent: #b0bec5;--color-accent-darker: #90a4ae;--color-accent-exclude: #546e7a;--color-accent-exclude-darker: #607d8b;--color-focus: rgba(176, 190, 197, .4);--shadow: 0 8px 24px rgba(0, 0, 0, .35);--color-error: #cf6679;--color-error-rgb: 207, 102, 121;--color-error-bg: rgba(207, 102, 121, .15);--color-success: #66bb6a;--color-success-rgb: 102, 187, 106;--color-success-bg: rgba(102, 187, 106, .15)}*,*:before,*:after{box-sizing:border-box;margin:0;padding:0}html{font-size:100%;scrollbar-width:thin;scrollbar-color:var(--color-border) var(--color-bg);scrollbar-gutter:stable;-webkit-tap-highlight-color:transparent}body{font-family:var(--font-body);background-color:var(--color-bg);color:var(--color-text-primary);line-height:var(--line-height-normal);overflow-x:hidden;overscroll-behavior-y:contain;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"cv05","calt","case","liga","kern";transition:background-color var(--transition-duration-normal) var(--transition-timing-function),color var(--transition-duration-normal) var(--transition-timing-function)}h1,h2,h3,h4,h5,h6{text-wrap:balance}p,blockquote{text-wrap:pretty}img,picture,video,canvas{display:block;max-width:100%}svg{display:inline-block;vertical-align:middle;flex-shrink:0}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:var(--color-bg)}::-webkit-scrollbar-thumb{background-color:var(--color-border);border-radius:var(--radius-pill);border:2px solid var(--color-bg)}::-webkit-scrollbar-thumb:hover{background-color:var(--color-text-secondary)}body.modal-open,body.sidebar-is-open{overflow:hidden;overscroll-behavior:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}@keyframes pop-effect{50%{transform:scale(1.1)}}.pop-animation{animation:pop-effect .3s var(--transition-timing-function);will-change:transform}button,input,select,textarea,a{touch-action:manipulation}.smooth-scroll{scroll-behavior:smooth}img,picture,.poster-container,.poster-overlay-guard{user-select:none!important;-webkit-user-select:none!important;-webkit-user-drag:none!important;-webkit-touch-callout:none!important}img{pointer-events:none!important}.skip-link{position:absolute;top:-9999px;left:50%;transform:translate(-50%);background-color:var(--color-surface);color:var(--color-text-primary);padding:var(--space-xs) var(--space-md);border:2px solid var(--color-accent);border-radius:var(--radius-md);box-shadow:var(--shadow);font-weight:var(--font-weight-bold);font-size:var(--font-size-sm);text-decoration:none;z-index:10000;transition:top .2s ease,opacity .2s ease;opacity:0;pointer-events:none}.skip-link:focus,.skip-link:focus-visible{top:var(--space-sm);opacity:1;pointer-events:auto;outline:2px solid var(--color-accent);outline-offset:2px}:root{--mobile-header-height: 88px}.main-layout{display:flex;width:100%;min-height:100dvh}.main-content-wrapper{flex-grow:1;display:flex;flex-direction:column;min-width:0;min-height:100dvh}.content{flex-grow:1;width:100%;max-width:1440px;margin-inline:auto;display:flex;flex-direction:column;container-type:inline-size;transition:padding .3s ease;padding:var(--space-xs) var(--space-xs) calc(var(--space-md) + env(safe-area-inset-bottom));@media(min-width:769px)and (min-height:501px){padding:var(--space-md) var(--space-lg) var(--space-xs)}@media(min-width:1200px){padding:var(--space-md) var(--space-xxl) var(--space-xs)}@media(min-width:1600px){max-width:1800px}}.sidebar{position:fixed;inset:0 auto 0 0;width:var(--sidebar-width-mobile);height:100dvh;z-index:var(--z-index-sidebar);background-color:var(--color-surface);border-inline-end:2px solid var(--color-border);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:auto;transform:translate(-100%);touch-action:pan-y;contain:layout style;will-change:transform;transition:transform .5s var(--ease-smooth-out),background-color var(--duration-normal),border-color var(--duration-normal);&::-webkit-scrollbar{width:14px}&::-webkit-scrollbar-track{background:transparent}&::-webkit-scrollbar-thumb{background-color:var(--color-text-tertiary);border-radius:20px;border:3px solid transparent;background-clip:content-box}.logo-area,.sidebar-static-filters,.sidebar-scrollable-filters,.profile-container{opacity:0;visibility:hidden;transition:opacity .2s ease-out,visibility 0s linear .2s}.play-button-container{display:none;flex-direction:column;gap:var(--space-md);margin-top:var(--space-xs)}}body.sidebar-is-open .sidebar{transform:translate(0);.logo-area,.sidebar-static-filters,.sidebar-scrollable-filters,.profile-container{opacity:1;visibility:visible;transition:opacity .3s ease-in-out .15s,visibility 0s linear 0s}.play-button-container{display:flex;flex-direction:row;margin-top:0}}@media(min-width:769px)and (min-height:501px){.sidebar{position:sticky;transform:none;width:200px;flex-basis:200px;overflow:hidden;will-change:width,flex-basis;transition:width .5s var(--ease-smooth-out),flex-basis .5s var(--ease-smooth-out),background-color var(--duration-normal),border-color var(--duration-normal);.logo-area,.sidebar-static-filters,.sidebar-scrollable-filters,.profile-container{opacity:1;visibility:visible;transition:none}.play-button-container{display:flex;flex-direction:row;gap:var(--space-xxs);margin-top:0;margin-bottom:var(--space-lg)}}body.sidebar-collapsed .sidebar{flex-basis:65px;width:65px;.logo-area,.sidebar-static-filters,.sidebar-scrollable-filters{display:none}.play-button-container{flex-direction:column;gap:var(--space-lg);margin-top:var(--space-md)}}}@media(min-width:769px)and (max-height:600px){.sidebar{overflow-y:auto}}.main-header{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:var(--space-xs);position:sticky;top:0;inset-inline:0;z-index:var(--z-index-header);padding:calc(var(--space-xs) + env(safe-area-inset-top)) var(--space-xs) var(--space-xs);@media(min-width:769px)and (min-height:501px){padding:var(--space-lg);gap:var(--space-md) var(--space-lg)}@media(min-width:1200px){padding-inline:var(--space-xxl)}}.header-pagination-group{display:flex;gap:2px}.grid-container{display:grid;justify-content:center;gap:var(--space-sm);contain:layout;grid-template-columns:repeat(2,1fr);&.is-fetching{opacity:.6;pointer-events:none;cursor:wait;transition:opacity .2s ease-out}@media(min-width:400px){grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:var(--space-md)}}:where(body.rotation-disabled) .grid-container{grid-template-columns:repeat(3,1fr);gap:calc(var(--space-xxs) + 3px) calc(var(--space-xs) + 3px);@media(min-width:400px){grid-template-columns:repeat(auto-fill,minmax(105px,1fr))}}@media(min-width:769px)and (min-height:501px){.content{padding:var(--space-md) var(--space-lg) var(--space-xs)}.grid-container{gap:var(--space-lg) var(--space-md)}@container (min-width: 660px){:where(body.rotation-disabled) .grid-container{grid-template-columns:repeat(6,minmax(0,1fr))}}@container (min-width: 880px){:where(body.rotation-disabled) .grid-container{grid-template-columns:repeat(8,minmax(0,1fr))}}@container (min-width: 1000px){:where(body.rotation-disabled) .grid-container{grid-template-columns:repeat(9,minmax(0,1fr))}}@container (min-width: 1200px){:where(body.rotation-disabled) .grid-container{grid-template-columns:repeat(12,minmax(0,1fr))}}@container (min-width: 940px){:where(body:not(.rotation-disabled)) .grid-container{grid-template-columns:repeat(6,minmax(0,1fr))}}@container (min-width: 1080px){:where(body:not(.rotation-disabled)) .grid-container{grid-template-columns:repeat(7,minmax(0,1fr))}}}@media(hover:none)and (pointer:coarse){#sort-select,.search-form input{height:44px;font-size:1rem}.pagination-container>.btn,.pagination-container>.pagination-current{--btn-height: 36px}}@keyframes card-enter-animation{0%{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes fade-in{0%{opacity:0}to{opacity:1}}@keyframes fade-out{0%{opacity:1}to{opacity:0}}::view-transition-old(root),::view-transition-new(root){animation-duration:.25s;animation-timing-function:ease-in-out}::view-transition-old(root){animation-name:fade-out}::view-transition-new(root){animation-name:fade-in}::view-transition-group(main-header){z-index:100}::view-transition-group(movie-*){animation-duration:.5s;animation-timing-function:ease}::view-transition-new(movie-*){animation-name:card-enter-animation}::view-transition-old(movie-*){animation-name:fade-out}.site-footer{margin-top:auto;padding-top:var(--space-lg);border-top:1px solid var(--color-border);text-align:center}.footer-links{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:var(--space-sm);list-style:none;padding:0;margin:0;font-size:var(--font-size-xs);color:var(--color-text-secondary)}.footer-links li{display:flex;align-items:center;white-space:nowrap}.footer-links li:not(:last-child):after{content:"|";margin-left:var(--space-sm);color:var(--color-border)}.footer-links a,.footer-links button{color:inherit;background:none;border:none;padding:0;font:inherit;font-size:inherit;cursor:pointer;text-decoration:none;transition:color var(--duration-fast)}@media(hover:hover)and (pointer:fine){.footer-links a:hover,.footer-links button:hover{color:var(--color-text-primary);text-decoration:underline}}.footer-brand{font-family:var(--font-title);font-weight:var(--font-weight-bold);color:var(--color-text-primary)}.btn{display:inline-flex;align-items:center;justify-content:center;height:var(--btn-height, 40px);padding-inline:1.2rem;font-family:inherit;font-size:.9rem;font-weight:var(--font-weight-semibold);text-decoration:none;white-space:nowrap;border:1px solid var(--color-border);border-radius:var(--radius-md);background-color:var(--color-surface);color:var(--color-text-primary);cursor:pointer;user-select:none;transition:transform var(--duration-fast) var(--ease-smooth),box-shadow var(--duration-fast) var(--ease-smooth),background-color var(--duration-fast) var(--ease-smooth),color var(--duration-fast) var(--ease-smooth),border-color var(--duration-fast) var(--ease-smooth);transform-origin:center;position:relative;overflow:hidden;isolation:isolate;@media(hover:hover)and (pointer:fine){&:hover{border-color:var(--color-accent);color:var(--color-accent);transform:translateY(-2px) scale(1.03);box-shadow:0 4px 12px #00000014}}html.dark-mode &:hover{box-shadow:0 4px 15px #0003}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}&:active{transform:translateY(1px) scale(.98) scaleY(.99);box-shadow:0 1px 2px #0000001a,inset 0 1px 1px #0000000d;transition-duration:50ms;transition-timing-function:var(--ease-luxury)}&:after{content:"";position:absolute;top:50%;left:50%;width:100%;height:100%;border-radius:50%;background:#ffffff4d;opacity:0;transform:translate(-50%,-50%) scale(0);transition:transform .6s ease,opacity .6s ease;z-index:-1;pointer-events:none}&:active:after{opacity:1;transform:translate(-50%,-50%) scale(2);transition:0s}&:not(:active){transition-duration:.3s;transition-timing-function:var(--ease-luxury)}&:disabled,&.disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}}.btn--outline{background-color:transparent;border-color:var(--color-border);@media(hover:hover)and (pointer:fine){&:hover{background-color:var(--color-surface);border-color:var(--color-accent)}}}.btn--icon{width:var(--btn-height, 40px);padding:0}.btn--active{background-color:var(--color-accent);color:var(--color-bg);border-color:var(--color-accent);cursor:default;transform:none;box-shadow:none;@media(hover:hover)and (pointer:fine){&:hover{background-color:var(--color-accent);color:var(--color-bg);border-color:var(--color-accent)}}}@media(hover:none)and (pointer:coarse){.btn{--btn-height: var(--tap-target-size);padding-inline:1.5rem;font-size:1rem}.btn--icon{width:var(--tap-target-size);height:var(--tap-target-size)}.type-filter-toggle,.sidebar .sidebar-control-button{height:var(--tap-target-size);width:var(--tap-target-size);padding:0}}@keyframes card-cascade-appear{0%{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes watchlist-pop{0%{transform:scale(1)}50%{transform:scale(1.3) rotate(-5deg)}to{transform:scale(1)}}@keyframes watchlist-glow{0%,to{filter:drop-shadow(0 0 0 rgba(var(--color-star-gold-rgb),0))}50%{filter:drop-shadow(0 0 10px rgba(var(--color-star-gold-rgb),.8))}}@keyframes bookmark-settle{0%{transform:translateY(0)}to{transform:translateY(-2px)}}@keyframes fade-in-subtle{0%{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}.movie-card{position:relative;perspective:1000px;z-index:1;aspect-ratio:500 / 950;border-radius:var(--radius-xl);contain:layout paint style;content-visibility:auto;animation:card-cascade-appear .42s cubic-bezier(.16,1,.3,1) backwards;animation-delay:calc(var(--card-index, 0) * 45ms);@media(prefers-reduced-motion:reduce){animation:none;opacity:1;transform:none}transition:transform var(--duration-quick) var(--ease-spring);touch-action:manipulation;@media(hover:hover)and (pointer:fine){&:hover{z-index:10;transform:translateY(-4px) scale(1.01);will-change:transform}&:not(.person-card):not(.collection-card):not(.studio-card):hover{outline:2px solid var(--color-accent);outline-offset:4px;border-radius:var(--radius-xl)}:where(html.dark-mode) &:not(.person-card):not(.collection-card):not(.studio-card):hover{outline:2px solid rgba(255,255,255,.7);outline-offset:4px}&:is(.person-card,.collection-card,.studio-card):hover{outline:none}&:not(.is-flipped):hover{.flip-card-inner{box-shadow:0 15px 30px #00000026}:where(html.dark-mode) & .flip-card-inner{box-shadow:0 15px 30px #0006}}}}.flip-card-inner{position:relative;width:100%;height:100%;border-radius:var(--radius-xl);box-shadow:0 4px 14px -2px #00000014,0 0 0 1px #0000000f;background-color:var(--color-surface-1);border:none;transform-style:preserve-3d;transition:transform var(--duration-leisurely) var(--ease-smooth-out),box-shadow var(--duration-quick) var(--ease-smooth-out);&.is-flipped{transform:rotateY(180deg)}html.dark-mode &{box-shadow:0 6px 20px -2px #0009,0 0 0 1px #ffffff1a;border:none}}.flip-card-front,.flip-card-back{position:absolute;inset:0;border-radius:var(--radius-xl);overflow:hidden;backface-visibility:hidden;background-color:var(--color-surface-1);color:var(--color-text-primary);display:flex;flex-direction:column}.flip-card-front{z-index:2;pointer-events:auto}.flip-card-back{transform:rotateY(180deg);padding:var(--space-xs);line-height:var(--line-height-normal);z-index:1;pointer-events:none;:is(.flip-card-inner.is-flipped,.movie-card.is-hovered .flip-card-inner) &{pointer-events:auto;z-index:2}}:is(.flip-card-inner.is-flipped,.movie-card.is-hovered .flip-card-inner) .flip-card-front{pointer-events:none;z-index:1}.poster-container{position:relative;width:100%;height:66%;flex-shrink:0;& img{width:100%;height:100%;border:var(--space-xxs) solid var(--color-surface);border-radius:var(--radius-xxl);object-fit:cover;pointer-events:none;user-select:none;-webkit-user-drag:none}.poster-overlay-guard{position:absolute;inset:0;z-index:2;background:transparent;pointer-events:auto;user-select:none;-webkit-user-drag:none;border-radius:var(--radius-xxl)}}:is(.flip-card-front,.person-card,.collection-card) img.lazy-lqip{filter:blur(10px);transform:scale(1.05);transition:filter var(--duration-normal) ease-in-out,transform var(--duration-normal) ease-in-out;&.loaded{filter:blur(0);transform:scale(1)}}.movie-summary{flex-grow:1;display:flex;flex-direction:column;padding:calc(var(--space-sm) + 3px) var(--space-xxs) var(--space-xs);overflow:hidden}.title-director-block{flex-grow:1;display:flex;flex-direction:column;justify-content:center}.movie-summary h3{margin-bottom:0;line-height:1.1;font-family:var(--font-title);font-size:var(--font-size-base);font-weight:var(--font-weight-bold);letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;text-wrap:balance;overflow:hidden;text-overflow:ellipsis;&.title-medium{font-size:.95rem}&.title-long{font-size:.9rem}&.title-xl-long{font-size:.75rem}}.front-director-info{font-size:var(--font-size-xs);font-weight:var(--font-weight-normal);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;& a{color:inherit;text-decoration:none;transition:color var(--duration-fast);@media(hover:hover)and (pointer:fine){&:hover{text-decoration:underline;color:var(--color-text-primary)}}}}.movie-meta{padding-top:1px;display:flex;justify-content:space-between;align-items:center;min-height:24px;font-size:var(--font-size-sm)}.card-icons-line{display:flex;align-items:center;gap:var(--space-xxs)}.card-icons-line.compact .platform-icon svg{width:16px;height:16px}.platform-icon svg{vertical-align:middle}.year-country-line{margin-left:auto}.year-flag-group{display:flex;align-items:center;justify-content:flex-end;gap:var(--space-xxs);font-weight:var(--font-weight-semibold);color:var(--color-text-secondary);white-space:nowrap;letter-spacing:-.03em;& a{color:inherit;text-decoration:none;transition:color var(--duration-fast);@media(hover:hover)and (pointer:fine){&:hover{text-decoration:underline;color:var(--color-text-primary)}}}}.country-info{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-xxs);text-decoration:none;color:inherit;cursor:pointer;border-radius:var(--radius-sm, 3px);padding:2px;margin:-2px;transition:transform var(--duration-fast) ease,opacity var(--duration-fast) ease;@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.18);opacity:.85}}&:active{transform:scale(.92)}&:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px;border-radius:var(--radius-sm, 3px);transform:scale(1.15);z-index:10}}.country-flag-icon svg{width:14px;height:14px}.netflix-icon{color:#e50914}.disney-icon{color:#900}.wb-icon{color:#000b6c}.universal-icon{color:#444}.sony-icon{color:#004098}.paramount-icon{color:#0063ff}.lionsgate-icon{color:#c72}.amazon-icon{color:#f6a61f}.twenty-icon{color:#000b6c}.a24-icon{color:#000}.movistar-icon{color:#00a9e0}.miramax-icon{color:#005596}.apple-icon,.canalplus-icon,.bbc-icon{color:#000}html.dark-mode .disney-icon{color:#d9534f}html.dark-mode .wb-icon{color:#4da4f2}html.dark-mode .universal-icon{color:#bbb}html.dark-mode .sony-icon{color:#3182ce}html.dark-mode .paramount-icon{color:#e0e0e0}html.dark-mode .lionsgate-icon{color:#f9d7b5}html.dark-mode .twenty-icon{color:#e0e0e0}html.dark-mode .a24-icon{color:#fff}html.dark-mode .miramax-icon{color:#4da4f2}html.dark-mode .apple-icon,html.dark-mode .canalplus-icon,html.dark-mode .bbc-icon{color:#fff}.back-original-title-wrapper{display:flex;justify-content:flex-start;align-items:center;margin-top:var(--space-xs);margin-bottom:var(--space-md);padding-inline:0;width:100%;min-height:0;animation:fade-in-subtle .5s var(--ease-smooth-out) .2s backwards;& span{font-family:var(--font-title);font-size:var(--font-size-sm);font-weight:var(--font-weight-bold);color:var(--color-text-primary);line-height:var(--line-height-tight);letter-spacing:-.01em;text-align:left;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;&.title-medium{font-size:.8rem}&.title-long{font-size:.75rem}&.title-xl-long{font-size:.7rem}}}.back-meta-header{display:flex;justify-content:flex-end;align-items:center;width:100%;margin-bottom:2px;font-size:var(--font-size-sm)}.episode-duration-group{display:flex;align-items:center;gap:4px;font-weight:var(--font-weight-bold, 700);color:var(--color-text-secondary);white-space:nowrap;letter-spacing:-.03em}[data-template=wikipedia-link],[data-template=justwatch-link]{display:flex;align-items:center;text-decoration:none;transition:transform var(--duration-fast),filter var(--duration-fast);margin-left:var(--space-xs);pointer-events:auto;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);border-radius:var(--radius-sm)}@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.15)}}&[data-template=justwatch-link]:hover svg{filter:drop-shadow(0 0 6px rgba(154,20,133,.6))}&[data-template=wikipedia-link]:hover svg{filter:drop-shadow(0 0 6px rgba(179,64,74,.6))}&.disabled{opacity:.3;pointer-events:none;filter:grayscale(100%);cursor:default;html.dark-mode &{filter:grayscale(100%) brightness(5)}}}.details-list{display:flex;flex-direction:column;gap:var(--space-xxs);margin:6px 0 4px;padding-top:4px;border-top:1px solid var(--color-border);font-size:var(--font-size-xs);line-height:1.2;color:var(--color-text-secondary)}:is(.details-list,.detail-item,.detail-data,[data-template=genre],[data-template=actors]) a{color:inherit;text-decoration:none;transition:color var(--duration-fast, .15s) ease;cursor:pointer;display:inline;&:hover{color:var(--color-text-primary);text-decoration:underline}}.detail-label{display:inline-flex;align-items:center;justify-content:center;vertical-align:-2px;margin-right:6px;color:var(--color-accent);flex-shrink:0}.detail-icon{width:14px;height:14px;max-width:14px;max-height:14px;stroke:currentColor;stroke-width:2.6;fill:none;flex-shrink:0;display:inline-block}.detail-label-title{display:inline-block;font-weight:var(--font-weight-bold, 700);color:var(--color-text-primary);margin-right:.5em}.detail-item[data-template=genre-container]{position:relative;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;padding-right:10px}.detail-item[data-template=actors-container]{position:relative;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;padding-right:10px;line-height:1.4}.scrollable-content{position:relative;overflow:hidden;transition:opacity var(--duration-normal) var(--ease-smooth-out),transform var(--duration-normal) var(--ease-smooth-out);&:after{content:"";position:absolute;bottom:0;left:0;right:0;height:40px;background:linear-gradient(to bottom,transparent,var(--color-surface));pointer-events:none}.flip-card-back.is-expanded &:after{opacity:0}}.plot-summary-final{padding-top:4px;border-top:1px solid var(--color-border);opacity:.8;font-size:var(--font-size-xs);color:var(--color-text-secondary);font-weight:var(--font-weight-normal);line-height:1.2;text-wrap:pretty}.actors-scrollable-content{position:absolute;inset:0;padding:var(--space-md);padding-top:var(--space-sm);background-color:var(--color-surface);-webkit-overflow-scrolling:touch;overflow-y:auto;scrollbar-width:none;opacity:0;visibility:hidden;transform:translateY(100%);transition:opacity var(--duration-normal) var(--ease-smooth-out),visibility var(--duration-normal) var(--ease-smooth-out),transform var(--duration-normal) var(--ease-smooth-out);z-index:5;font-size:var(--font-size-sm);line-height:1.6;color:var(--color-text-primary);pointer-events:auto;& h4{margin-top:0;margin-bottom:var(--space-xs);font-family:var(--font-title);font-size:var(--font-size-base);font-weight:var(--font-weight-bold);border-bottom:1px solid var(--color-border);padding-bottom:var(--space-xxs);color:var(--color-text-primary)}& h4:not(:first-child){margin-top:var(--space-sm)}}.actors-list-text{margin:0;text-align:left;color:var(--color-text-primary);padding-bottom:var(--space-xs)}.actor-list-item{background:none;border:none;padding:0;font-family:inherit;font-size:inherit;color:var(--color-text-primary);text-align:left;cursor:pointer;display:block;width:100%;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);border-radius:var(--radius-sm)}transition:color var(--transition-duration-fast);&:hover{color:var(--color-accent);text-decoration:underline}}.expand-content-btn,.actors-expand-btn{position:absolute;width:18px;height:18px;border-radius:50%;border:none;background-color:var(--color-accent);color:var(--color-surface);font-size:1rem;font-weight:400;line-height:1;display:flex;align-items:center;justify-content:center;padding-bottom:1px;cursor:pointer;box-shadow:0 2px 4px #00000040;transition:transform var(--duration-quick) ease-out,background-color var(--duration-quick) ease-out;z-index:var(--z-index-card-content);pointer-events:auto;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.15);background-color:var(--color-text-primary)}}&:active{transform:scale(.9)}&:after{content:"";position:absolute;inset:-12px}}.actors-expand-btn{bottom:0;right:0}.expand-content-btn{bottom:6px;right:6px}.flip-card-back.is-expanded>*:not(.scrollable-content):not(.expand-content-btn):not(.actors-scrollable-content){opacity:0;transform:translateY(-100%);transition:opacity var(--duration-quick),transform var(--duration-normal) var(--ease-smooth-out);pointer-events:none}.flip-card-back.is-expanded .scrollable-content{position:absolute;inset:0;padding:var(--space-md);background-color:var(--color-surface);overflow-y:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;pointer-events:auto;z-index:15}.flip-card-back.is-expanded .plot-summary-final{font-size:var(--font-size-sm);line-height:1.6;color:var(--color-text-primary);opacity:1;border-top:none;padding-top:0}.flip-card-back.is-expanded.show-actors .actors-scrollable-content{opacity:1;visibility:visible;transform:translateY(0)}.flip-card-back.is-expanded.show-actors .scrollable-content{opacity:0!important;visibility:hidden!important}.card-rating-block{position:absolute;bottom:1px;left:0;right:0;transform:translateY(66.66%);z-index:5;display:flex;justify-content:space-between;align-items:center;padding-inline:var(--space-md);pointer-events:none;>*{pointer-events:auto;filter:drop-shadow(0 0 5px var(--color-surface));transition:filter .3s ease,transform var(--duration-quick) var(--ease-spring);html.dark-mode &{filter:drop-shadow(0 0 3px rgba(0,0,0,.9))}}}.wall-rating-number{display:none}.card-action-btn{width:32px;height:32px;padding:0;border:none;border-radius:var(--radius-round);background-color:transparent;color:var(--color-accent);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform var(--duration-normal) var(--ease-smooth-out),background-color var(--duration-normal) var(--ease-smooth-out),color var(--duration-normal) var(--ease-smooth-out);position:relative;isolation:isolate;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.15) rotate(10deg)}}&:active{transform:scale(.96);filter:brightness(.95);transition:transform 50ms var(--ease-luxury)}& svg{width:30px;height:30px;fill:transparent;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:fill var(--duration-normal) var(--ease-smooth-out),stroke var(--duration-normal) var(--ease-smooth-out),color var(--duration-normal) var(--ease-smooth-out),transform var(--duration-normal) var(--ease-smooth-out);pointer-events:none;position:relative;z-index:0}&.is-active{animation:watchlist-pop .3s var(--ease-bounce-in);& svg{color:#e50914;fill:#e50914;stroke:#e50914;--icon-plus-color: var(--color-surface);animation:watchlist-glow .6s ease-out,bookmark-settle .2s .3s ease-out forwards}}}[data-template=wikipedia-link] .rating-icon,[data-template=justwatch-link] .rating-icon{width:1.5em;height:1.5em;transform:translateY(-1px)}@media(hover:none)and (pointer:coarse){.movie-card:active{transform:scale(.98);transition-duration:0s}.card-action-btn:after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:var(--tap-target-size);height:var(--tap-target-size);z-index:1}}@media(hover:hover)and (pointer:fine){body:not(.rotation-disabled) .movie-card.is-hovered .flip-card-inner{transform:rotateY(180deg)}}body.rotation-disabled .movie-card:not(.is-quick-view){aspect-ratio:2 / 3;transition:transform var(--duration-quick) ease;.flip-card-inner{box-shadow:var(--shadow-sm);border:none;background-color:transparent}.movie-summary{display:none}.flip-card-front{background-color:transparent}.poster-container{height:100%;display:flex;flex-direction:column;& img{height:auto;flex-grow:1;min-height:0;object-fit:cover;border-radius:var(--radius-xxl);border:none;box-shadow:none}}.card-rating-block{position:relative;transform:none;bottom:auto;left:auto;right:auto;height:auto;justify-content:center;padding:1px var(--space-xs);background:transparent;cursor:pointer;pointer-events:auto;>*:not(.card-action-btn){transform:translateY(calc(-40% + 4px))}.wall-rating-number{display:block;flex-grow:0;text-align:center;font-weight:var(--font-weight-bold);font-size:1.1rem;color:var(--color-text-primary);font-variant-numeric:tabular-nums;text-shadow:none;filter:none;cursor:pointer;transform:translateY(calc(-40% + 6px));&:hover{transform:translateY(calc(-40% + 6px)) scale(1.15) rotate(10deg)}}}.star-rating-container:not(.has-user-rating){display:none!important}.star-rating-container.has-user-rating{display:flex!important;gap:4px;flex-grow:0;justify-content:center;.star-icon{width:24px;height:24px}}.star-rating-container.has-user-rating~.wall-rating-number{display:none!important}.card-action-btn{position:absolute;right:var(--space-xxs);width:auto;height:auto;padding:0;margin-left:0;background:transparent;backdrop-filter:none;color:var(--color-text-primary);opacity:0;transform:translateY(calc(-40% + 4px));&:hover{transform:translateY(-40%) scale(1.15) rotate(10deg)}& svg{width:25px;height:25px}&.is-active,&:focus-visible{opacity:1}}.star-rating-container.has-user-rating~.card-action-btn{display:none}}@media(hover:none)and (pointer:coarse){body.rotation-disabled .movie-card:not(.is-quick-view) .card-rating-block{pointer-events:none}body.rotation-disabled .movie-card:not(.is-quick-view) .card-action-btn{pointer-events:auto}}.person-card .flip-card-inner{box-shadow:0 4px 15px #00000026}.person-card .flip-card-back{padding:var(--space-md);background-color:var(--color-surface-1)}.person-card .poster-container img{object-position:top center;border:3px solid var(--color-accent)!important}.collection-card .poster-container img{object-position:center center}.person-card .year-flag-group{width:100%;justify-content:flex-end;gap:var(--space-xs)}.person-card .card-icons-line{display:none}.person-card .year-country-line{width:100%}.person-card .poster-container:after{content:"";position:absolute;bottom:-10px;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,var(--color-text-tertiary),transparent);opacity:.4}.person-role-toggle-btn{position:absolute;bottom:8px;right:8px;z-index:10;width:26px;height:26px;border-radius:50%;background:var(--color-surface, #1e1e1e);color:var(--color-accent);border:2px solid var(--color-accent);box-shadow:0 2px 8px #0006,0 0 0 1px #0003;display:flex;align-items:center;justify-content:center;font-family:var(--font-title);font-size:.85rem;font-weight:var(--font-weight-extrabold, 800);line-height:1;cursor:pointer;pointer-events:auto;user-select:none;transition:transform var(--duration-quick) var(--ease-spring),background var(--duration-fast) ease,color var(--duration-fast) ease,box-shadow var(--duration-fast) ease;&:hover{transform:scale(1.18);background:var(--color-accent);color:#fff;box-shadow:0 4px 14px #00000080,0 0 12px var(--color-accent)}&:active{transform:scale(.92)}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus),0 4px 12px #00000080}}:where(html.dark-mode) .person-role-toggle-btn{background:#141414;color:var(--color-accent);border-color:var(--color-accent);&:hover{background:var(--color-accent);color:#141414}}.collection-card .movie-summary{position:relative;flex-grow:1;display:flex;flex-direction:column;justify-content:center;padding:calc(var(--space-sm) + 2px) var(--space-xxs) calc(var(--space-sm) + 2px)}.collection-card .title-director-block{flex-grow:1;display:flex;flex-direction:column;justify-content:center}.collection-card .movie-meta{position:absolute;bottom:6px;left:0;right:0;min-height:1px;height:1px;margin:0;padding:0}.collection-card .movie-meta:after{content:"";position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,var(--color-text-tertiary),transparent);opacity:.4}.movie-card.person-card .card-rating-block{display:none}body.rotation-disabled .movie-card.person-card .card-rating-block{display:flex;justify-content:center;align-items:center;height:26px;width:100%;pointer-events:none!important}body.rotation-disabled .movie-card.person-card .wall-person-name{display:block;font-size:.95rem;font-weight:var(--font-weight-bold);color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;padding-bottom:2px;transform:translateY(-4px)!important}body.rotation-disabled .movie-card.person-card.no-bio{cursor:default}body.rotation-disabled .movie-card.person-card:not(.is-quick-view) .person-role-toggle-btn{bottom:34px;right:8px}.bio-headline{font-size:calc(var(--font-size-base) * 1.25);font-weight:var(--font-weight-extrabold);color:var(--color-text-primary);margin-bottom:var(--space-sm);padding-bottom:var(--space-xs);border-bottom:1px solid var(--color-border);line-height:1.3;letter-spacing:-.02em}.bio-headline:empty{display:none!important}.main-header{background-color:var(--color-bg);border-block-end:1px solid var(--color-border);view-transition-name:main-header;will-change:transform;transition:background-color var(--transition-duration-normal),box-shadow .3s ease,border-color var(--transition-duration-normal),transform .3s ease;@media(min-width:769px)and (min-height:501px){border:none;border-bottom:1px solid transparent;&.is-scrolled{border-bottom-color:var(--color-border);background-color:var(--color-surface);box-shadow:var(--shadow)}}&.is-hidden-mobile{transform:translateY(-100%)}}.main-header-primary-controls,.search-and-theme-group{flex-wrap:nowrap}.search-form{& input{height:40px;padding:0 var(--space-xl) 0 var(--space-md);border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text-primary);min-width:130px;transition:min-width var(--transition-duration-normal) ease-in-out;&::placeholder{color:var(--color-text-secondary)}&:focus{min-width:160px;outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}&::-webkit-search-decoration,&::-webkit-search-cancel-button,&::-webkit-search-results-button,&::-webkit-search-results-decoration{display:none;-webkit-appearance:none}}}.sort-control{position:relative;&:after{content:"";position:absolute;right:12px;top:50%;transform:translateY(-50%);width:.6em;height:.4em;background-color:var(--color-text-primary);clip-path:polygon(100% 0%,0 0%,50% 100%);pointer-events:none}}#sort-select{height:40px;width:130px;padding:0 1.8em 0 var(--space-sm);color:var(--color-text-primary);background-color:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);appearance:none;cursor:pointer;font-family:inherit;font-size:.9rem;font-weight:var(--font-weight-normal);line-height:1;&:focus-visible{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}}.sort-icon{display:none;pointer-events:none}.mobile-sidebar-toggle{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:none;background:none;color:var(--color-text-secondary);cursor:pointer;transition:transform .2s ease,color .2s ease;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);border-radius:var(--radius-md)}@media(hover:hover)and (pointer:fine){&:hover{color:var(--color-text-primary)}}&:active{transform:scale(.9)}@media(min-width:769px)and (min-height:501px){display:none}}.type-filter-toggle{height:40px;padding-inline:var(--space-md);border:1px solid var(--color-border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;cursor:pointer;background-color:var(--color-surface);color:var(--color-text-primary);font-family:inherit;font-size:.9rem;font-weight:var(--font-weight-normal);line-height:1;box-shadow:none;transition:border-color var(--transition-duration-normal) ease,background-color var(--transition-duration-normal) ease,color var(--transition-duration-normal) ease;&:focus-visible{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}.desktop-text{display:none;font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit}.mobile-icon{display:flex;align-items:center}@media(min-width:769px)and (min-height:501px){.desktop-text{display:block}.mobile-icon{display:none}}@media(hover:hover)and (pointer:fine){&:hover{border-color:var(--color-accent)}}&.type-filter--movies{background-color:var(--color-accent);border-color:var(--color-accent);color:#fff}&.type-filter--series{background-color:var(--color-accent-exclude);border-color:var(--color-accent-exclude);color:#fff}}.theme-toggle{position:relative;width:24px;height:24px;background:none;border:none;padding:0;cursor:pointer;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);border-radius:var(--radius-round)}@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.1)}}&:active{transform:scale(.9)}}.sidebar-control-button.theme-toggle{font-size:initial}.theme-icon{position:absolute;top:50%;left:50%;transition:opacity .4s ease-in-out,transform .4s var(--ease-smooth)}.moon-icon{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}.sun-icon{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(-90deg)}:where(html.dark-mode) .moon-icon{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(90deg)}:where(html.dark-mode) .sun-icon{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}.search-icon{transition:opacity .2s ease,transform .2s ease,right .2s ease;background:none;border:none;padding:0}.search-icon--clear{opacity:0;pointer-events:none}.main-header.is-search-focused{.search-icon--idle{opacity:0;pointer-events:none}.search-icon--clear{opacity:1;pointer-events:auto;cursor:pointer;color:var(--color-text-primary)}}@media(hover:none)and (pointer:coarse){:is(.search-form input,#sort-select,.type-filter-toggle){height:var(--tap-target-size);font-size:1rem}}@media(max-width:768px),(max-height:500px){.main-header-primary-controls,.search-and-theme-group,.header-pagination-group{gap:6px}:is(.mobile-sidebar-toggle,.sort-control,.type-filter-toggle,.header-pagination-group .btn,.search-form){width:var(--tap-target-size);height:var(--tap-target-size);padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;border:1px solid var(--color-border);background-color:var(--color-surface);border-radius:var(--radius-md);box-shadow:var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, .05));transition:background-color .2s,border-color .2s,transform .1s}:where(html.dark-mode) :is(.mobile-sidebar-toggle,.sort-control,.type-filter-toggle,.header-pagination-group .btn,.search-form){border-color:#fff3;background-color:#ffffff14}.mobile-sidebar-toggle{color:var(--color-text-primary)}.type-filter-toggle{font-size:.8rem}.type-filter-toggle.type-filter--movies{background-color:var(--color-accent)!important;color:#fff!important;border-color:transparent!important}.type-filter-toggle.type-filter--series{background-color:var(--color-accent-exclude)!important;color:#fff!important;border-color:transparent!important}.type-filter-toggle .mobile-icon svg{width:20px;height:20px}.sort-control:after{display:none}.sort-icon{display:block;color:var(--color-text-primary)}#sort-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;z-index:2}.search-form input{min-width:100%;height:100%;border:none;background:transparent;color:transparent;padding:0;&::placeholder{color:transparent}}.search-form .search-icon{right:50%;transform:translate(50%,-50%)}.main-header.is-search-focused{.main-header-primary-controls,.mobile-status-bar{display:none}.search-and-theme-group{flex-grow:1;justify-content:center}.search-form{width:70%;max-width:400px}.search-form input{color:var(--color-text-primary);padding:0 var(--space-xxl) 0 var(--space-md);width:100%;&::placeholder{color:var(--color-text-secondary)}}.search-icon{right:var(--space-sm);transform:translateY(-50%)}.search-icon--clear{width:48px;height:48px;padding:12px;right:0}}}@media(max-width:400px){.header-pagination-group .btn{width:calc(var(--tap-target-size) / 1.5)}}.mobile-status-bar{display:none;width:100%;text-align:center;font-size:var(--font-size-xs);color:var(--color-text-secondary);padding-top:4px;order:10;font-weight:var(--font-weight-medium);padding-bottom:2px}@media(max-width:768px),(max-height:500px){.mobile-status-bar{display:block}}#total-results-header{display:none;font-size:var(--font-size-sm);font-weight:var(--font-weight-bold);color:var(--color-text-secondary);white-space:nowrap;align-items:center;gap:4px}@media(min-width:769px)and (min-height:501px){#total-results-header:not([hidden]){display:flex}}.total-results-count{color:var(--color-text-primary);font-family:var(--font-title)}.star-rating-container{display:flex;align-items:center;gap:2px;&.is-interactive{cursor:pointer}&.has-user-rating{.star-icon-path{stroke:var(--color-star-gold)}.star-icon-path--filled{fill:var(--color-star-gold)}}}.star-icon{position:relative;width:25px;height:25px;cursor:pointer;transform-origin:center center;outline:none!important;-webkit-tap-highlight-color:transparent}.star-icon:focus,.star-icon:focus-visible,.star-icon:focus:not(:focus-visible){outline:none!important}.star-icon-path{stroke:var(--color-accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.star-icon-path--empty{fill:transparent}.star-icon-path--filled{fill:var(--color-accent);clip-path:inset(0 100% 0 0);transition:clip-path .4s var(--ease-smooth-out)}@media(hover:hover)and (pointer:fine){:is(.star-rating-container.is-interactive,.card-rating-block) .star-icon:hover{transform:scale(1.35);z-index:20;filter:drop-shadow(0 0 4px rgba(var(--color-star-gold-rgb),.6));transition:transform .15s var(--ease-bounce-sharp)}}:is(.star-rating-container.is-interactive,.card-rating-block) .star-icon:active{transform:scale(.92);filter:brightness(.95);transition:transform 50ms var(--ease-bounce-sharp)}.star-icon:focus-visible{outline:none!important;transform:scale(1.3);z-index:25;filter:drop-shadow(0 0 6px var(--color-star-gold)) brightness(1.2)}.star-icon.just-rated{animation:star-vote-success .6s var(--ease-bounce-in)!important;z-index:20}@keyframes star-vote-success{0%{transform:scale(1);filter:drop-shadow(0 0 0 rgba(var(--color-star-gold-rgb),0))}20%{transform:scale(1.4) rotate(-8deg);filter:drop-shadow(0 0 10px rgba(var(--color-star-gold-rgb),.6))}40%{transform:scale(1.2) rotate(8deg)}60%{transform:scale(1.35) rotate(-4deg);filter:drop-shadow(0 0 15px rgba(var(--color-star-gold-rgb),.8))}80%{transform:scale(1.15) rotate(4deg)}to{transform:scale(1.25);filter:drop-shadow(0 0 4px rgba(var(--color-star-gold-rgb),.6))}}@media(hover:none)and (pointer:coarse){.star-icon:after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;width:30px;height:var(--tap-target-size)}}.ratings-container{display:flex;flex-direction:column;gap:4px}.rating-line{display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}.rating-left{display:flex;align-items:center;gap:6px;flex-shrink:0;color:var(--color-text-primary);font-size:var(--font-size-base);font-weight:var(--font-weight-bold);text-decoration:none;cursor:pointer;transition:opacity .2s ease,transform .2s ease;pointer-events:auto;@media(hover:hover)and (pointer:fine){&:hover{opacity:.8;transform:scale(1.05)}}&.disabled{pointer-events:none;opacity:.7;cursor:default}}.rating-icon{width:1.6em;height:1.6em;border-radius:var(--radius-sm);object-fit:contain}.rating-bar-container{flex-grow:1;width:100%;height:var(--space-xs);border-radius:var(--space-xxs);background-color:var(--color-bg);overflow:visible;position:relative;pointer-events:auto;cursor:default;@media(hover:hover)and (pointer:fine){&[data-votes]:hover:after{content:attr(data-votes) " votos";position:absolute;bottom:100%;left:50%;transform:translate(-50%) translateY(-5px);background-color:#000000d9;color:#fff;padding:4px 8px;border-radius:4px;font-size:.75rem;font-weight:700;white-space:nowrap;pointer-events:none;z-index:10;box-shadow:0 2px 4px #0003;animation:fade-in-subtle .2s ease-out}}}.rating-votes-count{display:none!important}.rating-bar{width:0;height:100%;border-radius:var(--space-xxs);background-color:var(--color-accent);transition:width .8s cubic-bezier(.25,1,.5,1)}.sidebar-inner-wrapper{display:flex;flex-direction:column;min-height:100dvh;padding:var(--space-xl) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom));padding-inline-end:calc(var(--space-lg) + 8px);transition:padding .5s var(--ease-panel);@media(min-width:769px)and (min-height:501px){height:100%;padding-inline:var(--space-md)}&.is-compact{padding-top:var(--space-md);.logo-area{margin-bottom:var(--space-xs)}.play-button-container{margin-bottom:var(--space-xxs)}#year-slider-container{padding-top:0}.sidebar-static-filters{padding-bottom:var(--space-xs)}}}.logo-area{margin-bottom:var(--space-xl);text-align:center;transition:margin-bottom .5s var(--ease-panel)}.logo-title{margin:0;font-family:var(--font-title);font-size:calc(var(--font-size-xl) * 1.5625);font-weight:700;line-height:1.2;letter-spacing:-.03em;transition:font-size .5s var(--ease-panel);@media(min-width:769px)and (min-height:501px){font-size:calc(var(--font-size-xl) * 1.25)}}.sidebar-inner-wrapper.is-compact .logo-title{font-size:calc(var(--font-size-lg) * 1.5625);@media(min-width:769px)and (min-height:501px){font-size:calc(var(--font-size-lg) * 1.25)}}.logo-line-1,.logo-line-2{display:block}.play-button-container{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:nowrap;margin-bottom:var(--space-lg);@media(min-width:769px)and (min-height:501px){gap:1.5px;.sidebar-control-button{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}}}.sidebar-control-button{display:flex;align-items:center;justify-content:center;position:relative;padding:0;border:none;background:none;color:var(--color-accent);cursor:pointer;line-height:1;transition:transform var(--transition-duration-fast) ease;&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);border-radius:var(--radius-md)}@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.1)}}&:active{transform:scale(.95);transition-duration:.1s}.sidebar-icon,.theme-icon{width:24px;height:24px;flex-shrink:0}&.active{color:#fff;background-color:var(--color-accent);border-radius:var(--radius-md)}:where(html.dark-mode) &.active{color:var(--color-bg)}}.active-filters-list{display:flex;flex-wrap:wrap;gap:var(--space-xs);padding:var(--space-xxs) var(--space-xs) 0;min-height:1px}@keyframes pill-pop-in{0%{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}@keyframes fadeOutPill{to{opacity:0;transform:scale(.8)}}.filter-pill{display:flex;align-items:center;min-height:30px;height:auto;padding-inline:var(--space-sm);padding-block:4px;border-radius:var(--radius-pill);background-image:linear-gradient(45deg,var(--color-accent),var(--color-accent-darker));box-shadow:0 2px 5px #0000001a;color:#fff;cursor:pointer;font-size:var(--font-size-xs);font-weight:700;line-height:1.1;animation:pill-pop-in .3s var(--transition-timing-function);&:active{transform:scale(.96);filter:brightness(.95);transition:transform 50ms var(--ease-luxury)}>span:first-child{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-transform:capitalize}&.filter-pill--exclude{background-image:linear-gradient(45deg,var(--color-accent-exclude-darker),var(--color-accent-exclude))}&.is-removing{animation:fadeOutPill .2s ease-out forwards}:where(html.dark-mode) &{color:var(--color-bg)}:where(html.dark-mode) &.filter-pill--exclude{color:#fff}.remove-filter-btn{margin-left:var(--space-xs);padding:0;border:none;background:none;color:currentColor;opacity:.7;display:flex;align-items:center;height:100%;transition:opacity var(--transition-duration-fast),transform .2s var(--ease-bounce-sharp);@media(hover:hover)and (pointer:fine){&:hover{opacity:1;transform:scale(1.2)}}&:active{transform:scale(.9)}}}.sidebar-scrollable-filters{padding-top:var(--space-xxl);overflow-x:hidden;touch-action:pan-y}.sidebar-inner-wrapper :is(button,a,input,select){touch-action:pan-y}@media(min-width:769px)and (min-height:501px){.sidebar-scrollable-filters{overflow-y:auto;flex-grow:1;min-height:0;padding-right:0;scrollbar-width:none;overscroll-behavior-y:contain}.sidebar-scrollable-filters::-webkit-scrollbar{display:none}}.collapsible-section{display:flex;flex-direction:column;margin-bottom:var(--space-md)}.section-header{display:flex;justify-content:space-between;align-items:center;width:100%;padding:var(--space-xxs) var(--space-xs);border:none;border-radius:var(--radius-md);background-color:transparent;color:var(--color-text-primary);cursor:pointer;text-align:left;font-family:var(--font-title);font-size:var(--font-size-base);font-weight:700;transition:background-color var(--transition-duration-fast);@media(hover:hover)and (pointer:fine){&:hover{background-color:var(--color-bg)}}&:active{transform:scale(.99);transition-duration:.1s}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}}body.sidebar-collapsed .sidebar{flex-basis:65px;width:65px;.sidebar-inner-wrapper{padding-inline:0}.logo-area,.sidebar-static-filters,.sidebar-scrollable-filters{display:none}.play-button-container{flex-direction:column;gap:var(--space-lg);margin-top:var(--space-md)}.profile-container{height:auto;padding-bottom:var(--space-xs)}.user-session-group{flex-direction:column;gap:var(--space-md)}}.chevron-icon{stroke:var(--color-text-secondary);transition:transform var(--transition-duration-normal)}.collapsible-section.active .chevron-icon{transform:rotate(90deg)}.section-content{display:flex;flex-direction:column;gap:1px;padding-left:var(--space-xs);max-height:0;opacity:0;transform:translateY(-10px);overflow:hidden;visibility:hidden;position:relative;z-index:1;transition:max-height .25s ease,opacity .2s ease-in-out,transform .25s ease,visibility 0s linear .25s}.collapsible-section.active .section-content{max-height:40rem;opacity:1;transform:translateY(0);visibility:visible;z-index:10;transition-delay:0s}.collapsible-section.active.is-ready .section-content{overflow:visible}.filter-link{display:flex;justify-content:space-between;align-items:center;padding:2px var(--space-xs);border:none;border-radius:var(--radius-sm);background:none;color:var(--color-text-secondary);cursor:pointer;text-align:left;text-decoration:none;font:inherit;font-size:var(--font-size-sm);font-weight:700;min-height:34px;box-sizing:border-box;transition:color var(--transition-duration-fast),background-color var(--transition-duration-fast),transform var(--transition-duration-fast);&:active{transform:scale(.98);transition-duration:.1s}@media(hover:hover)and (pointer:fine){&:hover{color:var(--color-text-primary);transform:translate(2px)}&:hover:active{transform:translate(2px) scale(.99)}}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus);background-color:var(--color-bg)}&.active{position:relative;padding-left:var(--space-sm);background-color:var(--color-accent);color:#fff;:where(html.dark-mode) &{color:var(--color-bg)}&:before{content:"\\25b6";position:absolute;left:var(--space-xs);top:50%;font-size:.8em;line-height:1;transform:translateY(-50%)}}}.exclude-filter-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;min-width:0;min-height:0;flex-shrink:0;margin-left:var(--space-xs);border:1px solid transparent;border-radius:50%;background-color:transparent;color:var(--color-text-secondary);opacity:0;transition:opacity var(--transition-duration-fast),background-color var(--transition-duration-fast),color var(--transition-duration-fast),transform .2s var(--ease-bounce-sharp);.filter-link:hover &,.filter-link:focus-visible &,&:focus-visible{opacity:1}@media(hover:hover)and (pointer:fine){&:hover{background-color:var(--color-border-soft);color:var(--color-accent-exclude);transform:scale(1.15)}}@media(hover:none)and (pointer:coarse){opacity:1;color:var(--color-text-tertiary)}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}.filter-link.active &,.filter-link.is-excluded &{display:none!important}& svg{width:18px;height:18px;stroke-width:2}}.sidebar-filter-form{position:relative;margin-top:var(--space-xxs);width:96%;margin-inline:auto}.sidebar-filter-input{width:100%;padding:var(--space-xxs) var(--space-xs);border:none;border-bottom:1px solid var(--color-border);border-radius:0;background-color:transparent;color:var(--color-text-primary);font-size:var(--font-size-sm);transition:border-color var(--transition-duration-fast);&:focus{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}&:focus::placeholder{color:transparent}&::placeholder{color:var(--color-text-secondary);opacity:.8}}.sidebar-autocomplete-results{position:absolute;bottom:100%;left:0;right:0;z-index:var(--z-index-autocomplete);max-height:150px;border:1px solid var(--color-border);border-radius:var(--radius-md);background-color:var(--color-surface);box-shadow:var(--shadow);overflow-y:auto;overscroll-behavior:contain;&:empty{display:none}@media(max-height:500px){max-height:100px}}.sidebar-autocomplete-item{padding:var(--space-sm);cursor:pointer;font-size:var(--font-size-sm);transition:background-color var(--transition-duration-fast);&.is-active,&:hover{background-color:var(--color-bg);color:var(--color-text-primary)}& strong{color:var(--color-accent)}}#year-slider-container{display:flex;flex-direction:column;align-items:center;gap:var(--space-md);padding-top:0}#year-slider-wrapper{position:relative;width:90%;margin:10px 0;padding:0 14px}#year-input-container{display:flex;justify-content:center;align-items:center;gap:var(--space-xxs);width:100%}.year-range-separator{color:var(--color-text-secondary);font-weight:700;transform:translateY(-1px);flex-shrink:0}#year-slider.custom-year-slider{position:relative;width:100%;height:24px;display:flex;align-items:center;user-select:none;touch-action:none;.slider-track{position:absolute;left:0;right:0;height:6px;border:1px solid var(--color-border);border-radius:var(--radius-pill);background:var(--color-border);pointer-events:none}.slider-connect{position:absolute;height:100%;border-radius:var(--radius-pill);background:var(--color-accent);pointer-events:none}.slider-handle{position:absolute;top:50%;width:6px;height:22px;transform:translate(-50%,-50%);border:1.5px solid var(--color-accent);border-radius:2px;background:var(--color-surface);box-shadow:0 1px 4px #00000040;cursor:grab;z-index:2;touch-action:none;transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,background-color .15s ease;&:after{content:"";position:absolute;inset:-10px -15px;display:block}&:focus{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}&:active{cursor:grabbing;z-index:3;background:var(--color-accent)}@media(hover:hover)and (pointer:fine){&:hover{transform:translate(-50%,-50%) scale(1.15)}}}&.is-same-year .slider-handle[data-handle="0"]{transform:translate(calc(-50% - 4px),-50%)}&.is-same-year .slider-handle[data-handle="1"]{transform:translate(calc(-50% + 4px),-50%)}}.year-input{width:100%;padding:.35rem 32px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background-color:var(--color-bg);color:var(--color-text-primary);text-align:center;font-size:var(--font-size-xs);-moz-appearance:textfield;appearance:textfield;&:focus{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-focus)}&::-webkit-outer-spin-button,&::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}}.year-input-wrapper{position:relative;flex:1;min-width:0}.stepper-btn{position:absolute;top:0;bottom:0;width:30px;padding:0;border:none;background:none;color:var(--color-text-secondary);cursor:pointer;font-size:var(--font-size-xs);line-height:1;transition:background-color var(--transition-duration-fast);display:flex;align-items:center;justify-content:center;z-index:2;&:hover{background-color:var(--color-border-soft);color:var(--color-text-primary)}&:active{background-color:var(--color-border)}}.stepper-down{left:0;border-right:1px solid var(--color-border);border-radius:var(--radius-sm) 0 0 var(--radius-sm)}.stepper-up{right:0;border-left:1px solid var(--color-border);border-radius:0 var(--radius-sm) var(--radius-sm) 0}@media(min-width:769px)and (min-height:501px){.year-input{padding:.35rem var(--space-xs);padding-right:25px}.stepper-btn{right:1px;left:auto;width:20px;height:50%;background-color:var(--color-surface);border-left:1px solid var(--color-border);opacity:0;visibility:hidden}.stepper-up{top:0;bottom:auto;border-bottom:1px solid var(--color-border);border-radius:0 var(--radius-sm) 0 0}.stepper-down{top:auto;bottom:0;border-right:none;border-radius:0 0 var(--radius-sm) 0}.year-input-wrapper:hover .stepper-btn,.year-input-wrapper:focus-within .stepper-btn{opacity:1;visibility:visible}}#total-results-sidebar{display:none!important}.sidebar:before{content:"";position:absolute;top:0;left:0;width:100%;height:3px;background-color:var(--color-accent);opacity:0;z-index:calc(var(--z-index-sidebar) + 1);pointer-events:none;transform:translate(-100%);transition:opacity .3s ease}:where(body.is-fetching) .sidebar:before{opacity:1;animation:indeterminate-loading-gpu 1.5s infinite var(--ease-smooth)}@keyframes indeterminate-loading-gpu{0%{transform:translate(-100%)}50%{transform:translate(0)}to{transform:translate(100%)}}.sidebar .profile-container{margin-top:auto;padding-top:var(--space-md);display:flex;align-items:center;justify-content:center;height:52px}.user-session-group{display:none;align-items:center;gap:var(--space-md)}.user-session-group .sidebar-control-button{width:32px;height:32px;& svg{width:28px;height:28px}}.user-avatar{display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border-radius:var(--radius-round);background-color:transparent;border:3px solid var(--color-accent);color:var(--color-accent);font-size:var(--font-size-base);font-weight:700;cursor:pointer;transition:transform .2s ease;&:hover{transform:scale(1.1)}}:where(body.user-logged-in) #login-button{display:none}:where(body.user-logged-in) #user-session-group{display:inline-flex}.sidebar.is-dragging{transition:none!important;cursor:grabbing;will-change:transform}:where(body.sidebar-is-dragging){overflow:hidden;user-select:none;-webkit-user-select:none}:where(body.sidebar-is-dragging) .main-content-wrapper{pointer-events:none;filter:grayscale(.5);transition:filter .2s ease}.filter-link--studio,.filter-link--icon{justify-content:flex-start;padding-block:2px;border:2px solid transparent}.sidebar-platform-icon{height:30px;width:auto;max-width:100%;transition:transform var(--transition-duration-fast)}.sidebar-platform-img{height:20px;width:auto;max-width:100%;object-fit:contain;transition:transform var(--transition-duration-fast),filter .3s ease}:where(html.dark-mode) .sidebar-platform-img.invert-on-dark{filter:invert(1) brightness(2)}.filter-link--icon:hover :is(.sidebar-platform-icon,.sidebar-platform-img){transform:scale(1.1)}.filter-link--icon.active{background-color:transparent;border-color:var(--color-accent);padding-inline:var(--space-xs);color:var(--color-text-primary);box-shadow:none}.filter-link--icon.active:before{content:none;display:none}:where(html.dark-mode) .filter-link--icon.active{color:var(--color-text-primary)}#studios-list-container{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-xs)}#studios-list-container .filter-link{justify-content:center}@media(max-width:768px),(max-height:500px){.logo-title{font-size:2.8125rem}.collapsible-section .section-header{font-size:var(--font-size-md)}.filter-link,.sidebar-autocomplete-item{font-size:var(--font-size-base)}.filter-pill{font-size:var(--font-size-sm)}.year-input{font-size:1.1rem}.total-results-container{font-size:var(--font-size-base)}.exclude-filter-btn{width:26px;height:26px;opacity:1;min-width:0;min-height:0;flex-shrink:0;& svg{width:18px;height:18px;stroke-width:2}}.sidebar-platform-icon{height:42px}.sidebar-platform-img{height:32px}#studios-list-container .filter-link{min-height:48px;padding-block:var(--space-xs)}}@media(hover:none)and (pointer:coarse){.filter-pill{padding-inline:var(--space-md)}.filter-pill .remove-filter-btn{padding:0 8px;font-size:1.2rem;position:relative}.filter-pill .remove-filter-btn:after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px}.sidebar-autocomplete-item:active,.collapsible-section .section-header:active{transform:scale(.98)}.sidebar-control-button{min-width:var(--tap-target-size);min-height:var(--tap-target-size)}.filter-link{min-height:var(--tap-target-size);align-items:center}.exclude-filter-btn{position:relative;min-width:0;min-height:0;width:26px;height:26px;flex-shrink:0}.exclude-filter-btn:after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px}}.bento-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-xs);padding-bottom:var(--space-xs);width:96%;margin:0 auto}.bento-grid .filter-link,.bento-input{background-color:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);text-align:left;min-height:36px;padding:var(--space-xxs) var(--space-xs);font-weight:var(--font-weight-semibold);box-shadow:var(--shadow-sm);width:100%;display:flex;align-items:center;justify-content:flex-start;margin:0 auto;box-sizing:border-box;transition:transform .1s,background-color .2s,border-color .2s,color .2s,box-shadow .2s}.bento-grid .filter-link{display:flex;width:100%;align-items:center;font-size:var(--font-size-xs);line-height:1.15;padding:var(--space-xxs) var(--space-xs);min-height:36px;box-sizing:border-box}.bento-grid .filter-link:active{transform:scale(.96)}.bento-grid .filter-link.active{background-image:linear-gradient(45deg,var(--color-accent),var(--color-accent-darker));background-color:var(--color-accent);color:#fff;border-color:transparent;padding-left:var(--space-xs)}.bento-grid .filter-link.active:before{display:none}.bento-grid .filter-link.is-excluded{background-image:linear-gradient(45deg,var(--color-accent-exclude-darker),var(--color-accent-exclude));background-color:var(--color-accent-exclude);color:#fff;border-color:transparent;padding-left:var(--space-xs)}:where(html.dark-mode) .bento-grid .filter-link,:where(html.dark-mode) .bento-input{background-color:#ffffff08;border-color:var(--color-border);color:var(--color-text-primary)}:where(html.dark-mode) .bento-grid .filter-link.active{color:var(--color-bg)}.bento-grid .filter-link[data-filter-value=Animaci\\f3n],.bento-grid .filter-link[data-filter-value=Documental],.bento-grid .filter-link[data-filter-value=EEUU],.bento-grid .filter-link[data-filter-value=Espa\\f1 a]{grid-column:1 / -1;justify-content:space-between;align-items:center;padding:var(--space-xxs) var(--space-xs);min-height:36px;box-sizing:border-box;&.active,&.is-excluded{justify-content:flex-start}}.bento-grid .exclude-filter-btn{margin-left:auto;background-color:#0000000d;width:24px;height:24px;min-width:0;min-height:0;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}.bento-grid .exclude-filter-btn svg{width:16px;height:16px}:where(html.dark-mode) .bento-grid .exclude-filter-btn{background-color:#ffffff1a}.collapsible-section:has(.bento-input) .sidebar-filter-form{margin-top:0;width:96%;margin-inline:auto}.quick-view-overlay{position:fixed;inset:0;z-index:var(--z-index-overlay);background-color:#0000006b;opacity:0;visibility:hidden;pointer-events:none;backdrop-filter:blur(6px) saturate(85%);-webkit-backdrop-filter:blur(6px) saturate(85%);transition:opacity .4s ease,visibility 0s linear .4s;&.is-visible{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}}.quick-view-modal{position:fixed;z-index:calc(var(--z-index-overlay) + 1);display:flex;background-color:var(--color-surface-1);color:var(--color-text-primary);box-shadow:0 16px 40px #00000038,0 6px 18px #0000001a;overflow:hidden;opacity:0;visibility:hidden;pointer-events:none;touch-action:pan-y;transition:opacity .35s ease,transform .4s var(--ease-smooth-out),visibility 0s linear .4s;&:focus{outline:none}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus),0 16px 40px #00000038}&.is-visible{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s}&.is-visible,&.is-dragging{will-change:transform,opacity}:where(html.dark-mode) &{box-shadow:0 20px 60px #000000b3,0 0 0 1px #ffffff14}}::view-transition-group(hero-expansion){animation-duration:.4s;animation-timing-function:var(--ease-smooth-out)}.quick-view-content{width:100%;height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;&::-webkit-scrollbar{display:none}}.is-quick-view.movie-card{aspect-ratio:auto;perspective:none;animation:none}.is-quick-view .flip-card-inner{transform-style:flat;box-shadow:none;display:flex;flex-direction:column;height:100%;transition:opacity var(--duration-fast) ease-in-out}.quick-view-modal.modal-is-loading .is-quick-view .flip-card-inner{opacity:.25;pointer-events:none}.is-quick-view :is(.flip-card-front,.flip-card-back){position:relative;inset:auto;transform:none;backface-visibility:visible;height:auto;overflow:visible}.is-quick-view .flip-card-front{padding:var(--space-lg);border-bottom:1px solid var(--color-border);flex-shrink:0}.is-quick-view .flip-card-back{padding:var(--space-lg);flex-grow:1;min-width:0;pointer-events:auto}.is-quick-view{.back-meta-header{order:1}.ratings-container{order:2}.back-original-title-wrapper{order:3}.front-director-info{order:4}.details-list{order:5}.scrollable-content{order:6}.expand-content-btn{order:7}}.is-quick-view .poster-container{height:auto;width:100%;border:none;& img{border-radius:var(--radius-xxl);box-shadow:var(--shadow);border:none;margin-bottom:0;animation:modal-poster-fade-in .5s ease-out backwards}}.is-quick-view img.lazy-lqip{filter:blur(10px);transform:scale(1.03);transition:filter var(--duration-normal, .4s) ease-in-out,transform var(--duration-normal, .4s) ease-in-out;&.loaded{filter:blur(0);transform:scale(1)}}@keyframes modal-poster-fade-in{0%{opacity:0}to{opacity:1}}.quick-view-modal .movie-summary{padding-inline:0;padding-top:0}.quick-view-modal .title-director-block{min-height:82px;justify-content:center;margin-bottom:0}.is-quick-view .movie-summary :is(h1,h3)[data-template=title]{font-size:2.05rem;font-weight:var(--font-weight-extrabold);color:var(--color-text-primary);line-height:1.1;margin-bottom:4px;letter-spacing:-.03em;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;&.title-medium{font-size:1.75rem}&.title-long{font-size:1.5rem}&.title-xl-long{font-size:1.32rem}&.title-xxl-long{font-size:1.2rem}&.title-xxxl-long{font-size:1.12rem}}.is-quick-view .front-director-info{font-size:calc(var(--font-size-xs) * 1.5);color:var(--color-text-secondary);margin-top:6px;margin-bottom:var(--space-sm);line-height:1.35;white-space:normal;overflow:visible;text-overflow:clip;display:block;width:100%;flex-shrink:0;&:empty{display:none}}.is-quick-view .card-rating-block{position:relative;z-index:10;transform:none;padding:0 0 2px;margin:-8px 0 0;pointer-events:auto;justify-content:center;align-items:center;gap:var(--space-lg)}.is-quick-view .card-rating-block *{pointer-events:auto}.is-quick-view .star-rating-container{gap:var(--space-sm);width:150px;justify-content:center}.is-quick-view .star-icon{width:42px;height:42px;margin-right:0}.is-quick-view .low-rating-star{display:none!important}.is-quick-view .card-action-btn{width:48px;height:48px;margin:-6px 0 0;& svg{width:46px;height:46px;stroke-width:2.3px}&.is-active{background-color:transparent;& svg{color:#e50914!important;fill:#e50914!important;stroke:#e50914!important}}}.is-quick-view .movie-meta{align-items:center;margin-top:auto;padding-top:var(--space-xs)}.is-quick-view .modal-horizontal-divider{flex-grow:1;height:1px;background-color:var(--color-border);align-self:center;margin-inline:var(--space-md);opacity:.8}.is-quick-view .card-icons-line:empty+.modal-horizontal-divider{margin-left:0}.is-quick-view .card-icons-line{gap:var(--space-md)}.is-quick-view .platform-icon svg{width:33px;height:33px}.is-quick-view .year-country-line{padding-right:6px;overflow:visible}.is-quick-view .year-flag-group{font-size:2rem;line-height:1;gap:var(--space-sm);overflow:visible;& a{display:inline-block;border-radius:var(--radius-sm, 3px);padding:1px 4px;margin:-1px -4px;&:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px;border-radius:var(--radius-sm, 3px);text-decoration:none;color:var(--color-text-primary)}}}.is-quick-view .country-info{margin-right:6px;padding:3px;border-radius:var(--radius-sm, 4px);transform-origin:center right;&:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px;border-radius:var(--radius-sm, 4px);transform:scale(1.1)}}.is-quick-view .country-flag-icon svg{width:28px;height:28px;box-shadow:0 0 0 2px #0000000d}.is-quick-view .episode-duration-group{font-size:calc(var(--font-size-sm) * 1.5);font-weight:var(--font-weight-bold, 700);letter-spacing:1px}.is-quick-view :is([data-template=duration],[data-template=episodes]){font-weight:var(--font-weight-bold, 700)}.is-quick-view :is(.rating-left,.rating-line){gap:12px}.is-quick-view .rating-left{font-size:calc(var(--font-size-base) * 1.5)}.is-quick-view :is(.details-list,.plot-summary-final){font-size:calc(var(--font-size-xs) * 1.5);line-height:1.5;color:var(--color-text-secondary);hyphens:none;-webkit-hyphens:none}.is-quick-view .detail-data,.is-quick-view .plot-summary-final span[data-template=synopsis]{color:var(--color-text-primary)}.is-quick-view :is(.details-list,.detail-item,.detail-data,[data-template=genre],[data-template=actors]) a{color:var(--color-text-primary);text-decoration:none;transition:color var(--duration-fast, .15s) ease;cursor:pointer;display:inline;border-radius:var(--radius-sm, 3px);&:hover{color:var(--color-text-primary);text-decoration:underline}&:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px;border-radius:var(--radius-sm, 3px);text-decoration:none}}.is-quick-view .front-director-info a{display:inline;border-radius:var(--radius-sm, 3px);&:focus-visible{outline:2px solid var(--color-accent);outline-offset:1px;border-radius:var(--radius-sm, 3px);text-decoration:none;color:var(--color-text-primary)}}.is-quick-view .details-list{margin-top:var(--space-lg);margin-bottom:0;padding-top:var(--space-md);gap:var(--space-md)}.is-quick-view .plot-summary-final{margin-top:var(--space-xl);padding-top:var(--space-md)}.is-quick-view .detail-label{display:inline-flex;align-items:center;justify-content:center;vertical-align:-2px;margin-right:8px;color:var(--color-accent);flex-shrink:0}.is-quick-view .detail-icon{width:18px;height:18px;max-width:18px;max-height:18px;stroke:currentColor;stroke-width:2.6;fill:none;flex-shrink:0;display:inline-block}.is-quick-view .detail-label-title{display:inline-block;font-weight:var(--font-weight-bold, 700);color:var(--color-text-primary);margin-right:.5em}.is-quick-view .rating-bar-container{height:var(--space-sm);&[data-votes]:hover:after{display:none}}.is-quick-view .rating-votes-count{display:flex!important;flex-direction:column;justify-content:center;min-width:6ch;white-space:nowrap;text-align:right;font-size:var(--font-size-base);font-weight:700;margin-right:0;line-height:1;&:empty{display:none!important}&:after{content:"votos";font-size:.6em;font-weight:400;color:var(--color-text-secondary);text-align:right;width:100%;margin-top:2px;white-space:nowrap}}.is-quick-view [data-template=actors] a{color:inherit;text-decoration:none;transition:color var(--duration-fast);&:hover{color:var(--color-text-primary);text-decoration:underline}}.is-quick-view .back-original-title-wrapper{min-height:0;margin-top:var(--space-lg);margin-bottom:2px;padding:0;align-items:flex-start;flex-shrink:0;animation:none;& span{font-size:1.6rem;font-weight:700;line-height:1.1;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:-.2em}& span.title-medium{font-size:1.45rem}& span.title-long{font-size:1.3rem}& span.title-xl-long{font-size:1.05rem}}.is-quick-view .back-meta-header{flex-shrink:0;margin-bottom:var(--space-lg)}.is-quick-view .scrollable-content{overflow:visible;height:auto;mask-image:none;&:after{display:none}}.is-quick-view :is(.expand-content-btn,.actors-expand-btn){display:none}.is-quick-view .detail-item[data-template=actors-container],.is-quick-view .detail-item[data-template=genre-container]{-webkit-line-clamp:initial;line-clamp:initial;white-space:normal;display:block}.is-quick-view .ratings-container{gap:var(--space-lg)}.modal-nav-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:100;width:48px;height:48px;background:rgba(var(--color-surface-rgb),.9);border:1px solid var(--color-border);border-radius:50%;color:var(--color-text-primary);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px #00000026;transition:transform .2s ease,background-color .2s ease,opacity .2s ease;&:hover{transform:translateY(-50%) scale(1.1);background:var(--color-surface)}&:active{transform:translateY(-50%) scale(.95)}&:disabled{opacity:0;pointer-events:none}:where(html.dark-mode) &{background:rgba(var(--color-surface-rgb),.9)}}.modal-nav-btn--prev{left:20px}.modal-nav-btn--next{right:20px}.quick-view-modal.hide-arrows .modal-nav-btn{opacity:0!important;pointer-events:none!important}@media(max-width:700px){.quick-view-overlay{backdrop-filter:blur(4px) saturate(85%);-webkit-backdrop-filter:blur(4px) saturate(85%)}.quick-view-modal{top:auto;bottom:0;left:50%;width:96%;height:92dvh;max-height:92dvh;border-radius:var(--radius-xl) var(--radius-xl) 0 0;transform:translate(-50%,30px) scale(.94);transition:opacity .35s ease,transform .4s var(--ease-smooth-out);&.is-visible{transform:translate(-50%) scale(1)}&:before{content:"";position:absolute;top:12px;left:50%;transform:translate(-50%);width:40px;height:5px;background-color:var(--color-border);border-radius:10px;z-index:10;pointer-events:none}&.is-dragging{transition:none!important;will-change:transform}}.is-quick-view .flip-card-inner{flex-direction:column}.is-quick-view .flip-card-front{padding-top:30px;padding-bottom:var(--space-xs);border-bottom:none;& img{box-shadow:0 4px 12px #00000026}}.is-quick-view .flip-card-back{padding-top:0}.modal-nav-btn{top:25%}.is-quick-view .poster-container{width:70%;margin-inline:auto;transition:width .3s var(--ease-smooth-out)}.quick-view-modal.hide-arrows .is-quick-view .poster-container{width:100%}}@media(min-width:701px){.quick-view-modal{top:50%;left:50%;width:90%;max-width:720px;max-height:92dvh;height:auto;border-radius:var(--radius-xl);transform:translate(-50%,calc(-50% + 15px)) scale(.92);&.is-visible{transform:translate(-50%,-50%) scale(1)}}.quick-view-content{overflow:hidden}.is-quick-view .flip-card-inner{display:block;position:relative;overflow:visible}.is-quick-view .flip-card-front{width:50%;height:auto;max-height:92dvh;border-right:1px solid var(--color-border);border-bottom:none;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;box-sizing:border-box}.is-quick-view .flip-card-back{position:absolute;inset:0 0 0 auto;width:50%;height:100%;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;box-sizing:border-box}}@media(hover:none)and (pointer:coarse){.quick-view-overlay{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background-color:#00000080}}@media(prefers-reduced-transparency:reduce),(prefers-reduced-motion:reduce){.quick-view-overlay,.auth-overlay{backdrop-filter:none;-webkit-backdrop-filter:none;background-color:#000000e6}}.is-quick-view.person-card{.poster-container{width:240px!important;height:auto!important;margin:0 auto!important;padding-top:var(--space-lg)!important;position:relative!important;background:transparent!important;display:block!important}.poster-container img{width:100%!important;height:auto!important;border-radius:var(--radius-xxl)!important;border:4px solid var(--color-surface)!important;box-shadow:var(--shadow),0 0 0 1px var(--color-border)!important;transition:transform var(--duration-quick) var(--ease-spring)!important;display:block!important;@media(hover:hover)and (pointer:fine){&:hover{transform:scale(1.03)!important}}}.poster-overlay-guard{position:absolute!important;width:auto!important;height:auto!important;border-radius:calc(var(--radius-xxl) - 4px)!important;inset:4px 4px 4px auto!important;transform:none!important}.poster-container:after{display:none!important}.card-rating-block{display:none!important}.person-role-toggle-btn{bottom:8px!important;right:8px!important;width:26px!important;height:26px!important;font-size:.85rem!important}@media(min-width:701px){.flip-card-inner{display:block!important;position:relative!important;overflow:visible!important;height:auto!important;min-height:min(600px,92vh)!important}.flip-card-front{width:45%!important;min-height:min(600px,92vh)!important;height:auto!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;text-align:center!important;border-right:1px solid var(--color-border)!important;border-bottom:none!important;box-sizing:border-box!important;padding:var(--space-lg)!important;flex-shrink:0!important}.flip-card-back{position:absolute!important;inset:0 0 0 auto!important;width:55%!important;height:100%!important;overflow-y:auto!important;box-sizing:border-box!important;padding:var(--space-lg)!important}.movie-info.movie-summary{width:100%!important;margin-top:var(--space-md)!important;padding-top:0!important}}@media(max-width:700px){.poster-container{margin-bottom:var(--space-lg)!important}}}.legal-overlay{position:fixed;inset:0;z-index:var(--z-index-overlay);background-color:#0000008c;backdrop-filter:blur(6px) saturate(85%);-webkit-backdrop-filter:blur(6px) saturate(85%);transition:opacity .3s ease}.legal-modal{position:fixed;z-index:calc(var(--z-index-overlay) + 1);&:focus{outline:none}&:focus-visible{outline:none;box-shadow:0 0 0 3px var(--color-focus)}}@media(min-width:701px){.legal-modal{top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:640px;max-height:85vh}.legal-box{display:flex;flex-direction:column;max-height:85vh;background-color:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 50px #00000059;overflow:hidden;animation:auth-pop-in .3s var(--ease-snap)}}@media(max-width:700px){.legal-modal{inset:auto 0 0;width:100%;max-height:90vh}.legal-box{display:flex;flex-direction:column;max-height:90vh;background-color:var(--color-surface);border-top:1px solid var(--color-border);border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:0 -10px 40px #0006;overflow:hidden;animation:auth-slide-up .3s var(--ease-snap)}}.legal-header{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:var(--space-md) var(--space-lg);border-bottom:1px solid var(--color-border);background-color:var(--color-surface-1)}.legal-logo{margin:0;font-family:var(--font-title);font-size:var(--font-size-md);font-weight:var(--font-weight-bold);letter-spacing:-.02em;color:var(--color-text-primary);& span:first-child{color:var(--color-text-primary)}& span:last-child{color:var(--color-accent)}}.legal-close-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;background:transparent;border:none;border-radius:var(--radius-full);color:var(--color-text-secondary);cursor:pointer;transition:background-color var(--duration-fast),color var(--duration-fast);&:hover{background-color:var(--color-surface-2);color:var(--color-text-primary)}&:focus-visible{outline:2px solid var(--color-focus)}}.legal-nav{flex-shrink:0;display:flex;gap:var(--space-xs);padding:0 var(--space-md);background-color:var(--color-surface-1);border-bottom:1px solid var(--color-border);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;&::-webkit-scrollbar{display:none}@media(min-width:701px){padding:0 var(--space-lg)}}.legal-tab-btn{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;padding:10px var(--space-md) 15px var(--space-md);background:transparent;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:var(--font-body);font-size:var(--font-size-xs);font-weight:var(--font-weight-medium);line-height:1.3;color:var(--color-text-secondary);cursor:pointer;white-space:nowrap;transition:color var(--duration-fast),border-color var(--duration-fast);&:hover{color:var(--color-text-primary)}&.is-active{color:var(--color-text-primary);border-bottom-color:var(--color-accent);font-weight:var(--font-weight-bold)}&:focus-visible{outline:2px solid var(--color-focus);outline-offset:-2px;border-radius:var(--radius-sm)}}.legal-body{flex:1 1 auto;min-height:0;padding:var(--space-lg);overflow-y:auto;font-size:var(--font-size-sm);line-height:1.6;color:var(--color-text-secondary);scrollbar-width:thin;scrollbar-color:var(--color-border) transparent}.legal-panel{display:none;&.is-active{display:block;animation:fade-in .25s ease-out}& h3{margin:0 0 var(--space-sm) 0;font-family:var(--font-title);font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--color-text-primary)}& p{margin:0 0 var(--space-md) 0;&:last-child{margin-bottom:0}}& strong{color:var(--color-text-primary)}& ul{margin:0 0 var(--space-md) 0;padding-left:var(--space-lg);& li{margin-bottom:var(--space-xs)}}& a{color:var(--color-accent);text-decoration:underline;text-underline-offset:2px;transition:color var(--duration-fast);&:hover{color:var(--color-text-primary)}}& code{padding:2px 6px;background-color:var(--color-surface-2);border-radius:var(--radius-sm);font-size:.9em;color:var(--color-text-primary)}}.legal-contact-card{display:flex;flex-direction:column;gap:var(--space-xs);padding:var(--space-md);margin:var(--space-md) 0;background-color:var(--color-surface-1);border:1px solid var(--color-border);border-radius:var(--radius-md)}.legal-contact-label{font-size:var(--font-size-xs);font-weight:var(--font-weight-medium);color:var(--color-text-secondary)}.legal-contact-link{font-family:var(--font-mono, monospace);font-size:var(--font-size-md);font-weight:var(--font-weight-bold);color:var(--color-accent)!important;text-decoration:none!important;&:hover{text-decoration:underline!important}}.legal-table-wrapper{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:var(--space-md) 0;border:1px solid var(--color-border);border-radius:var(--radius-md);background-color:var(--color-surface)}.legal-cookie-table{width:100%;border-collapse:collapse;text-align:left;font-size:.8rem;line-height:1.45;& th,td{padding:8px 12px;border-bottom:1px solid var(--color-border);vertical-align:top}& th{background-color:var(--color-surface-1);color:var(--color-text-primary);font-weight:var(--font-weight-bold);white-space:nowrap;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}& tr:last-child td{border-bottom:none}& tbody tr:nth-child(2n){background-color:#7d7d7d0a}& tbody tr:hover{background-color:#ffffff08}& code{font-size:.85em;padding:2px 5px;background-color:var(--color-surface-2);border-radius:var(--radius-sm);color:var(--color-text-primary);white-space:nowrap}}.legal-small-note{font-size:var(--font-size-xs);color:var(--color-text-secondary);opacity:.85;margin-top:calc(var(--space-xs) * -1);margin-bottom:var(--space-md);font-style:italic}.legal-box-footer{flex-shrink:0;padding:var(--space-sm) var(--space-lg);border-top:1px solid var(--color-border);background-color:var(--color-surface-1);text-align:center;font-size:var(--font-size-xs);color:var(--color-text-secondary)}.brand-logo-text{font-family:var(--font-title);font-weight:800;font-size:1.25rem;letter-spacing:-.03em;color:var(--color-text-primary);text-decoration:none;display:flex;align-items:baseline;line-height:1}.brand-logo-text .logo-line-1{font-weight:800}.brand-logo-text .logo-line-2{font-weight:400;opacity:.75}.main-header-primary-controls{display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap}.total-results-container{display:flex;align-items:center;gap:4px;font-size:var(--font-size-xs);color:var(--color-text-tertiary);background:var(--color-surface-2);padding:4px 12px;border-radius:var(--radius-pill);border:1px solid var(--color-border)}.total-results-count{font-weight:700;color:var(--color-text-primary)}.btn-open-spa-subtle{display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-xs);font-weight:600;color:var(--color-text-secondary);background:var(--color-surface-1);border:1px solid var(--color-border);padding:6px 14px;border-radius:var(--radius-pill);text-decoration:none;transition:all var(--duration-quick) var(--ease-smooth)}.btn-open-spa-subtle:hover{background:var(--color-surface-2);color:var(--color-text-primary);border-color:var(--color-accent)}.card-ficha-btn{position:absolute;bottom:6px;left:8px;right:8px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0 10px;font-size:.74rem;font-weight:600;color:var(--color-text-secondary);background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-pill);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:10;transition:all var(--duration-quick) ease}.card-ficha-btn:hover{background:var(--color-accent);color:#fff;border-color:var(--color-accent)}.flip-card-back:not(.is-expanded) .expand-content-btn{bottom:34px!important;right:8px!important;z-index:25!important;pointer-events:auto!important}.flip-card-back.is-expanded .expand-content-btn{bottom:6px!important;right:8px!important;z-index:25!important;pointer-events:auto!important}.actors-expand-btn{z-index:25!important;pointer-events:auto!important}.year-country-line{margin-left:auto!important}.year-flag-group{justify-content:flex-end!important}.flip-card-back:not(.is-expanded) .scrollable-content{margin-bottom:38px}.person-card{cursor:default!important}.person-card .flip-card-inner{transform:none!important}.person-card a,.person-card button{cursor:pointer!important}.platform-icon{cursor:default!important;pointer-events:none}.btn-header-cta{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#f59e0b26;color:#f59e0b;border:1px solid rgba(245,158,11,.35);border-radius:9999px;text-decoration:none;transition:all .2s ease}.btn-header-cta:hover{background:#f59e0b;color:#0d0d0d;transform:scale(1.08)}.btn-header-cta svg{width:20px;height:20px}.movie-card:not(.person-card):not(.is-quick-view){cursor:pointer}.movie-card:not(.person-card):not(.is-quick-view) a,.movie-card:not(.person-card):not(.is-quick-view) button{cursor:pointer}.movie-card:not(.is-quick-view) .flip-card-inner{-webkit-backface-visibility:hidden;backface-visibility:hidden}.movie-card:not(.is-quick-view) .flip-card-front,.movie-card:not(.is-quick-view) .flip-card-back{-webkit-backface-visibility:hidden;backface-visibility:hidden}.movie-card:not(.is-quick-view) .flip-card-inner:not(.is-flipped) .flip-card-back,.movie-card:not(.is-quick-view) .flip-card-inner:not(.is-flipped) .flip-card-back *{pointer-events:none!important;visibility:hidden!important}.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-front,.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-front *{pointer-events:none!important;visibility:hidden!important}.movie-card:not(.is-quick-view) .flip-card-inner.is-flipped .flip-card-back{pointer-events:auto!important;visibility:visible!important;z-index:10!important}.detail-item[data-template=actors-container]{position:relative!important;overflow:visible!important;padding-right:24px!important}.actors-expand-btn{position:absolute!important;bottom:0!important;right:0!important;z-index:25!important;pointer-events:auto!important}.flip-card-back.is-expanded.show-actors .actors-scrollable-content{z-index:20!important;pointer-events:auto!important}\n';

// cloudflare/seo/taxonomy-types.js
var GENRE_MAP = {
  accion: {
    name: "Acci\xF3n",
    title: "Pel\xEDculas y Series de Acci\xF3n",
    description: "Explora las mejores pel\xEDculas y series de acci\xF3n en streaming. Cl\xE1sicos del cine adrenal\xEDnico, artes marciales y grandes superproducciones valoradas por la comunidad."
  },
  animacion: {
    name: "Animaci\xF3n",
    title: "Pel\xEDculas y Series de Animaci\xF3n",
    description: "Grandes obras maestras del cine y la televisi\xF3n de animaci\xF3n tradicional, stop-motion y CGI de estudios de todo el mundo disponibles en streaming."
  },
  aventuras: {
    name: "Aventuras",
    title: "Pel\xEDculas y Series de Aventuras",
    description: "Expediciones inolvidables, viajes \xE9picos y mundos por descubrir. El mejor cat\xE1logo de aventuras cinematogr\xE1ficas en streaming."
  },
  belico: {
    name: "B\xE9lico",
    title: "Pel\xEDculas y Series B\xE9licas",
    description: "Los conflictos hist\xF3ricos m\xE1s dram\xE1ticos y realistas llevados a la pantalla. Cine b\xE9lico imprescindible ordenado por valoraci\xF3n y votos."
  },
  biografia: {
    name: "Biograf\xEDa",
    title: "Biograf\xEDas y Biopics",
    description: "Vidas extraordinarias y figuras clave de la historia, la cultura y la ciencia. Los mejores dramas biogr\xE1ficos en streaming."
  },
  noir: {
    name: "Noir",
    title: "Cine Noir y Cine Negro",
    description: "Detectives c\xEDnicos, femmes fatales y claroscuros morales. Las joyas del cine negro cl\xE1sico y neo-noir disponibles para ver online."
  },
  comedia: {
    name: "Comedia",
    title: "Pel\xEDculas y Series de Comedia",
    description: "Desde el slapstick cl\xE1sico y la comedia absurda hasta la s\xE1tira inteligente y la comedia dram\xE1tica contempor\xE1nea."
  },
  crimen: {
    name: "Crimen",
    title: "Pel\xEDculas y Series de Crimen y Mafia",
    description: "Golpes maestros, organizaciones criminales e investigaciones policiales de alto calibre en streaming."
  },
  deporte: {
    name: "Deporte",
    title: "Cine y Series Deportivas",
    description: "Historias de superaci\xF3n, \xE9pica en la cancha y momentos cumbre del deporte llevados a la gran pantalla."
  },
  documental: {
    name: "Documental",
    title: "Documentales Imprescindibles",
    description: "Investigaciones period\xEDsticas, cr\xF3nicas hist\xF3ricas, naturaleza y sociedad en una cuidada selecci\xF3n documental."
  },
  drama: {
    name: "Drama",
    title: "Pel\xEDculas y Series Dram\xE1ticas",
    description: "Relatos humanos conmovedores, conflictos morales y grandes interpretaciones del cine dram\xE1tico universal."
  },
  familiar: {
    name: "Familiar",
    title: "Cine Familiar para Todas las Edades",
    description: "Pel\xEDculas entra\xF1ables y divertidas para disfrutar en familia, con recomendaciones de alta calidad cinematogr\xE1fica."
  },
  fantasia: {
    name: "Fantas\xEDa",
    title: "Pel\xEDculas y Series de Fantas\xEDa",
    description: "Mundos m\xE1gicos, criaturas m\xEDticas y viajes legendarios que desaf\xEDan las fronteras de la imaginaci\xF3n."
  },
  historico: {
    name: "Hist\xF3rico",
    title: "Cine y Series Hist\xF3ricas",
    description: "Recreaciones rigurosas y dram\xE1ticas de los periodos, imperios y revoluciones que moldearon nuestro mundo."
  },
  intriga: {
    name: "Intriga",
    title: "Pel\xEDculas y Series de Intriga y Misterio",
    description: "Giros de guion inesperados, enigmas sin resolver y tramas absorbentes que mantienen la tensi\xF3n hasta el final."
  },
  musica: {
    name: "M\xFAsica",
    title: "Cine Musical y Obras Musicales",
    description: "Bandas sonoras legendarias, musicales de Broadway y biograf\xEDas de los artistas que cambiaron la historia de la m\xFAsica."
  },
  romance: {
    name: "Romance",
    title: "Pel\xEDculas y Series Rom\xE1nticas",
    description: "Grandes historias de amor, romances apasionados y comedias rom\xE1nticas inteligentes ordenadas por valoraci\xF3n comunitaria."
  },
  "sci-fi": {
    name: "Sci-Fi",
    title: "Pel\xEDculas y Series de Ciencia Ficci\xF3n",
    description: "Viajes espaciales, futuros dist\xF3picos, inteligencia artificial y paradojas temporales en la mejor selecci\xF3n de ciencia ficci\xF3n en streaming."
  },
  terror: {
    name: "Terror",
    title: "Pel\xEDculas y Series de Terror",
    description: "Cine de terror psicol\xF3gico, horror sobrenatural, slashers de culto y monstruos cl\xE1sicos disponibles para ver online."
  },
  thriller: {
    name: "Thriller",
    title: "Pel\xEDculas y Series Thriller y Suspense",
    description: "Tensi\xF3n constante, persecuciones electrizantes y conspiraciones psicol\xF3gicas en el cat\xE1logo m\xE1s votado de suspense."
  },
  western: {
    name: "Western",
    title: "Cine Western y del Oeste",
    description: "Duelos bajo el sol, forajidos legendarios y la conquista de la frontera en los mejores westerns cl\xE1sicos y modernos."
  }
};
var STUDIO_MAP = {
  warner: {
    code: "warner",
    name: "Warner Bros.",
    title: "Pel\xEDculas y Series de Warner Bros.",
    description: "Cat\xE1logo legendario de Warner Bros. Pictures: desde los cl\xE1sicos dorados de Hollywood hasta las mayores franquicias contempor\xE1neas."
  },
  universal: {
    code: "universal",
    name: "Universal Pictures",
    title: "Pel\xEDculas y Series de Universal Pictures",
    description: "Los monstruos cl\xE1sicos, dramas de autor y grandes \xE9xitos de taquilla del hist\xF3rico estudio Universal Pictures."
  },
  sony: {
    code: "sony",
    name: "Sony Pictures",
    title: "Pel\xEDculas y Series de Sony Pictures",
    description: "Producciones y cl\xE1sicos de Columbia Pictures y TriStar producidos bajo el sello Sony Pictures Entertainment."
  },
  paramount: {
    code: "paramount",
    name: "Paramount Pictures",
    title: "Pel\xEDculas y Series de Paramount Pictures",
    description: "M\xE1s de un siglo de historia cinematogr\xE1fica con las obras cumbre producidas por Paramount Pictures."
  },
  disney: {
    code: "disney",
    name: "Walt Disney Pictures",
    title: "Pel\xEDculas y Series de Walt Disney",
    description: "Cl\xE1sicos animados imperecederos, producciones en imagen real y magia cinematogr\xE1fica para todas las generaciones."
  },
  netflix: {
    code: "netflix",
    name: "Netflix",
    title: "Pel\xEDculas y Series Originales de Netflix",
    description: "Obras premiadas y cine internacional exclusivo producido y distribuido por la plataforma Netflix."
  },
  amazon: {
    code: "amazon",
    name: "Amazon MGM Studios",
    title: "Pel\xEDculas y Series de Amazon MGM Studios",
    description: "T\xEDtulos destacados de Amazon Studios y el legendario cat\xE1logo del le\xF3n de Metro-Goldwyn-Mayer."
  },
  fox: {
    code: "fox",
    name: "20th Century Studios",
    title: "Pel\xEDculas y Series de 20th Century Studios",
    description: "El inmenso legado de 20th Century Fox: obras de culto, ciencia ficci\xF3n revolucionaria y ganadoras del \xD3scar."
  },
  lionsgate: {
    code: "lionsgate",
    name: "Lionsgate",
    title: "Pel\xEDculas y Series de Lionsgate",
    description: "Cine independiente audaz, sagas de acci\xF3n desenfrenada y thrillers de alto impacto producidos por Lionsgate."
  },
  canalplus: {
    code: "canalplus",
    name: "Canal+",
    title: "Cine y Series de Canal+",
    description: "Cine europeo de vanguardia, coproducciones autorales y prestigiosas series con el sello de calidad de Canal+."
  },
  bbc: {
    code: "bbc",
    name: "BBC Film",
    title: "Cine y Series de BBC Film",
    description: "Dramas de \xE9poca impecables, adaptaciones literarias y cine brit\xE1nico independiente producido por la BBC."
  },
  miramax: {
    code: "miramax",
    name: "Miramax",
    title: "Pel\xEDculas de Miramax",
    description: "El cine que revolucion\xF3 los a\xF1os 90: cine independiente de culto, guiones brillantes y directores rompedores."
  },
  a24: {
    code: "a24",
    name: "A24",
    title: "Pel\xEDculas y Series de A24",
    description: "El referente moderno del cine independiente: propuestas audaces, terror psicol\xF3gico de autor y visiones cinematogr\xE1ficas \xFAnicas."
  },
  movistar: {
    code: "movistar",
    name: "Movistar Plus+",
    title: "Series y Pel\xEDculas de Movistar Plus+",
    description: "Producci\xF3n original espa\xF1ola de m\xE1ximo nivel: series aclamadas y coproducciones de cine de autor de Movistar Plus+."
  },
  apple: {
    code: "apple",
    name: "Apple Original Films",
    title: "Pel\xEDculas y Series de Apple Original Films",
    description: "Grandes directores, producciones cuidadas al mil\xEDmetro y ganadoras del \xD3scar de Apple Original Films."
  }
};
var SELECTION_MAP = {
  "1001movies": {
    code: "1001movies",
    name: "1001 Pel\xEDculas que ver antes de morir",
    title: "1001 Pel\xEDculas que hay que ver antes de morir",
    description: "La gu\xEDa can\xF3nica definitiva de la historia del cine seleccionada por Steven Jay Schneider y cr\xEDticos internacionales."
  },
  tspdt: {
    code: "tspdt",
    name: "TSPDT (They Shoot Pictures, Don't They?)",
    title: "They Shoot Pictures, Don't They? \u2014 Las 1000 Mejores Pel\xEDculas",
    description: "El mayor consenso cr\xEDtico de la historia del cine compilando listas de directores y cr\xEDticos de todo el mundo."
  },
  criterion: {
    code: "criterion",
    name: "The Criterion Collection",
    title: "The Criterion Collection \u2014 Obras Maestras del Cine",
    description: "La biblioteca de referencia para amantes del cine: ediciones restauradas y pel\xEDculas de autor esenciales."
  },
  kinolorber: {
    code: "kinolorber",
    name: "Kino Lorber",
    title: "Archivo Cinematogr\xE1fico Kino Lorber",
    description: "Pioneros del cine mudo, cine europeo cl\xE1sico y obras de culto restauradas en alta definici\xF3n."
  },
  toptv: {
    code: "toptv",
    name: "Top TV Series",
    title: "Las Mejores Series de Televisi\xF3n seg\xFAn los Rankings",
    description: "Las series de televisi\xF3n m\xE1s aclamadas y mejor valoradas de la historia de la peque\xF1a pantalla."
  },
  hbo: {
    code: "hbo",
    name: "Series HBO",
    title: "Series Legendarias de HBO",
    description: "La \xE9poca dorada de la televisi\xF3n: producciones que cambiaron para siempre el medio televisivo internacional."
  },
  acontra: {
    code: "acontra",
    name: "A Contracorriente Films",
    title: "Colecci\xF3n A Contracorriente Films",
    description: "Cine independiente europeo, comedias de autor y t\xEDtulos de calidad excepcional distribuidos en Espa\xF1a."
  },
  arrow: {
    code: "arrow",
    name: "Arrow Video",
    title: "Colecci\xF3n de Culto Arrow Video",
    description: "El templo del cine de culto: giallo, serie B, terror cl\xE1sico y joyas underground restauradas."
  },
  eureka: {
    code: "eureka",
    name: "Eureka Masters of Cinema",
    title: "Masters of Cinema (Eureka)",
    description: "Joyas universales del cine mudo, expresionismo alem\xE1n y cl\xE1sicos asi\xE1ticos restaurados meticulosamente."
  },
  imprint: {
    code: "imprint",
    name: "Imprint Films",
    title: "Colecci\xF3n Exclusiva Imprint Films",
    description: "Cine de culto australiano e internacional de las d\xE9cadas doradas en ediciones limitadas para coleccionistas."
  }
};
var REGIONAL_GROUPS_MAP = {
  latam: {
    code: "latam",
    name: "Latinoam\xE9rica",
    title: "Cine Latinoamericano",
    description: "Las mejores obras cinematogr\xE1ficas de Argentina, M\xE9xico, Brasil, Chile, Colombia y toda Am\xE9rica Latina en streaming."
  },
  nordic: {
    code: "nordic",
    name: "Pa\xEDses N\xF3rdicos",
    title: "Cine N\xF3rdico y Escandinavo",
    description: "Grandes t\xEDtulos de Suecia, Dinamarca, Noruega, Finlandia e Islandia: thriller n\xF3rdico, cine de autor y dramas psicol\xF3gicos."
  }
};
var ACTIVE_COUNTRIES_MAP = {
  afganistan: { name: "Afganist\xE1n", code: "AF" },
  alemania: { name: "Alemania", code: "DE" },
  "arabia-saudi": { name: "Arabia Saud\xED", code: "SA" },
  argelia: { name: "Argelia", code: "DZ" },
  argentina: { name: "Argentina", code: "AR" },
  australia: { name: "Australia", code: "AU" },
  austria: { name: "Austria", code: "AT" },
  belgica: { name: "B\xE9lgica", code: "BE" },
  bosnia: { name: "Bosnia", code: "BA" },
  botswana: { name: "Botswana", code: "BW" },
  brasil: { name: "Brasil", code: "BR" },
  camboya: { name: "Camboya", code: "KH" },
  canada: { name: "Canad\xE1", code: "CA" },
  chequia: { name: "Chequia", code: "CZ" },
  chile: { name: "Chile", code: "CL" },
  china: { name: "China", code: "CN" },
  colombia: { name: "Colombia", code: "CO" },
  "corea-del-sur": { name: "Corea del Sur", code: "KR" },
  croacia: { name: "Croacia", code: "HR" },
  cuba: { name: "Cuba", code: "CU" },
  dinamarca: { name: "Dinamarca", code: "DK" },
  ecuador: { name: "Ecuador", code: "EC" },
  eeuu: { name: "EEUU", code: "US" },
  egipto: { name: "Egipto", code: "EG" },
  eslovaquia: { name: "Eslovaquia", code: "SK" },
  espana: { name: "Espa\xF1a", code: "ES" },
  estonia: { name: "Estonia", code: "EE" },
  filipinas: { name: "Filipinas", code: "PH" },
  finlandia: { name: "Finlandia", code: "FI" },
  francia: { name: "Francia", code: "FR" },
  georgia: { name: "Georgia", code: "GE" },
  grecia: { name: "Grecia", code: "GR" },
  guatemala: { name: "Guatemala", code: "GT" },
  holanda: { name: "Holanda", code: "NL" },
  "hong-kong": { name: "Hong Kong", code: "HK" },
  hungria: { name: "Hungr\xEDa", code: "HU" },
  india: { name: "India", code: "IN" },
  indonesia: { name: "Indonesia", code: "ID" },
  irak: { name: "Irak", code: "IQ" },
  iran: { name: "Ir\xE1n", code: "IR" },
  irlanda: { name: "Irlanda", code: "IE" },
  islandia: { name: "Islandia", code: "IS" },
  israel: { name: "Israel", code: "IL" },
  italia: { name: "Italia", code: "IT" },
  jamaica: { name: "Jamaica", code: "JM" },
  japon: { name: "Jap\xF3n", code: "JP" },
  kazajistan: { name: "Kazajist\xE1n", code: "KZ" },
  lesotho: { name: "Lesotho", code: "LS" },
  letonia: { name: "Letonia", code: "LV" },
  libano: { name: "L\xEDbano", code: "LB" },
  macedonia: { name: "Macedonia", code: "MK" },
  marruecos: { name: "Marruecos", code: "MA" },
  mexico: { name: "M\xE9xico", code: "MX" },
  noruega: { name: "Noruega", code: "NO" },
  "nueva-zelanda": { name: "Nueva Zelanda", code: "NZ" },
  palestina: { name: "Palestina", code: "PS" },
  panama: { name: "Panam\xE1", code: "PA" },
  paquistan: { name: "Paquist\xE1n", code: "PK" },
  paraguay: { name: "Paraguay", code: "PY" },
  peru: { name: "Per\xFA", code: "PE" },
  polonia: { name: "Polonia", code: "PL" },
  portugal: { name: "Portugal", code: "PT" },
  rumania: { name: "Ruman\xEDa", code: "RO" },
  rusia: { name: "Rusia", code: "RU" },
  senegal: { name: "Senegal", code: "SN" },
  serbia: { name: "Serbia", code: "RS" },
  singapur: { name: "Singapur", code: "SG" },
  sudafrica: { name: "Sud\xE1frica", code: "ZA" },
  suecia: { name: "Suecia", code: "SE" },
  suiza: { name: "Suiza", code: "CH" },
  tailandia: { name: "Tailandia", code: "TH" },
  taiwan: { name: "Taiw\xE1n", code: "TW" },
  turquia: { name: "Turqu\xEDa", code: "TR" },
  ucrania: { name: "Ucrania", code: "UA" },
  uk: { name: "UK", code: "GB" },
  uruguay: { name: "Uruguay", code: "UY" },
  venezuela: { name: "Venezuela", code: "VE" },
  vietnam: { name: "Vietnam", code: "VN" }
};
function resolveTaxonomy(rawSlug, expectedPrefix = null) {
  if (!rawSlug) return null;
  const slug = String(rawSlug).trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  const prefix = expectedPrefix ? String(expectedPrefix).trim().toLowerCase() : null;
  if ((!prefix || prefix === "genero") && GENRE_MAP[slug]) {
    const item = GENRE_MAP[slug];
    return {
      type: "genre",
      prefix: "genero",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} \u2014 Videoclub Digital`,
      description: item.description,
      badgeLabel: "G\xE9nero",
      canonicalSlug: slug,
      canonicalPath: `/genero/${slug}/`,
      categoryBreadcrumb: "G\xE9neros",
      rpcParams: {
        genre_name: item.name,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }
  if ((!prefix || prefix === "estudio") && STUDIO_MAP[slug]) {
    const item = STUDIO_MAP[slug];
    return {
      type: "studio",
      prefix: "estudio",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} \u2014 Videoclub Digital`,
      description: item.description,
      badgeLabel: "Estudio",
      canonicalSlug: slug,
      canonicalPath: `/estudio/${slug}/`,
      categoryBreadcrumb: "Estudios",
      rpcParams: {
        p_studio_code: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }
  if ((!prefix || prefix === "seleccion") && SELECTION_MAP[slug]) {
    const item = SELECTION_MAP[slug];
    return {
      type: "selection",
      prefix: "seleccion",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} \u2014 Videoclub Digital`,
      description: item.description,
      badgeLabel: "Colecci\xF3n",
      canonicalSlug: slug,
      canonicalPath: `/seleccion/${slug}/`,
      categoryBreadcrumb: "Selecciones",
      rpcParams: {
        p_selection_code: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }
  if ((!prefix || prefix === "pais") && REGIONAL_GROUPS_MAP[slug]) {
    const item = REGIONAL_GROUPS_MAP[slug];
    return {
      type: "country",
      prefix: "pais",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} \u2014 Videoclub Digital`,
      description: item.description,
      badgeLabel: "Regi\xF3n",
      canonicalSlug: slug,
      canonicalPath: `/pais/${slug}/`,
      categoryBreadcrumb: "Pa\xEDses",
      rpcParams: {
        country_name: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }
  if ((!prefix || prefix === "pais") && ACTIVE_COUNTRIES_MAP[slug]) {
    const item = ACTIVE_COUNTRIES_MAP[slug];
    const countryTitle = `Cine de ${item.name}`;
    const countryDesc = `Descubre las mejores pel\xEDculas y series de ${item.name} disponibles en streaming en Espa\xF1a, ordenadas por valoraci\xF3n y votos.`;
    return {
      type: "country",
      prefix: "pais",
      name: item.name,
      code: item.code,
      title: countryTitle,
      seoTitle: `${countryTitle} \u2014 Videoclub Digital`,
      description: countryDesc,
      badgeLabel: "Pa\xEDs",
      canonicalSlug: slug,
      canonicalPath: `/pais/${slug}/`,
      categoryBreadcrumb: "Pa\xEDses",
      rpcParams: {
        country_name: item.name,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }
  return null;
}

// cloudflare/seo/render-taxonomy.js
var SQRT_MAX_VOTES2 = {
  FA: Math.sqrt(22e4),
  IMDB: Math.sqrt(32e5)
};
function safeJsonLd2(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function renderSpaMovieCard(movie, index, siteOrigin, baseUrl = "/") {
  const isSeries = isSeriesType(movie.type);
  const title = movie.title || movie.original_title || "Sin t\xEDtulo";
  const displayOriginalTitle = movie.original_title?.trim() || title;
  const slug = movie.slug || "";
  const movieUrl = `${siteOrigin}/titulo/${slug}/`;
  const posterUrl = `${siteOrigin}/posters/${slug}.webp`;
  const isSuspenso = typeof movie.avg_rating === "number" && movie.avg_rating > 0 && movie.avg_rating <= 5.5;
  const avgStars = calculateAverageStars(movie.avg_rating);
  const clip1 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 0))) * 100;
  const clip2 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 1))) * 100;
  const clip3 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 2))) * 100;
  const faBarWidth = movie.fa_votes ? Math.min(100, Math.sqrt(movie.fa_votes) / SQRT_MAX_VOTES2.FA * 100) : 0;
  const imdbBarWidth = movie.imdb_votes ? Math.min(100, Math.sqrt(movie.imdb_votes) / SQRT_MAX_VOTES2.IMDB * 100) : 0;
  const formattedFaVotes = formatVotesUnified(movie.fa_votes);
  const formattedImdbVotes = formatVotesUnified(movie.imdb_votes);
  const rawGenres = parseList(movie.genres || movie.genres_list);
  const directors = parseList(movie.directors || movie.directors_list);
  const actors = parseList(movie.actors || movie.actors_list);
  const studios = parseList(movie.studios_list);
  const countryCode = movie.country_code || movie.countries?.code || null;
  const countryName = movie.country || movie.countries?.name || "";
  const countrySlug = countryCode ? toSlug(countryName) : null;
  const durationText = formatRuntime(movie.minutes, isSeries);
  const episodesText = isSeries && movie.episodes ? `${movie.episodes} x` : null;
  const titleLengthClass = getTitleLengthClass(title);
  const origTitleLengthClass = getTitleLengthClass(displayOriginalTitle);
  const directorsHtml = directors.map((name, i) => `
    <a href="${baseUrl}?_p=/director/${toSlug(name)}/">${escapeHtml(preserveHyphenatedWords(name))}</a>${i < directors.length - 1 ? ", " : ""}
  `).join("");
  const validStudios = studios.filter((code) => STUDIO_DATA[code]);
  const studiosHtml = validStudios.map((code) => {
    const conf = STUDIO_DATA[code];
    return `
      <span class="platform-icon ${conf.class}" title="${escapeAttr(conf.title)}">
        <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="0 0 24 24">
          <use href="${baseUrl}sprite.svg#${conf.id}"></use>
        </svg>
      </span>
    `;
  }).join("");
  const shortActorsText = actors.length > 0 ? actors.slice(0, 4).join(", ") + (actors.length > 4 ? "..." : "") : "Reparto no disponible";
  return `
    <article class="movie-card" data-movie-id="${movie.id}" style="--card-index: ${index};">
      <div class="flip-card-inner">
        <!-- Cara frontal -->
        <div class="flip-card-front">
          <div class="poster-container">
            <img
              src="${escapeAttr(posterUrl)}"
              alt="P\xF3ster de ${escapeAttr(title)}"
              width="400"
              height="496"
              loading="${index < 6 ? "eager" : "lazy"}"
              ${index === 0 ? 'fetchpriority="high"' : ""}
              class="loaded"
              onerror="this.style.opacity='0.2'"
            />
            <div class="poster-overlay-guard"></div>
            <div class="card-rating-block">
              <a href="${baseUrl}?movie=${movie.id}" class="star-rating-container has-average-rating is-interactive" aria-label="Ver valoraci\xF3n y ficha de ${escapeAttr(title)}" style="text-decoration: none; color: inherit; cursor: pointer;">
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
              <span class="wall-rating-number" data-template="wall-rating">${movie.avg_rating ? movie.avg_rating.toFixed(1) : ""}</span>
              <a href="${baseUrl}?movie=${movie.id}" class="card-action-btn" aria-label="A\xF1adir a mi lista en el videoclub" title="A\xF1adir a mi lista">
                <svg class="icon-watchlist"><use href="${baseUrl}sprite.svg#icon-bookmark-plus"></use></svg>
              </a>
            </div>
          </div>

          <div class="movie-info movie-summary">
            <div class="title-director-block">
              <h3 data-template="title" class="${titleLengthClass}">
                <a href="${escapeAttr(movieUrl)}" class="movie-card-title-link" style="color:inherit; text-decoration:none;">${escapeHtml(title)}</a>
              </h3>
              <div class="front-director-info" data-template="director">
                ${directorsHtml}
              </div>
            </div>
            <div class="movie-meta">
              ${studiosHtml ? `<div class="card-icons-line ${validStudios.length >= 3 ? "compact" : ""}">${studiosHtml}</div>` : ""}
              <div class="year-country-line">
                <div class="year-flag-group">
                  <span data-template="year">
                    ${movie.year ? `<a href="${baseUrl}?_p=/&_q=year%3D${movie.year}" class="year-link" data-year-value="${movie.year}">${movie.year}</a>${escapeHtml(formatYear(movie.year, movie.year_end, isSeries, "", movie.type).substring(String(movie.year).length))}` : ""}
                  </span>
                  ${countryCode ? `
                    <a class="country-info" href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : "#"}" title="${escapeAttr(countryName)}" aria-label="Ver t\xEDtulos de ${escapeAttr(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use>
                        </svg>
                      </span>
                    </a>
                  ` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cara trasera -->
        <div class="flip-card-back">
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

          <div class="ratings-container">
            ${movie.fa_rating ? `
              <div class="rating-line">
                <a target="_blank" rel="noopener noreferrer" class="rating-left" href="${escapeAttr(movie.fa_id || "#")}" data-template="fa-link">
                  <svg class="rating-icon"><use href="${baseUrl}sprite.svg#icon-filmaffinity"></use></svg>
                  <span data-template="fa-rating">${movie.fa_rating.toFixed(1)}</span>
                </a>
                <span class="rating-votes-count">${escapeHtml(formattedFaVotes)}</span>
                <div class="rating-bar-container" data-votes="${escapeAttr(formattedFaVotes)}">
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
                <div class="rating-bar-container" data-votes="${escapeAttr(formattedImdbVotes)}">
                  <div class="rating-bar" style="width: ${imdbBarWidth}%;"></div>
                </div>
              </div>
            ` : ""}
          </div>

          <div class="back-original-title-wrapper">
            <span data-template="original-title" class="${origTitleLengthClass}">${escapeHtml(displayOriginalTitle)}</span>
          </div>

          <div class="details-list">
            ${rawGenres.length > 0 ? `
              <div class="detail-item" data-template="genre-container">
                <span class="detail-label"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-clapperboard"></use></svg></span>
                <strong class="detail-label-title">G\xE9nero.</strong>
                <span class="detail-data" data-template="genre">${rawGenres.map((g, i) => {
    const s = genreToSlug(g);
    return s ? `<a href="${baseUrl}?_p=/${s}/">${escapeHtml(preserveHyphenatedWords(g))}</a>${i < rawGenres.length - 1 ? ", " : ""}` : `<span>${escapeHtml(preserveHyphenatedWords(g))}</span>${i < rawGenres.length - 1 ? ", " : ""}`;
  }).join("")}</span>
              </div>
            ` : ""}
            ${actors.length > 0 ? `
              <div class="detail-item" data-template="actors-container">
                <span class="detail-label"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-cast"></use></svg></span>
                <strong class="detail-label-title">Reparto.</strong>
                <span class="detail-data" data-template="actors">${escapeHtml(preserveHyphenatedWords(shortActorsText))}</span>
                <button type="button" class="actors-expand-btn" aria-label="Ver detalles de g\xE9neros y reparto">+</button>
              </div>
            ` : ""}
          </div>

          <div class="scrollable-content">
            <div class="plot-summary-final" title="Sinopsis">
              <span class="detail-label"><svg class="detail-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><use href="${baseUrl}sprite.svg#icon-synopsis"></use></svg></span>
              <strong class="detail-label-title">Sinopsis.</strong>
              <span data-template="synopsis">${escapeHtml(preserveHyphenatedWords(movie.synopsis || "Sinopsis no disponible."))}</span>
            </div>
          </div>

          <!-- Overlay deslizante completo de reparto y g\xE9neros detallados (se activa al pulsar + en reparto) -->
          <div class="actors-scrollable-content">
            ${rawGenres.length > 0 ? `
              <h4>G\xE9neros</h4>
              <div class="actors-list-text genres-list-text">
                ${rawGenres.map((g) => {
    const s = genreToSlug(g) || toSlug(g);
    return `<a class="actor-list-item genre-list-item" href="${baseUrl}?_p=/${s}/">${escapeHtml(preserveHyphenatedWords(g))}</a>`;
  }).join("")}
              </div>
            ` : ""}
            ${actors.length > 0 ? `
              <h4>Reparto</h4>
              <div class="actors-list-text">
                ${actors.map((a) => `<a class="actor-list-item" href="${baseUrl}?_p=/actor/${toSlug(a)}/">${escapeHtml(preserveHyphenatedWords(a))}</a>`).join("")}
              </div>
            ` : ""}
          </div>

          <button type="button" class="expand-content-btn" aria-label="Expandir sinopsis">+</button>
          <a href="${escapeAttr(movieUrl)}" class="card-ficha-btn" aria-label="Ver ficha completa de ${escapeAttr(title)}">
            <span>Ficha completa \u2192</span>
          </a>
        </div>
      </div>
    </article>
  `;
}
function renderTaxonomyHtml(taxInfo, items, options = {}) {
  const siteOrigin = options.siteOrigin || "https://videoclub.digital";
  const baseUrl = options.baseUrl || "/";
  const storageUrl = options.storageUrl || "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";
  const canonicalUrl = taxInfo.canonicalPath ? `${siteOrigin}${taxInfo.canonicalPath}` : `${siteOrigin}/${taxInfo.canonicalSlug}/`;
  const spaRedirectUrl = `${baseUrl}?_p=/${taxInfo.canonicalSlug}/`;
  const topMovie = items && items.length > 0 ? items[0] : null;
  const ogImageUrl = topMovie && topMovie.slug ? `${siteOrigin}/posters/${topMovie.slug}.webp` : `${storageUrl}/assets/og-default.jpg`;
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
          "@type": m.type && String(m.type).toLowerCase().startsWith("s") ? "TVSeries" : "Movie",
          "name": m.title || m.original_title,
          "url": `${siteOrigin}/titulo/${m.slug}/`,
          "image": `${siteOrigin}/posters/${m.slug}.webp`,
          ...m.year ? { "datePublished": String(m.year) } : {},
          ...m.fa_rating ? {
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": String(m.fa_rating),
              "bestRating": "10",
              "worstRating": "1",
              "ratingCount": m.fa_votes || 1
            }
          } : {}
        }
      }))
    }
  };
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
  const topSlugsUrls = items.slice(0, 5).map((m) => `${siteOrigin}/titulo/${m.slug}/`);
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
  <!-- Anti-flicker para sincronizaci\xF3n de modo claro/oscuro con el grid -->
  <script>
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored === "dark" || (!stored && systemDark) || (!stored && stored === null);
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else if (stored === "light") {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  <\/script>
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

  <!-- Tipograf\xEDa Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Structured Data: CollectionPage & Breadcrumbs -->
  <script type="application/ld+json">${safeJsonLd2(collectionSchema)}<\/script>
  <script type="application/ld+json">${safeJsonLd2(breadcrumbSchema)}<\/script>
  <script type="speculationrules">${safeJsonLd2(speculationRules)}<\/script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens y contrato completo de tarjeta) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v6.css" />
  <link rel="icon" type="image/svg+xml" href="${baseUrl}favicon.svg" />
</head>
<body class="collection-wall">
  <div class="main-layout">
    <div class="main-content-wrapper">
      <!-- Cabecera Minimalista Estilo SPA -->
      <header class="main-header">
        <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto;">
          <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
            <span class="logo-line-1">VIDEOCLUB</span>
            <span class="logo-line-2">.DIGITAL</span>
          </a>
          
          <!-- Nombre de la secci\xF3n alineado a la derecha (las selecciones son fijas no clickables, g\xE9neros/pa\xEDses/estudios enlazan a la SPA) -->
          <div class="active-filters-list" style="display:flex; align-items:center; margin:0; padding:0;">
            ${taxInfo.type === "selection" ? `
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

      <!-- Muro Principal de Pel\xEDculas (42 fichas oficiales) -->
      <main class="content">
        <h1 class="sr-only">${escapeHtml(taxInfo.title)}</h1>
        <section id="grid-container" class="grid-container" aria-label="Pel\xEDculas de ${escapeAttr(taxInfo.name)}">
          ${items.map((m, index) => renderSpaMovieCard(m, index, siteOrigin, baseUrl)).join("")}
        </section>
      </main>

      <!-- Pie de p\xE1gina oficial con avisos legales de la SPA -->
      <footer class="site-footer">
        <ul class="footer-links">
          <li class="footer-brand">videoclub.digital</li>
          <li><a href="${baseUrl}?legal=about" class="footer-legal-link">Qui\xE9nes somos</a></li>
          <li><a href="${baseUrl}?legal=contact" class="footer-legal-link">Contacto</a></li>
          <li><a href="${baseUrl}?legal=legal" class="footer-legal-link">Aviso legal</a></li>
          <li><a href="${baseUrl}?legal=privacy" class="footer-legal-link">Privacidad</a></li>
          <li><a href="${baseUrl}?legal=cookies" class="footer-legal-link">Cookies</a></li>
          <li class="footer-copy">2025-2026 \xA9 Copyright.</li>
        </ul>
      </footer>
    </div>
  </div>

  <!-- Handler de giro 3D y expansi\xF3n de reparto en Vanilla JS -->
  <script>
    (function () {
      var activeCard = null;

      // Preservar orden del cat\xE1logo seleccionado en la SPA (localStorage preferred_sort)
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
        // 1. Bot\xF3n + de actores: despliega la lista completa de actores y g\xE9neros en overlay
        var actorsExpandBtn = e.target.closest(".actors-expand-btn");
        if (actorsExpandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = actorsExpandBtn.closest(".flip-card-back");
          if (back) {
            back.classList.add("is-expanded", "show-actors");
            var bottomBtn = back.querySelector(".expand-content-btn");
            if (bottomBtn) {
              bottomBtn.textContent = "\u2212";
              bottomBtn.setAttribute("aria-label", "Cerrar detalles");
            }
          }
          return;
        }

        // 2. Bot\xF3n inferior de expansi\xF3n / contracci\xF3n
        var expandBtn = e.target.closest(".expand-content-btn");
        if (expandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = expandBtn.closest(".flip-card-back");
          if (back) {
            if (back.classList.contains("show-actors")) {
              back.classList.remove("is-expanded", "show-actors");
              expandBtn.textContent = "+";
              expandBtn.setAttribute("aria-label", "Expandir sinopsis");
            } else {
              var isExp = back.classList.toggle("is-expanded");
              expandBtn.textContent = isExp ? "\u2212" : "+";
              expandBtn.setAttribute("aria-label", isExp ? "Contraer sinopsis" : "Expandir sinopsis");
            }
          }
          return;
        }

        // 3. Volteo 3D de la tarjeta
        var card = e.target.closest(".movie-card");
        if (card) {
          if (e.target.closest("a, button, [role='button'], .actors-scrollable-content")) return;
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
    })();
  <\/script>
</body>
</html>`;
}

// cloudflare/seo/render-person.js
function safeJsonLd3(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function computePersonAgeInfo(birthday, deathday) {
  if (!birthday) {
    return { bYear: "", dYear: "", datesStr: "", ageStr: "" };
  }
  const birthDate = new Date(birthday);
  if (isNaN(birthDate.getTime())) {
    return { bYear: "", dYear: "", datesStr: "", ageStr: "" };
  }
  const bYear = String(birthDate.getUTCFullYear());
  let dYear = "";
  let age = 0;
  let isDeceased = false;
  if (deathday) {
    const deathDate = new Date(deathday);
    if (!isNaN(deathDate.getTime())) {
      dYear = String(deathDate.getUTCFullYear());
      isDeceased = true;
      let diff = deathDate.getUTCFullYear() - birthDate.getUTCFullYear();
      const m = deathDate.getUTCMonth() - birthDate.getUTCMonth();
      if (m < 0 || m === 0 && deathDate.getUTCDate() < birthDate.getUTCDate()) {
        diff--;
      }
      age = diff;
    }
  }
  if (!isDeceased) {
    const now = /* @__PURE__ */ new Date();
    let diff = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = now.getUTCMonth() - birthDate.getUTCMonth();
    if (m < 0 || m === 0 && now.getUTCDate() < birthDate.getUTCDate()) {
      diff--;
    }
    age = diff;
  }
  const datesStr = isDeceased ? `${bYear}-${dYear}` : `${bYear}-`;
  const ageStr = isDeceased ? `(${age} \u271D)` : `(${age})`;
  return { bYear, dYear, datesStr, ageStr };
}
function renderSpaPersonCard(person, role, hasOtherRole, siteOrigin, baseUrl = "/") {
  const slug = person.slug || toSlug(person.name);
  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;
  const defaultFallbackUrl = `${baseUrl}collection_default.webp`;
  const ageInfo = computePersonAgeInfo(person.birthday, person.deathday);
  const countryCode = person.countries?.code || null;
  const countryName = person.countries?.name || "";
  const countrySlug = countryCode ? toSlug(countryName) : null;
  const isDirector = role === "director";
  const targetRole = isDirector ? "actor" : "director";
  const currentLetter = isDirector ? "D" : "A";
  const tooltipText = isDirector ? `Ver filmograf\xEDa de ${person.name} como Actor` : `Ver pel\xEDculas de ${person.name} como Director`;
  const targetUrl = `${siteOrigin}/${slug}/`;
  const titleLengthClass = getTitleLengthClass(person.name);
  return `
    <article class="movie-card person-card" data-person-id="${person.id}" style="--card-index: 0;">
      <div class="flip-card-inner">
        <!-- Cara frontal -->
        <div class="flip-card-front">
          <div class="poster-container">
            <img
              src="${escapeAttr(photoUrl)}"
              alt="Foto de ${escapeAttr(person.name)}"
              width="400"
              height="496"
              loading="eager"
              fetchpriority="high"
              class="loaded"
              onerror="this.src='${escapeAttr(defaultFallbackUrl)}'"
            />
            <div class="poster-overlay-guard"></div>

            ${hasOtherRole ? `
              <a
                href="${escapeAttr(targetUrl)}"
                class="person-role-toggle-btn"
                title="${escapeAttr(tooltipText)}"
                aria-label="${escapeAttr(tooltipText)}"
                style="display: flex; text-decoration: none;"
              >
                <span class="role-badge-letter">${currentLetter}</span>
              </a>
            ` : ""}

            <div class="card-rating-block">
              <span class="wall-person-name">${escapeHtml(person.name)}</span>
            </div>
          </div>

          <div class="movie-info movie-summary">
            <div class="title-director-block">
              <h3 class="${titleLengthClass}">${escapeHtml(person.name)}</h3>
              <div class="front-director-info">
                ${person.place_of_birth ? `<span>${escapeHtml(person.place_of_birth)}</span>` : ""}
              </div>
            </div>
            <div class="movie-meta">
              <div class="year-country-line">
                <div class="year-flag-group">
                  ${ageInfo.ageStr ? `<span class="person-age">${escapeHtml(ageInfo.ageStr)}</span>` : ""}
                  ${ageInfo.datesStr ? `<span class="person-dates">${escapeHtml(ageInfo.datesStr)}</span>` : ""}
                  ${countryCode ? `
                    <a class="country-info" href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : "#"}" title="${escapeAttr(countryName)}" aria-label="Ver t\xEDtulos de ${escapeAttr(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use>
                        </svg>
                      </span>
                    </a>
                  ` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cara trasera -->
        <div class="flip-card-back">
          <div class="scrollable-content" style="flex-grow: 1; margin-top: var(--space-xs, 6px); margin-bottom: 24px;">
            ${person.titulo_bio ? `<h4 class="bio-headline">${escapeHtml(person.titulo_bio)}</h4>` : ""}
            <div
              class="plot-summary-final"
              style="border-top: none; padding-top: 0; font-size: calc(var(--font-size-sm, 0.85rem) * 1.15); line-height: 1.5;"
            >
              ${escapeHtml(preserveHyphenatedWords(person.biography || "Biograf\xEDa no disponible en el cat\xE1logo."))}
            </div>
          </div>
          <button type="button" class="expand-content-btn" aria-label="Expandir biograf\xEDa">+</button>
        </div>
      </div>
    </article>
  `;
}
function renderPersonHtml(person, role, hasOtherRole, movies = [], options = {}) {
  const siteOrigin = options.siteOrigin || "https://videoclub.digital";
  const baseUrl = options.baseUrl || "/";
  const storageUrl = options.storageUrl || "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";
  const slug = person.slug || toSlug(person.name);
  const canonicalUrl = `${siteOrigin}/${slug}/`;
  const isDirector = role === "director" || person.type === "D" || person.type === "DA";
  const spaRedirectUrl = `${baseUrl}?_p=/${isDirector ? "director" : "actor"}/${slug}/`;
  const roleLabel = person.type === "D" ? "Director" : person.type === "A" ? "Actor" : "Cineasta";
  const roleTitle = isDirector ? "Director de cine" : "Actor cinematogr\xE1fico";
  const seoTitle = `${person.name} \u2014 Pel\xEDculas y Biograf\xEDa | Videoclub Digital`;
  const bioExcerpt = person.titulo_bio ? `${person.name}: ${person.titulo_bio}. Filmograf\xEDa completa y biograf\xEDa en Videoclub Digital.` : `Filmograf\xEDa completa, biograf\xEDa y t\xEDtulos destacados de ${person.name} en Videoclub Digital.`;
  const description = bioExcerpt.length > 160 ? bioExcerpt.substring(0, 157) + "..." : bioExcerpt;
  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": person.name,
    "url": canonicalUrl,
    "mainEntityOfPage": canonicalUrl,
    ...photoUrl ? { "image": photoUrl } : {},
    ...person.titulo_bio || person.biography ? {
      "description": person.titulo_bio || person.biography?.substring(0, 300)
    } : {},
    ...roleTitle ? {
      "jobTitle": roleTitle,
      "hasOccupation": {
        "@type": "Occupation",
        "name": roleTitle
      }
    } : {},
    ...person.birthday ? { "birthDate": person.birthday } : {},
    ...person.deathday ? { "deathDate": person.deathday } : {},
    ...person.place_of_birth ? {
      "birthPlace": {
        "@type": "Place",
        "name": person.place_of_birth
      }
    } : {},
    ...person.countries?.name ? {
      "nationality": {
        "@type": "Country",
        "name": person.countries.name
      }
    } : {},
    ...movies.length > 0 ? {
      "knowsAbout": movies.slice(0, 6).map((m) => m.title || m.original_title)
    } : {}
  };
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": seoTitle,
    "description": description,
    "url": canonicalUrl,
    "inLanguage": "es",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": movies.length,
      "itemListElement": movies.map((m, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": m.type && String(m.type).toLowerCase().startsWith("s") ? "TVSeries" : "Movie",
          "name": m.title || m.original_title,
          "url": `${siteOrigin}/titulo/${m.slug}/`,
          "image": `${siteOrigin}/posters/${m.slug}.webp`,
          ...m.year ? { "datePublished": String(m.year) } : {},
          ...m.fa_rating ? {
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": String(m.fa_rating),
              "bestRating": "10",
              "worstRating": "1",
              "ratingCount": m.fa_votes || 1
            }
          } : {}
        }
      }))
    }
  };
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
        "name": person.name,
        "item": canonicalUrl
      }
    ]
  };
  const topSlugsUrls = movies.slice(0, 5).map((m) => `${siteOrigin}/titulo/${m.slug}/`);
  const speculationRules = {
    prerender: [{ source: "list", urls: ["/"] }],
    prefetch: [{ source: "list", urls: topSlugsUrls }]
  };
  const personCardHtml = renderSpaPersonCard(person, role, hasOtherRole, siteOrigin, baseUrl);
  const movieCardsHtml = movies.map((movie, index) => {
    return renderSpaMovieCard(movie, index + 1, siteOrigin, baseUrl);
  }).join("\n");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronizaci\xF3n de modo claro/oscuro con el grid -->
  <script>
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored === "dark" || (!stored && systemDark) || (!stored && stored === null);
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else if (stored === "light") {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  <\/script>
  <title>${escapeHtml(seoTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(seoTitle)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:image" content="${escapeAttr(photoUrl)}" />
  <meta property="og:site_name" content="Videoclub Digital" />
  <meta property="og:locale" content="es_ES" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(seoTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(photoUrl)}" />

  <!-- Tipograf\xEDa Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Structured Data: Person, CollectionPage & Breadcrumbs -->
  <script type="application/ld+json">${safeJsonLd3(personSchema)}<\/script>
  <script type="application/ld+json">${safeJsonLd3(collectionSchema)}<\/script>
  <script type="application/ld+json">${safeJsonLd3(breadcrumbSchema)}<\/script>
  <script type="speculationrules">${safeJsonLd3(speculationRules)}<\/script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens y contrato completo de tarjeta) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v6.css" />
  <link rel="icon" type="image/svg+xml" href="${baseUrl}favicon.svg" />
</head>
<body class="collection-wall">
  <div class="main-layout">
    <div class="main-content-wrapper">
      <!-- Cabecera Minimalista Estilo SPA -->
      <header class="main-header">
        <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto;">
          <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
            <span class="logo-line-1">VIDEOCLUB</span>
            <span class="logo-line-2">.DIGITAL</span>
          </a>
          
          <!-- Nombre de la persona alineado a la derecha enlazando a la SPA interactiva -->
          <div class="active-filters-list" style="display:flex; align-items:center; gap: 8px; margin:0; padding:0;">
            <a href="${escapeAttr(spaRedirectUrl)}" class="filter-pill is-active" title="Abrir ${escapeAttr(person.name)} en el videoclub interactivo" style="text-decoration:none;">
              <span>${escapeHtml(person.name)}</span>
            </a>
          </div>
        </div>
      </header>

      <!-- Muro de Tarjetas Oficial (Ficha VIP #0 + Filmograf\xEDa #1..#42) -->
      <main class="content">
        <h1 class="sr-only">${escapeHtml(seoTitle)}</h1>
        <section id="grid-container" class="grid-container" aria-label="Ficha de ${escapeAttr(person.name)} y filmograf\xEDa destacada">
          ${personCardHtml}
          ${movieCardsHtml}
        </section>
      </main>

      <!-- Pie de p\xE1gina oficial con avisos legales de la SPA -->
      <footer class="site-footer">
        <ul class="footer-links">
          <li class="footer-brand">videoclub.digital</li>
          <li><a href="${baseUrl}?legal=about" class="footer-legal-link">Qui\xE9nes somos</a></li>
          <li><a href="${baseUrl}?legal=contact" class="footer-legal-link">Contacto</a></li>
          <li><a href="${baseUrl}?legal=legal" class="footer-legal-link">Aviso legal</a></li>
          <li><a href="${baseUrl}?legal=privacy" class="footer-legal-link">Privacidad</a></li>
          <li><a href="${baseUrl}?legal=cookies" class="footer-legal-link">Cookies</a></li>
          <li class="footer-copy">2025-2026 \xA9 Copyright.</li>
        </ul>
      </footer>
    </div>
  </div>

  <!-- Handler de giro 3D y expansi\xF3n de reparto/biograf\xEDa en Vanilla JS -->
  <script>
    (function () {
      var activeCard = null;

      // Preservar orden del cat\xE1logo seleccionado en la SPA (localStorage preferred_sort)
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
        // 1. Bot\xF3n + de actores: despliega la lista completa de actores y g\xE9neros en overlay
        var actorsExpandBtn = e.target.closest(".actors-expand-btn");
        if (actorsExpandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = actorsExpandBtn.closest(".flip-card-back");
          if (back) {
            back.classList.add("is-expanded", "show-actors");
            var bottomBtn = back.querySelector(".expand-content-btn");
            if (bottomBtn) {
              bottomBtn.textContent = "\u2212";
              bottomBtn.setAttribute("aria-label", "Cerrar detalles");
            }
          }
          return;
        }

        // 2. Bot\xF3n inferior de expansi\xF3n / contracci\xF3n (+ / \u2212) de sinopsis o biograf\xEDa
        var expandBtn = e.target.closest(".expand-content-btn");
        if (expandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = expandBtn.closest(".flip-card-back");
          if (back) {
            if (back.classList.contains("show-actors")) {
              back.classList.remove("is-expanded", "show-actors");
              expandBtn.textContent = "+";
              expandBtn.setAttribute("aria-label", "Expandir sinopsis");
            } else {
              var isExp = back.classList.toggle("is-expanded");
              expandBtn.textContent = isExp ? "\u2212" : "+";
              expandBtn.setAttribute("aria-label", isExp ? "Contraer detalles" : "Expandir detalles");
            }
          }
          return;
        }

        // 3. Volteo 3D de la tarjeta (solo pel\xEDculas; la ficha VIP de actor/director no voltea)
        var card = e.target.closest(".movie-card:not(.person-card)");
        if (card) {
          if (e.target.closest("a, button, [role='button'], .actors-scrollable-content")) return;
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
    })();
  <\/script>
</body>
</html>`;
}

// cloudflare/seo/vip-manifest.js
var VIP_SLUGS = /* @__PURE__ */ new Set([
  "aaron-sorkin",
  "abbas-kiarostami",
  "abel-ferrara",
  "adam-driver",
  "adam-mckay",
  "adam-sandler",
  "adam-shankman",
  "adam-wingard",
  "adolfo-aristarain",
  "adrian-lyne",
  "adrien-brody",
  "agnes-varda",
  "agustin-diaz-yanes",
  "agustin-gonzalez",
  "aitor-gabilondo",
  "aki-kaurismaki",
  "akira-kurosawa",
  "al-pacino",
  "alain-resnais",
  "alan-alda",
  "alan-arkin",
  "alan-j-pakula",
  "alan-parker",
  "alan-rickman",
  "alba-rohrwacher",
  "albert-hughes",
  "albert-serra",
  "alberto-caballero",
  "alberto-rodriguez",
  "alec-baldwin",
  "alejandro-amenabar",
  "alejandro-gonzalez-inarritu",
  "alejandro-jodorowsky",
  "aleksandr-sokurov",
  "alex-angulo",
  "alex-de-la-iglesia",
  "alex-garland",
  "alex-gibney",
  "alex-kurtzman",
  "alex-pina",
  "alex-proyas",
  "alexander-payne",
  "alexandre-aja",
  "alexandre-bustillo",
  "alfonso-cuaron",
  "alfred-hitchcock",
  "alfred-molina",
  "alice-braga",
  "allison-janney",
  "alvaro-fernandez-armero",
  "amy-adams",
  "amy-heckerling",
  "ana-torrent",
  "ana-wagener",
  "andre-dussollier",
  "andre-ovredal",
  "andre-techine",
  "andrei-tarkovsky",
  "andrew-davis",
  "andrew-haigh",
  "andrew-niccol",
  "andrew-stanton",
  "andrzej-wajda",
  "andrzej-zulawski",
  "andy-garcia",
  "andy-muschietti",
  "andy-serkis",
  "andy-tennant",
  "ang-lee",
  "angelina-jolie",
  "anjelica-huston",
  "anna-kendrick",
  "anne-bancroft",
  "anne-hathaway",
  "annette-bening",
  "anthony-hopkins",
  "anthony-lapaglia",
  "anthony-mackie",
  "anthony-mann",
  "antoine-fuqua",
  "anton-yelchin",
  "antonio-banderas",
  "antonio-de-la-torre",
  "antonio-dechent",
  "antonio-mercero",
  "antonio-resines",
  "apichatpong-weerasethakul",
  "ari-aster",
  "ariadna-gil",
  "ariel-schulman",
  "ariel-winograd",
  "armando-iannucci",
  "arnold-schwarzenegger",
  "arthur-hiller",
  "arthur-kennedy",
  "arthur-penn",
  "asghar-farhadi",
  "asia-argento",
  "atom-egoyan",
  "ava-gardner",
  "baltasar-kormakur",
  "barbara-stanwyck",
  "barbet-schroeder",
  "barry-jenkins",
  "barry-levinson",
  "barry-sonnenfeld",
  "baz-luhrmann",
  "bela-tarr",
  "ben-affleck",
  "ben-foster",
  "ben-kingsley",
  "ben-mendelsohn",
  "ben-safdie",
  "ben-stiller",
  "ben-wheatley",
  "benedict-cumberbatch",
  "benicio-del-toro",
  "bernardo-bertolucci",
  "bertrand-tavernier",
  "beth-grant",
  "bette-davis",
  "bigas-luna",
  "bill-camp",
  "bill-condon",
  "bill-lawrence",
  "bill-murray",
  "bill-nighy",
  "bill-nunn",
  "bill-paxton",
  "bill-pullman",
  "bille-august",
  "billy-bob-thornton",
  "billy-wilder",
  "blake-edwards",
  "bobby-cannavale",
  "bobby-farrelly",
  "bong-joon-ho",
  "borja-cobeaga",
  "brad-anderson",
  "brad-bird",
  "brad-dourif",
  "brad-pitt",
  "bradley-cooper",
  "brendan-gleeson",
  "brett-ratner",
  "brian-cox",
  "brian-de-palma",
  "brian-taylor",
  "bruce-beresford",
  "bruce-dern",
  "bruce-greenwood",
  "bruce-mcgill",
  "bruce-willis",
  "bryan-cranston",
  "bryan-fuller",
  "bryan-singer",
  "burgess-meredith",
  "burr-steers",
  "burt-lancaster",
  "burt-reynolds",
  "burt-young",
  "buster-keaton",
  "caleb-landry-jones",
  "cameron-crowe",
  "cameron-diaz",
  "candice-bergen",
  "carl-theodor-dreyer",
  "carla-gugino",
  "carlos-areces",
  "carlos-montero",
  "carlos-reygadas",
  "carlos-saldanha",
  "carlos-saura",
  "carlos-theron",
  "carmen-machi",
  "carol-reed",
  "carrie-fisher",
  "cary-grant",
  "cary-joji-fukunaga",
  "cate-blanchett",
  "catherine-deneuve",
  "catherine-keener",
  "cecil-b-demille",
  "cesc-gay",
  "channing-tatum",
  "charles-bronson",
  "charles-chaplin",
  "charles-dance",
  "charles-mcgraw",
  "charlize-theron",
  "charlotte-rampling",
  "charlton-heston",
  "chen-kaige",
  "chiwetel-ejiofor",
  "chow-yun-fat",
  "chris-columbus",
  "chris-cooper",
  "chris-evans",
  "chris-hemsworth",
  "chris-messina",
  "chris-pratt",
  "chris-renaud",
  "chris-weitz",
  "christian-bale",
  "christian-slater",
  "christina-hendricks",
  "christopher-lee",
  "christopher-lloyd",
  "christopher-mcquarrie",
  "christopher-miller",
  "christopher-nolan",
  "christopher-plummer",
  "christopher-walken",
  "chuck-lorre",
  "ciaran-hinds",
  "cillian-murphy",
  "claire-denis",
  "claude-chabrol",
  "claude-rains",
  "claudia-cardinale",
  "cliff-curtis",
  "clint-eastwood",
  "clyde-geronimi",
  "colin-farrell",
  "colin-firth",
  "colm-meaney",
  "costa-gavras",
  "craig-brewer",
  "craig-gillespie",
  "curtis-hanson",
  "d-j-caruso",
  "d-w-griffith",
  "damien-chazelle",
  "damon-herriman",
  "dan-aykroyd",
  "dani-de-la-orden",
  "daniel-calparsoro",
  "daniel-ecija",
  "daniel-monzon",
  "daniel-sanchez-arevalo",
  "danny-boyle",
  "danny-devito",
  "danny-glover",
  "danny-huston",
  "dario-argento",
  "darren-aronofsky",
  "dave-filoni",
  "david-ayer",
  "david-cronenberg",
  "david-e-kelley",
  "david-fincher",
  "david-frankel",
  "david-gordon-green",
  "david-koepp",
  "david-lean",
  "david-leitch",
  "david-lowery",
  "david-lynch",
  "david-mackenzie",
  "david-mamet",
  "david-michod",
  "david-miller",
  "david-morse",
  "david-o-russell",
  "david-simon",
  "david-strathairn",
  "david-thewlis",
  "david-trueba",
  "david-yates",
  "david-zucker",
  "dean-deblois",
  "deborah-kerr",
  "denis-villeneuve",
  "dennis-dugan",
  "dennis-haysbert",
  "dennis-hopper",
  "dennis-o-keefe",
  "dennis-quaid",
  "denys-arcand",
  "denzel-washington",
  "derek-cianfrance",
  "diane-lane",
  "dianne-wiest",
  "dino-risi",
  "djimon-hounsou",
  "dominic-west",
  "don-cheadle",
  "don-siegel",
  "donald-crisp",
  "donald-sutherland",
  "donnie-yen",
  "doug-liman",
  "douglas-sirk",
  "drake-doremus",
  "drew-barrymore",
  "dustin-hoffman",
  "dwayne-johnson",
  "dylan-baker",
  "ed-begley-jr",
  "ed-harris",
  "eddie-marsan",
  "edgar-wright",
  "eduard-fernandez",
  "edward-g-robinson",
  "edward-norton",
  "edward-yang",
  "edward-zwick",
  "eli-roth",
  "elia-kazan",
  "elias-koteas",
  "elijah-wood",
  "elisha-cook-jr",
  "elizabeth-banks",
  "elizabeth-mcgovern",
  "elizabeth-taylor",
  "elle-fanning",
  "emeric-pressburger",
  "emilio-martinez-lazaro",
  "emily-blunt",
  "emily-mortimer",
  "emily-watson",
  "emir-kusturica",
  "emma-stone",
  "emma-thompson",
  "enzo-barboni",
  "eric-rohmer",
  "ernesto-alterio",
  "ernst-lubitsch",
  "ethan-coen",
  "ethan-hawke",
  "ettore-scola",
  "eusebio-poncela",
  "evan-goldberg",
  "ewan-mcgregor",
  "f-gary-gray",
  "f-w-murnau",
  "faye-dunaway",
  "federico-fellini",
  "felicity-jones",
  "fernando-colomo",
  "fernando-gonzalez-molina",
  "fernando-leon-de-aranoa",
  "fernando-meirelles",
  "fernando-rey",
  "fernando-trueba",
  "ferzan-ozpetek",
  "forest-whitaker",
  "frances-mcdormand",
  "francesco-rosi",
  "francis-ford-coppola",
  "francis-lawrence",
  "francis-veber",
  "francisco-rabal",
  "franco-zeffirelli",
  "francois-ozon",
  "francois-truffaut",
  "frank-capra",
  "frank-coraci",
  "frank-darabont",
  "frank-marshall",
  "frank-oz",
  "fred-schepisi",
  "fred-zinnemann",
  "fredric-march",
  "fritz-lang",
  "gabriel-byrne",
  "gael-garcia-bernal",
  "gareth-evans",
  "garry-marshall",
  "gary-cooper",
  "gary-david-goldberg",
  "gary-fleder",
  "gary-oldman",
  "gaspar-noe",
  "gaston-duprat",
  "gavin-hood",
  "gavin-o-connor",
  "gema-r-neira",
  "gene-hackman",
  "genndy-tartakovsky",
  "george-a-romero",
  "george-c-scott",
  "george-clooney",
  "george-cukor",
  "george-lucas",
  "george-miller",
  "george-pan-cosmatos",
  "george-stevens",
  "geraldine-chaplin",
  "gerard-butler",
  "gerard-depardieu",
  "giancarlo-esposito",
  "gillo-pontecorvo",
  "giovanni-ribisi",
  "giuseppe-tornatore",
  "glenn-close",
  "gore-verbinski",
  "gracia-querejeta",
  "greg-berlanti",
  "greg-daniels",
  "greg-kinnear",
  "greg-mottola",
  "guillaume-canet",
  "guillermo-del-toro",
  "gus-van-sant",
  "guy-hamilton",
  "guy-pearce",
  "guy-ritchie",
  "hamilton-luske",
  "hank-azaria",
  "hanna-barbera",
  "hanna-schygulla",
  "hans-petter-moland",
  "harold-ramis",
  "harrison-ford",
  "harry-dean-stanton",
  "harvey-keitel",
  "hayao-miyazaki",
  "heather-graham",
  "helen-mirren",
  "helena-bonham-carter",
  "henry-fonda",
  "henry-hathaway",
  "herbert-ross",
  "hermanos-dardenne",
  "hermanos-duffer",
  "hermanos-pastor",
  "hermanos-russo",
  "hermanos-spierig",
  "hermanos-taviani",
  "hideaki-anno",
  "hirokazu-koreeda",
  "holt-mccallany",
  "hou-hsiao-hsien",
  "howard-hawks",
  "hugh-grant",
  "hugh-jackman",
  "hume-cronyn",
  "humphrey-bogart",
  "ian-holm",
  "ian-mcshane",
  "iciar-bollain",
  "idris-elba",
  "ingmar-bergman",
  "irwin-winkler",
  "isabel-coixet",
  "isabelle-huppert",
  "isao-takahata",
  "ishiro-honda",
  "ivan-reitman",
  "j-a-bayona",
  "j-c-chandor",
  "j-j-abrams",
  "j-k-simmons",
  "jack-black",
  "jack-elam",
  "jack-huston",
  "jack-nicholson",
  "jack-palance",
  "jack-thorne",
  "jackie-chan",
  "jacqueline-bisset",
  "jacques-audiard",
  "jacques-demy",
  "jacques-rivette",
  "jacques-tati",
  "jacques-tourneur",
  "jake-gyllenhaal",
  "jake-kasdan",
  "james-cameron",
  "james-cromwell",
  "james-foley",
  "james-franco",
  "james-gray",
  "james-gunn",
  "james-l-brooks",
  "james-mangold",
  "james-marsden",
  "james-mason",
  "james-purefoy",
  "james-remar",
  "james-stewart",
  "james-wan",
  "james-woods",
  "jamie-foxx",
  "jamie-lee-curtis",
  "jane-campion",
  "janet-mcteer",
  "jared-harris",
  "jason-bateman",
  "jason-clarke",
  "jason-flemyng",
  "jason-isaacs",
  "jason-momoa",
  "jason-reitman",
  "jason-statham",
  "jason-sudeikis",
  "jaume-balaguero",
  "jaume-collet-serra",
  "javier-bardem",
  "javier-botet",
  "javier-camara",
  "javier-fesser",
  "javier-gutierrez",
  "javier-ruiz-caldera",
  "jay-duplass",
  "jay-roach",
  "jean-becker",
  "jean-cocteau",
  "jean-jacques-annaud",
  "jean-louis-trintignant",
  "jean-luc-godard",
  "jean-marc-vallee",
  "jean-pierre-jeunet",
  "jean-pierre-melville",
  "jean-reno",
  "jean-renoir",
  "jeanne-moreau",
  "jeff-bridges",
  "jeff-daniels",
  "jeff-goldblum",
  "jeffrey-wright",
  "jennifer-connelly",
  "jennifer-ehle",
  "jennifer-jason-leigh",
  "jeremy-irons",
  "jeremy-northam",
  "jerry-zucker",
  "jesse-plemons",
  "jet-li",
  "jia-zhangke",
  "jim-abrahams",
  "jim-broadbent",
  "jim-carrey",
  "jim-carter",
  "jim-henson",
  "jim-jarmusch",
  "jim-sheridan",
  "joachim-ronning",
  "joachim-trier",
  "joaquim-de-almeida",
  "joaquin-phoenix",
  "jodie-foster",
  "joe-berlinger",
  "joe-carnahan",
  "joe-dante",
  "joe-johnston",
  "joe-morton",
  "joe-pesci",
  "joe-wright",
  "joel-coen",
  "joel-edgerton",
  "joel-schumacher",
  "john-badham",
  "john-boorman",
  "john-c-reilly",
  "john-carney",
  "john-carpenter",
  "john-carradine",
  "john-cassavetes",
  "john-crowley",
  "john-cusack",
  "john-dahl",
  "john-ford",
  "john-frankenheimer",
  "john-g-avildsen",
  "john-goodman",
  "john-hillcoat",
  "john-hughes",
  "john-hurt",
  "john-huston",
  "john-irvin",
  "john-krasinski",
  "john-landis",
  "john-lasseter",
  "john-lee-hancock",
  "john-leguizamo",
  "john-lithgow",
  "john-madden",
  "john-malkovich",
  "john-mctiernan",
  "john-musker",
  "john-schlesinger",
  "john-singleton",
  "john-sturges",
  "john-travolta",
  "john-turturro",
  "john-waters",
  "john-wayne",
  "john-woo",
  "johnnie-to",
  "johnny-depp",
  "jon-amiel",
  "jon-bernthal",
  "jon-favreau",
  "jon-m-chu",
  "jon-turteltaub",
  "jon-voight",
  "jonah-hill",
  "jonathan-demme",
  "jonathan-pryce",
  "jorge-coira",
  "jorge-dorado",
  "jorge-sanz",
  "jose-coronado",
  "jose-luis-cuerda",
  "jose-luis-lopez-vazquez",
  "jose-padilha",
  "josef-von-sternberg",
  "joseph-fiennes",
  "joseph-gordon-levitt",
  "joseph-kosinski",
  "joseph-l-mankiewicz",
  "joseph-ruben",
  "josh-brolin",
  "joss-whedon",
  "juan-cavestany",
  "juan-diego-botto",
  "juan-jose-campanella",
  "judd-apatow",
  "jude-law",
  "judi-dench",
  "judy-greer",
  "julia-roberts",
  "julian-fellowes",
  "julian-jarrold",
  "julian-lopez",
  "julianne-moore",
  "julien-maury",
  "juliette-binoche",
  "juliette-lewis",
  "julio-medem",
  "justin-kurzel",
  "justin-lin",
  "justin-long",
  "karl-malden",
  "karra-elejalde",
  "karyn-kusama",
  "kasi-lemmons",
  "kate-winslet",
  "katharine-hepburn",
  "kathryn-bigelow",
  "kathryn-hahn",
  "kathy-bates",
  "kazuya-tsurumaki",
  "keanu-reeves",
  "keenan-wynn",
  "keira-knightley",
  "keith-david",
  "kelly-preston",
  "kelly-reilly",
  "ken-loach",
  "ken-russell",
  "kenji-mizoguchi",
  "kenneth-branagh",
  "kevin-bacon",
  "kevin-costner",
  "kevin-dunn",
  "kevin-kline",
  "kevin-macdonald",
  "kevin-reynolds",
  "kevin-smith",
  "kevin-spacey",
  "kiefer-sutherland",
  "kike-maillo",
  "kim-jee-woon",
  "king-vidor",
  "kirk-douglas",
  "kirsten-dunst",
  "kiyoshi-kurosawa",
  "kristen-stewart",
  "kristin-scott-thomas",
  "krzysztof-kieslowski",
  "kurt-russell",
  "lars-von-trier",
  "lasse-hallstrom",
  "laura-dern",
  "laura-linney",
  "lauren-bacall",
  "laurence-fishburne",
  "laurence-olivier",
  "laurent-cantet",
  "lawrence-kasdan",
  "lee-tamahori",
  "lee-van-cleef",
  "len-wiseman",
  "leonardo-dicaprio",
  "leonardo-sbaraglia",
  "lewis-gilbert",
  "liam-neeson",
  "liev-schreiber",
  "louis-leterrier",
  "louis-malle",
  "luc-besson",
  "luca-guadagnino",
  "luchino-visconti",
  "lucio-fulci",
  "luis-bunuel",
  "luis-callejo",
  "luis-ciges",
  "luis-garcia-berlanga",
  "luis-guzman",
  "luis-tosar",
  "luis-zahera",
  "lukas-moodysson",
  "m-night-shyamalan",
  "mads-mikkelsen",
  "maggie-smith",
  "makoto-shinkai",
  "mamoru-hosoda",
  "mamoru-oshii",
  "manolo-solo",
  "manuel-gomez-pereira",
  "marc-forster",
  "marc-lawrence",
  "marcello-mastroianni",
  "marcelo-pineyro",
  "marco-bellocchio",
  "marco-ferreri",
  "marco-tullio-giordana",
  "margo-martindale",
  "mariano-cohn",
  "maribel-verdu",
  "mario-bava",
  "mario-casas",
  "mario-monicelli",
  "marion-cotillard",
  "marisa-tomei",
  "mark-duplass",
  "mark-mylod",
  "mark-robson",
  "mark-ruffalo",
  "mark-strong",
  "mark-wahlberg",
  "mark-waters",
  "marlene-dietrich",
  "marley-shelton",
  "marlon-brando",
  "martin-campbell",
  "martin-freeman",
  "martin-landau",
  "martin-ritt",
  "martin-scorsese",
  "masaki-kobayashi",
  "mateo-gil",
  "mathieu-amalric",
  "matt-damon",
  "matt-dillon",
  "matt-reeves",
  "matt-walsh",
  "matteo-garrone",
  "matthew-mcconaughey",
  "matthew-vaughn",
  "maury-chaykin",
  "max-ophuls",
  "max-von-sydow",
  "mcg",
  "meg-ryan",
  "mel-brooks",
  "mel-gibson",
  "melissa-leo",
  "mervyn-leroy",
  "meryl-streep",
  "michael-apted",
  "michael-bay",
  "michael-caine",
  "michael-caton-jones",
  "michael-cimino",
  "michael-curtiz",
  "michael-douglas",
  "michael-fassbender",
  "michael-gambon",
  "michael-haneke",
  "michael-hoffman",
  "michael-j-fox",
  "michael-keaton",
  "michael-mann",
  "michael-moore",
  "michael-murphy",
  "michael-pena",
  "michael-powell",
  "michael-radford",
  "michael-shannon",
  "michael-sheen",
  "michael-stuhlbarg",
  "michael-winterbottom",
  "michel-franco",
  "michel-gondry",
  "michel-hazanavicius",
  "michel-ocelot",
  "michel-piccoli",
  "michelangelo-antonioni",
  "michelle-monaghan",
  "michelle-pfeiffer",
  "michelle-williams",
  "mickey-rourke",
  "miguel-rellan",
  "mikael-hafstrom",
  "mike-figgis",
  "mike-flanagan",
  "mike-judge",
  "mike-leigh",
  "mike-mitchell",
  "mike-newell",
  "mike-nichols",
  "mikio-naruse",
  "milos-forman",
  "mimi-leder",
  "montxo-armendariz",
  "morgan-freeman",
  "moriarti",
  "morten-tyldum",
  "nacho-g-velilla",
  "nacho-vigalondo",
  "nagisa-oshima",
  "nancy-meyers",
  "nanni-moretti",
  "naomi-watts",
  "natalie-portman",
  "neil-jordan",
  "neil-labute",
  "neil-marshall",
  "nicholas-hoult",
  "nicholas-ray",
  "nicholas-stoller",
  "nick-antosca",
  "nick-cassavetes",
  "nick-nolte",
  "nicolas-cage",
  "nicolas-roeg",
  "nicolas-winding-refn",
  "nicole-kidman",
  "niels-arden-oplev",
  "nigel-cole",
  "nikita-mikhalkov",
  "noah-baumbach",
  "nora-ephron",
  "norman-jewison",
  "ole-bornedal",
  "oliver-hirschbiegel",
  "oliver-parker",
  "oliver-platt",
  "oliver-stone",
  "olivia-de-havilland",
  "olivia-wilde",
  "olivier-assayas",
  "oriol-paulo",
  "orson-welles",
  "oscar-isaac",
  "osgood-perkins",
  "otto-preminger",
  "owen-wilson",
  "pablo-larrain",
  "pablo-trapero",
  "paco-plaza",
  "paddy-considine",
  "paolo-sorrentino",
  "paolo-virzi",
  "park-chan-wook",
  "patrice-leconte",
  "patricia-clarkson",
  "patrick-wilson",
  "pau-freixas",
  "paul-bettany",
  "paul-dano",
  "paul-feig",
  "paul-giamatti",
  "paul-greengrass",
  "paul-haggis",
  "paul-rudd",
  "paul-schrader",
  "paul-sorvino",
  "paul-thomas-anderson",
  "paul-verhoeven",
  "paul-w-s-anderson",
  "paul-weitz",
  "pawel-pawlikowski",
  "pedro-almodovar",
  "pedro-casablanc",
  "penelope-cruz",
  "penelope-wilton",
  "peter-berg",
  "peter-bogdanovich",
  "peter-falk",
  "peter-farrelly",
  "peter-greenaway",
  "peter-hyams",
  "peter-jackson",
  "peter-sarsgaard",
  "peter-segal",
  "peter-stormare",
  "peter-weir",
  "peter-yates",
  "peyton-reed",
  "phil-lord",
  "philip-kaufman",
  "philip-seymour-hoffman",
  "phillip-noyce",
  "pier-paolo-pasolini",
  "pierce-brosnan",
  "pierfrancesco-favino",
  "pierre-coffin",
  "pietro-germi",
  "quentin-dupieux",
  "quentin-tarantino",
  "rachel-mcadams",
  "rachel-weisz",
  "rainer-werner-fassbinder",
  "raja-gosnell",
  "ralph-fiennes",
  "ralph-richardson",
  "ramon-barea",
  "ramon-campos",
  "raoul-walsh",
  "raul-arevalo",
  "ray-liotta",
  "rene-clair",
  "rene-clement",
  "renny-harlin",
  "requa-ficarra",
  "rian-johnson",
  "ric-roman-waugh",
  "ricardo-darin",
  "riccardo-scamarcio",
  "richard-attenborough",
  "richard-benjamin",
  "richard-brooks",
  "richard-donner",
  "richard-fleischer",
  "richard-gere",
  "richard-jenkins",
  "richard-lester",
  "richard-linklater",
  "richard-widmark",
  "ricky-gervais",
  "ridley-scott",
  "rip-torn",
  "rob-cohen",
  "rob-marshall",
  "rob-minkoff",
  "rob-reiner",
  "robert-aldrich",
  "robert-altman",
  "robert-benton",
  "robert-bresson",
  "robert-de-niro",
  "robert-downey-jr",
  "robert-duvall",
  "robert-loggia",
  "robert-luketic",
  "robert-mitchum",
  "robert-patrick",
  "robert-redford",
  "robert-rodriguez",
  "robert-ryan",
  "robert-schwentke",
  "robert-siodmak",
  "robert-wise",
  "robert-zemeckis",
  "roberto-rossellini",
  "robin-williams",
  "robin-wright",
  "rock-hudson",
  "roddy-mcdowall",
  "rodrigo-cortes",
  "rodrigo-garcia",
  "rodrigo-sorogoyen",
  "roger-donaldson",
  "roger-spottiswoode",
  "roger-vadim",
  "roland-emmerich",
  "roman-polanski",
  "ron-clements",
  "ron-howard",
  "ron-livingston",
  "ron-perlman",
  "ron-rifkin",
  "ron-shelton",
  "ronald-neame",
  "rosamund-pike",
  "rosario-dawson",
  "rosemarie-dewitt",
  "rouben-mamoulian",
  "ruben-fleischer",
  "russell-crowe",
  "ryan-murphy",
  "ryan-reynolds",
  "sally-hawkins",
  "salma-hayek",
  "sam-mendes",
  "sam-neill",
  "sam-peckinpah",
  "sam-raimi",
  "sam-rockwell",
  "sam-shepard",
  "sam-wood",
  "sammo-hung",
  "samuel-l-jackson",
  "santiago-segura",
  "sarah-jessica-parker",
  "scarlett-johansson",
  "scott-cooper",
  "scott-derrickson",
  "scott-glenn",
  "scott-hicks",
  "scott-wilson",
  "sean-anders",
  "sean-bean",
  "sean-connery",
  "sean-penn",
  "sebastian-stan",
  "seijun-suzuki",
  "sergei-m-eisenstein",
  "sergio-corbucci",
  "sergio-leone",
  "seth-macfarlane",
  "seth-rogen",
  "shane-black",
  "shawn-levy",
  "shea-whigham",
  "shelley-winters",
  "shirley-henderson",
  "shohei-imamura",
  "shonda-rhimes",
  "sidney-lumet",
  "sig-ruman",
  "sigourney-weaver",
  "simon-pegg",
  "simon-west",
  "sofia-coppola",
  "sophia-loren",
  "spencer-tracy",
  "spike-jonze",
  "spike-lee",
  "stanley-donen",
  "stanley-kramer",
  "stanley-kubrick",
  "stanley-tucci",
  "stefania-sandrelli",
  "stefano-sollima",
  "stellan-skarsgard",
  "stephane-brize",
  "stephen-daldry",
  "stephen-frears",
  "stephen-graham",
  "stephen-hopkins",
  "stephen-merchant",
  "stephen-sommers",
  "steve-buscemi",
  "steve-carell",
  "steve-martin",
  "steve-rodney-mcqueen",
  "steve-zahn",
  "steven-knight",
  "steven-soderbergh",
  "steven-spielberg",
  "susan-sarandon",
  "susanna-white",
  "susanne-bier",
  "sydney-pollack",
  "sylvester-stallone",
  "tadanobu-asano",
  "taika-waititi",
  "takashi-miike",
  "takashi-shimizu",
  "takashi-shimura",
  "takeshi-kitano",
  "tatsuya-nakadai",
  "taylor-hackford",
  "taylor-sheridan",
  "terence-stamp",
  "teresa-fernandez-valdes",
  "terrence-malick",
  "terry-gilliam",
  "terry-jones",
  "the-wachowskis",
  "thomas-vinterberg",
  "ti-west",
  "tilda-swinton",
  "tim-blake-nelson",
  "tim-burton",
  "tim-robbins",
  "tim-roth",
  "tim-story",
  "timothy-spall",
  "tobe-hooper",
  "toby-jones",
  "todd-haynes",
  "todd-phillips",
  "todd-solondz",
  "tom-cruise",
  "tom-hanks",
  "tom-hardy",
  "tom-holland",
  "tom-hooper",
  "tom-mccarthy",
  "tom-mcgrath",
  "tom-shadyac",
  "tom-shankland",
  "tom-tykwer",
  "tom-wilkinson",
  "tommy-lee-jones",
  "tommy-wirkola",
  "toni-collette",
  "tony-curran",
  "tony-scott",
  "toshiro-mifune",
  "tsai-ming-liang",
  "tsui-hark",
  "udo-kier",
  "uma-thurman",
  "uwe-boll",
  "val-kilmer",
  "valeria-golino",
  "vera-farmiga",
  "vicente-aranda",
  "victor-fleming",
  "viggo-mortensen",
  "vince-gilligan",
  "vince-vaughn",
  "vincent-cassel",
  "vincent-d-onofrio",
  "vincent-price",
  "vincente-minnelli",
  "vincenzo-natali",
  "ving-rhames",
  "vinnie-jones",
  "viola-davis",
  "vittorio-de-sica",
  "vittorio-gassman",
  "walter-hill",
  "walter-salles",
  "ward-bond",
  "wayne-wang",
  "werner-herzog",
  "wes-anderson",
  "wes-craven",
  "whoopi-goldberg",
  "will-ferrell",
  "will-patton",
  "will-smith",
  "willem-dafoe",
  "william-a-wellman",
  "william-dieterle",
  "william-friedkin",
  "william-h-macy",
  "william-hurt",
  "william-wyler",
  "wilson-yip",
  "wim-wenders",
  "winona-ryder",
  "wolfgang-petersen",
  "wolfgang-reitherman",
  "wong-kar-wai",
  "woody-allen",
  "woody-harrelson",
  "xavier-dolan",
  "yasujiro-ozu",
  "yasuzo-masumura",
  "yoji-yamada",
  "yorgos-lanthimos",
  "zack-snyder",
  "zhang-yimou"
]);

// cloudflare/worker.js
var DEFAULT_SUPABASE_STORAGE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public";
var DEFAULT_SUPABASE_URL = "https://wibygecgfczcvaqewleq.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";
var RESERVED_PREFIXES = [
  "/api/",
  "/assets/",
  "/posters/",
  "/vips/",
  "/internal/",
  "/genero/",
  "/pais/",
  "/estudio/",
  "/seleccion/",
  "/titulo/",
  "/actor/",
  "/director/"
];
var RESERVED_EXACT = /* @__PURE__ */ new Set([
  "/",
  "",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/llms.txt",
  "/favicon.ico",
  "/favicon.svg",
  "/robots.txt"
]);
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
        const canonicalMovie = new URL(`/titulo/${slug}/`, url.origin).toString();
        const nonSlashMovie = new URL(`/titulo/${slug}`, url.origin).toString();
        const canonicalPerson = new URL(`/${slug}/`, url.origin).toString();
        const nonSlashPerson = new URL(`/${slug}`, url.origin).toString();
        const canonicalGenre = new URL(`/genero/${slug}/`, url.origin).toString();
        const canonicalCountry = new URL(`/pais/${slug}/`, url.origin).toString();
        const canonicalStudio = new URL(`/estudio/${slug}/`, url.origin).toString();
        const canonicalSel = new URL(`/seleccion/${slug}/`, url.origin).toString();
        const p1 = await cache.delete(canonicalMovie);
        const p2 = await cache.delete(nonSlashMovie);
        const p3 = await cache.delete(canonicalPerson);
        const p4 = await cache.delete(nonSlashPerson);
        const p5 = await cache.delete(canonicalGenre);
        const p6 = await cache.delete(canonicalCountry);
        const p7 = await cache.delete(canonicalStudio);
        const p8 = await cache.delete(canonicalSel);
        if (p1 || p2 || p3 || p4 || p5 || p6 || p7 || p8) purgedCount++;
      }
      return new Response(JSON.stringify({ success: true, purged: purgedCount, totalRequested: slugs.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname.startsWith("/seo-card") && url.pathname.endsWith(".css")) {
      return new Response(SEO_CARD_CSS, {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    if (url.pathname === "/sitemap-index.xml") {
      const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${url.origin}/sitemap.xml</loc>
  </sitemap>
</sitemapindex>
`;
      return new Response(sitemapIndexXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, s-maxage=604800"
        }
      });
    }
    const isPrefixedSeoRoute = url.pathname.startsWith("/titulo/") || url.pathname.startsWith("/genero/") || url.pathname.startsWith("/pais/") || url.pathname.startsWith("/estudio/") || url.pathname.startsWith("/seleccion/");
    if (isPrefixedSeoRoute && !url.pathname.endsWith("/")) {
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
        } catch (_) {
        }
      }
    }
    const isTaxonomyRoute = url.pathname.startsWith("/genero/") || url.pathname.startsWith("/pais/") || url.pathname.startsWith("/estudio/") || url.pathname.startsWith("/seleccion/");
    if (isTaxonomyRoute) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 2) {
        const [prefix, slug] = parts;
        const taxInfo = resolveTaxonomy(slug, prefix);
        if (taxInfo) {
          if (!url.pathname.endsWith("/")) {
            return Response.redirect(new URL(`${taxInfo.canonicalPath}${url.search}`, url.origin).toString(), 301);
          }
          const cache = caches.default;
          const canonicalKey = new Request(new URL(taxInfo.canonicalPath, url.origin).toString(), request);
          const cached = await cache.match(canonicalKey);
          if (cached) {
            return cached;
          }
          const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
          try {
            const apiResponse = await fetch(rpcUrl, {
              method: "POST",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json",
                Accept: "application/json"
              },
              body: JSON.stringify(taxInfo.rpcParams)
            });
            if (apiResponse.ok) {
              const data = await apiResponse.json();
              const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
              if (items.length > 0) {
                const html = renderTaxonomyHtml(taxInfo, items, { siteOrigin: url.origin, storageUrl });
                const response2 = new Response(html, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
                    "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
                  }
                });
                ctx?.waitUntil?.(cache.put(canonicalKey, response2.clone()));
                return response2;
              }
            }
          } catch (_) {
          }
        }
      }
    }
    const isReservedPrefix = RESERVED_PREFIXES.some((p) => url.pathname.startsWith(p));
    const isReservedExact = RESERVED_EXACT.has(url.pathname);
    const hasFileExtension = url.pathname.includes(".") && !url.pathname.endsWith("/");
    if (!isReservedPrefix && !isReservedExact && !hasFileExtension) {
      const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
      if (segments.length === 1) {
        const slug = segments[0];
        if (VIP_SLUGS.has(slug)) {
          if (!url.pathname.endsWith("/")) {
            return Response.redirect(new URL(`/${slug}/${url.search}`, url.origin).toString(), 301);
          }
          const cache = caches.default;
          const canonicalKey = new Request(new URL(`/${slug}/`, url.origin).toString(), request);
          const cached = await cache.match(canonicalKey);
          if (cached) {
            return cached;
          }
          const selectFields = "id,name,slug,type,vip,birthday,deathday,place_of_birth,biography,titulo_bio,thumbhash_st,countries(id,code,name)";
          const personQueryUrl = `${supabaseUrl}/rest/v1/people?slug=eq.${encodeURIComponent(slug)}&vip=eq.1&select=${selectFields}&limit=1`;
          try {
            const personRes = await fetch(personQueryUrl, {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                Accept: "application/json"
              }
            });
            if (personRes.ok) {
              const persons = await personRes.json();
              const person = Array.isArray(persons) && persons.length > 0 ? persons[0] : null;
              if (person) {
                const isDirector = person.type === "D" || person.type === "DA";
                const role = isDirector ? "director" : "actor";
                const hasOtherRole = person.type === "AD" || person.type === "DA";
                const rpcUrl = `${supabaseUrl}/rest/v1/rpc/search_movies_offset`;
                const rpcParams = {
                  [isDirector ? "director_name" : "actor_name"]: person.name,
                  sort_field: "fa_votes",
                  sort_direction: "desc",
                  page_limit: 42,
                  get_count: true
                };
                const moviesRes = await fetch(rpcUrl, {
                  method: "POST",
                  headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json"
                  },
                  body: JSON.stringify(rpcParams)
                }).catch(() => null);
                let movies = [];
                if (moviesRes && moviesRes.ok) {
                  const moviesData = await moviesRes.json().catch(() => ({}));
                  movies = Array.isArray(moviesData?.items) ? moviesData.items : Array.isArray(moviesData) ? moviesData : [];
                }
                const html = renderPersonHtml(person, role, hasOtherRole, movies, { siteOrigin: url.origin, storageUrl });
                const response2 = new Response(html, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
                    "Link": '</llms.txt>; rel="alternate"; type="text/markdown"'
                  }
                });
                ctx?.waitUntil?.(cache.put(canonicalKey, response2.clone()));
                return response2;
              }
            }
          } catch (_) {
          }
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
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/seo-card")) {
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
