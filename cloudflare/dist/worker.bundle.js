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

  <!-- Hoja de Estilos Externa Cacheable (SSOT con versionado perimetral) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v2.css" />

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

// cloudflare/seo/seo-card-css.js
var SEO_CARD_CSS = '/* src/css/base/variables.css */\r\n\r\n/* ========================================================== */\r\n/*  1. FUENTES (TIPOGRAF\xCDA)\r\n/* ========================================================== */\r\n\r\n/* Inter Variable: Un solo archivo para todos los pesos */\r\n@font-face {\r\n  font-family: "Inter";\r\n  font-style: normal;\r\n  font-weight: 100 900;\r\n  font-display: swap; /* Evita texto invisible (FOIT) */\r\n  src: url("https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2") format("woff2");\r\n}\r\n\r\n/* Fallback m\xE9tricamente ajustado para reducir CLS (Cumulative Layout Shift) */\r\n@font-face {\r\n  font-family: "Inter Fallback";\r\n  src: local("Arial");\r\n  ascent-override: 92.77%;\r\n  descent-override: 24.41%;\r\n  line-gap-override: 0%;\r\n  size-adjust: 107.8%;\r\n}\r\n\r\n/* ========================================================== */\r\n/*  2. DESIGN TOKENS (Variables CSS)\r\n/* ========================================================== */\r\n\r\n:root {\r\n  /* ---- Tipograf\xEDa ---- */\r\n  --font-body: "Inter", "Inter Fallback", system-ui, -apple-system, sans-serif;\r\n  --font-title: var(--font-body); /* Misma familia, preparada para divergencia futura */\r\n\r\n  /* Escala Modular (Mobile First - Boosted ~20%) */\r\n  --font-size-xs: 0.9rem;\r\n  --font-size-sm: 1.05rem;\r\n  --font-size-base: 1.2rem;\r\n  --font-size-md: 1.35rem;\r\n  --font-size-lg: 1.5rem;\r\n  --font-size-xl: 1.8rem;\r\n\r\n  --line-height-tight: 1.1;\r\n  --line-height-normal: 1.5;\r\n\r\n  --font-weight-normal: 400;\r\n  --font-weight-medium: 500;\r\n  --font-weight-semibold: 600;\r\n  --font-weight-bold: 700;\r\n  --font-weight-extrabold: 800; \r\n\r\n  /* ---- Paleta de Colores (Tema Claro) ---- */\r\n  --color-bg: #eceff2;\r\n  --color-surface: #ffffff;\r\n  --color-surface-rgb: 255, 255, 255;\r\n  --color-surface-1: #ffffff; /* Nivel 1 (Igual en claro) */\r\n  --color-surface-2: #ffffff; /* Nivel 2 (Igual en claro) */\r\n  \r\n  --color-text-primary: #1a1a1a;\r\n  --color-text-secondary: #4a4a4a;\r\n  --color-text-tertiary: #666666;\r\n\r\n  --color-border: #e0e0e0;\r\n  --color-border-soft: rgba(0, 0, 0, 0.07);\r\n  \r\n  /* Marca */\r\n  --color-accent: #37474f;\r\n  --color-accent-darker: #263238;\r\n  --color-accent-exclude: #90a4ae;\r\n  --color-accent-exclude-darker: #78909c;\r\n  --color-focus: rgba(55, 71, 79, 0.4); /* Nuevo: Para anillos de foco */\r\n\r\n  /* Feedback */\r\n  --color-error: #dc3545;\r\n  --color-error-rgb: 220, 53, 69;\r\n  --color-error-bg: #dc354520;\r\n  --color-success: #28a745;\r\n  --color-success-rgb: 40, 167, 69;\r\n  --color-success-bg: #28a74520;\r\n  --color-info-rgb: 23, 162, 184;\r\n\r\n  /* Dorado de valoraci\xF3n de usuario (estrellas activas) */\r\n  --color-star-gold: #ffbd07;\r\n  --color-star-gold-rgb: 255, 189, 7;\r\n\r\n  /* ---- Espaciado y Layout ---- */\r\n  --sidebar-width-mobile: 300px;\r\n  --tap-target-size: 48px; /* M\xEDnimo t\xE1ctil accesible */\r\n\r\n  --space-xxs: 0.25rem;  /* 4px */\r\n  --space-xs: 0.5rem;    /* 8px */\r\n  --space-sm: 0.75rem;   /* 12px */\r\n  --space-md: 1rem;      /* 16px */\r\n  --space-lg: 1.5rem;    /* 24px */\r\n  --space-xl: 2rem;      /* 32px */\r\n  --space-xxl: 3rem;     /* 48px */\r\n\r\n  /* ---- Bordes y Sombras ---- */\r\n  --radius-xs: 2px;\n  --radius-sm: 4px;\r\n  --radius-md: 6px;\r\n  --radius-lg: 8px;\r\n  --radius-xl: 12px;\r\n  --radius-xxl: 16px;\r\n  --radius-round: 50%;\r\n  --radius-pill: 9999px;\r\n\r\n  --shadow: 0 5px 15px rgba(0, 0, 0, 0.08);\r\n  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);\r\n\r\n  /* ---- Animaci\xF3n (Tiempos y Curvas) ---- */\r\n  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);\r\n  --ease-snap: var(--ease-smooth);\r\n  --ease-bounce-in: cubic-bezier(0.68, -0.55, 0.265, 1.55);\r\n  --ease-bounce-sharp: cubic-bezier(0.34, 1.56, 0.64, 1);\r\n  --ease-smooth-out: cubic-bezier(0.22, 0.61, 0.36, 1);\r\n  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);\r\n  --ease-panel: cubic-bezier(0.2, 0.8, 0.2, 1);\r\n  --ease-luxury: cubic-bezier(0.16, 1, 0.3, 1); /* Quiet Luxury: Exponencial inversa */\r\n\r\n  --duration-quick: 200ms;\r\n  --duration-fast: 300ms;\r\n  --duration-normal: 400ms;\r\n  --duration-leisurely: 600ms;\r\n\r\n  /* Alias sem\xE1nticos */\r\n  --transition-duration-fast: var(--duration-fast);\r\n  --transition-duration-normal: var(--duration-normal);\r\n  --transition-timing-function: var(--ease-smooth);\r\n\r\n  /* ---- Capas (Z-Index) ---- */\r\n  --z-index-card-content: 20;\r\n  --z-index-autocomplete: 850;\r\n  --z-index-header: 900;\r\n  --z-index-sidebar: 1000;\r\n  --z-index-overlay: 1999;\r\n  --z-index-toast: 2100;\r\n\r\n  /* ---- Breakpoints (Referencia) ---- */\r\n  /* Nota: CSS no permite variables en @media, usar estos valores hardcoded:\r\n     - M\xF3vil: max-width: 768px\r\n     - Escritorio: min-width: 769px */\r\n  --bp-mobile-max: 768px;\r\n  --bp-desktop-min: 769px;\r\n}\r\n\r\n/* Restaurar escala compacta para Escritorio */\r\n@media (min-width: 769px) and (min-height: 501px) {\r\n  :root {\r\n    --font-size-xs: 0.75rem;\r\n    --font-size-sm: 0.875rem;\r\n    --font-size-base: 1rem;\r\n    --font-size-md: 1.125rem;\r\n    --font-size-lg: 1.25rem;\r\n    --font-size-xl: 1.5rem;\r\n  }\r\n}\r\n\r\n/* ---- Tema Oscuro (Overrides) ---- */\r\nhtml.dark-mode {\r\n  --color-bg: #0d0d0d; /* Base m\xE1s profunda */\r\n  --color-surface: #1a1a1a; /* Nivel 0 (Sidebar/Header) */\r\n  --color-surface-rgb: 26, 26, 26;\r\n  --color-surface-1: #242424; /* Nivel 1 (Tarjetas) */\r\n  --color-surface-2: #2e2e2e; /* Nivel 2 (Modals) */\r\n  \r\n  --color-text-primary: #e0e0e0;\r\n  --color-text-secondary: #b8b8b8;\r\n  --color-text-tertiary: #a0a0a0;\r\n  \r\n  --color-border: #3a3a3a; /* Bordes m\xE1s visibles */\r\n  --color-border-soft: rgba(255, 255, 255, 0.12);\r\n  \r\n  --color-accent: #b0bec5;\r\n  --color-accent-darker: #90a4ae;\r\n  --color-accent-exclude: #546e7a;\r\n  --color-accent-exclude-darker: #607d8b;\r\n  --color-focus: rgba(176, 190, 197, 0.4);\r\n  \r\n  --shadow: 0 8px 24px rgba(0, 0, 0, 0.35);\r\n  \r\n  --color-error: #cf6679; \r\n  --color-error-rgb: 207, 102, 121;\r\n  --color-error-bg: rgba(207, 102, 121, 0.15);\r\n  --color-success: #66bb6a;\r\n  --color-success-rgb: 102, 187, 106;\r\n  --color-success-bg: rgba(102, 187, 106, 0.15);\r\n}\n\n\n\n/* EXTENSIONES DE LAYOUT Y OVERLAY PARA SEO SITE */\n:root, html.dark-mode {\n  --color-header-bg: rgba(13, 13, 13, 0.85);\n  --color-overlay-bg: rgba(0, 0, 0, 0.65);\n  --modal-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08);\n}\n\nhtml.light-mode {\n  --color-header-bg: rgba(255, 255, 255, 0.85);\n  --color-overlay-bg: rgba(0, 0, 0, 0.18);\n  --modal-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08);\n}\n\n@media (prefers-color-scheme: light) {\n  :root:not(.dark-mode) {\n    --color-header-bg: rgba(255, 255, 255, 0.85);\n    --color-overlay-bg: rgba(0, 0, 0, 0.18);\n    --modal-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08);\n  }\n}\n\n* {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n\nhtml, body {\n  background-color: var(--color-bg) !important;\n  color: var(--color-text-primary) !important;\n  font-family: var(--font-body);\n  min-height: 100vh;\n  width: 100%;\n  overflow-x: hidden;\n  position: relative;\n}\n\n/* ACCESIBILIDAD: Anillos de foco para navegaci\xF3n por teclado */\n.brand-logo:focus-visible,\n.btn-header-cta:focus-visible,\n.card-action-btn:focus-visible,\n.year-link:focus-visible,\n.rating-left:focus-visible,\n[data-template="justwatch-link"]:focus-visible,\n[data-template="wikipedia-link"]:focus-visible,\n.front-director-info a:focus-visible,\n[data-template="actors"] a:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 3px var(--color-focus);\n}\n\n.brand-logo:focus-visible,\n.btn-header-cta:focus-visible,\n.card-action-btn:focus-visible {\n  border-radius: 9999px;\n}\n\n.year-link:focus-visible,\n.rating-left:focus-visible,\n[data-template="justwatch-link"]:focus-visible,\n[data-template="wikipedia-link"]:focus-visible {\n  border-radius: var(--radius-sm);\n}\n\n.front-director-info a:focus-visible,\n[data-template="actors"] a:focus-visible {\n  border-radius: var(--radius-xs);\n}\n\n/* HEADER DE MARCA SUPERIOR */\n.site-header {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 56px;\n  z-index: 2000;\n  background: var(--color-header-bg);\n  backdrop-filter: blur(12px);\n  border-bottom: 1px solid var(--color-border);\n  padding: 0 20px;\n  display: flex;\n  align-items: center;\n}\n\n.header-content {\n  width: 100%;\n  max-width: 1100px;\n  margin: 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.brand-logo {\n  display: flex;\n  flex-direction: column;\n  text-decoration: none;\n  font-family: var(--font-title);\n  font-size: 1.15rem;\n  font-weight: 700;\n  line-height: 1.1;\n  letter-spacing: -0.03em;\n  color: var(--color-text-primary);\n  transition: opacity 0.2s ease;\n\n  &:hover {\n    opacity: 0.85;\n  }\n}\n\n.logo-line-1,\n.logo-line-2 {\n  display: block;\n}\n\n.header-controls {\n  display: flex;\n  align-items: center;\n}\n\n.btn-header-cta {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 40px;\n  height: 40px;\n  background: rgba(245, 158, 11, 0.15);\n  color: #f59e0b;\n  border: 1px solid rgba(245, 158, 11, 0.35);\n  border-radius: 9999px;\n  text-decoration: none;\n  transition: all 0.2s ease;\n\n  &:hover {\n    background: #f59e0b;\n    color: #0d0d0d;\n    transform: scale(1.08);\n  }\n\n  & svg {\n    width: 20px;\n    height: 20px;\n  }\n}\n\n/* CORTINA OSCURA Y VENTANA MODAL (SPA QUICK VIEW) */\n.quick-view-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: var(--z-index-overlay);\n  background-color: var(--color-overlay-bg);\n  backdrop-filter: blur(6px) saturate(85%);\n  -webkit-backdrop-filter: blur(6px) saturate(85%);\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n}\n\n.quick-view-modal {\n  position: fixed;\n  z-index: calc(var(--z-index-overlay) + 1);\n  display: flex;\n  background-color: var(--color-surface-2);\n  box-shadow: var(--modal-shadow);\n  overflow: hidden;\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n}\n\n.quick-view-content {\n  width: 100%;\n  height: 100%;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  -webkit-overflow-scrolling: touch;\n  scrollbar-width: thin;\n  scrollbar-color: var(--color-border) var(--color-bg);\n}\n\n.quick-view-content::-webkit-scrollbar,\n.flip-card-back::-webkit-scrollbar {\n  width: 6px;\n  height: 6px;\n}\n.quick-view-content::-webkit-scrollbar-track,\n.flip-card-back::-webkit-scrollbar-track {\n  background: var(--color-bg);\n}\n.quick-view-content::-webkit-scrollbar-thumb,\n.flip-card-back::-webkit-scrollbar-thumb {\n  background-color: var(--color-border);\n  border-radius: 9999px;\n  border: 2px solid var(--color-bg);\n}\n.quick-view-content::-webkit-scrollbar-thumb:hover,\n.flip-card-back::-webkit-scrollbar-thumb:hover {\n  background-color: var(--color-text-secondary);\n}\n\n.is-quick-view.movie-card {\n  aspect-ratio: auto;\n  perspective: none;\n  animation: none;\n  width: 100%;\n  height: 100%;\n}\n\n.is-quick-view .flip-card-inner {\n  transform-style: flat;\n  box-shadow: none;\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  background-color: var(--color-surface-1);\n  border: none;\n}\n\n.is-quick-view :is(.flip-card-front, .flip-card-back) {\n  position: relative;\n  inset: auto;\n  transform: none;\n  backface-visibility: visible;\n  height: auto;\n  overflow: visible;\n  background-color: var(--color-surface-1);\n  color: var(--color-text-primary);\n}\n\n.is-quick-view .flip-card-front {\n  padding: var(--space-lg);\n  border-bottom: 1px solid var(--color-border);\n  flex-shrink: 0;\n}\n\n.is-quick-view .flip-card-back {\n  padding: var(--space-lg);\n  flex-grow: 1;\n  min-width: 0;\n  pointer-events: auto;\n}\n\n.is-quick-view .poster-container {\n  height: auto;\n  width: 100%;\n  border: none;\n  position: relative;\n}\n\n.is-quick-view .poster-container img {\n  width: 100%;\n  height: auto;\n  border-radius: var(--radius-xxl);\n  box-shadow: var(--shadow);\n  border: none;\n  display: block;\n  object-fit: cover;\n  pointer-events: none !important;\n  user-select: none !important;\n  -webkit-user-select: none !important;\n  -webkit-user-drag: none !important;\n  -webkit-touch-callout: none !important;\n}\n\n.is-quick-view .movie-summary {\n  padding-inline: 0;\n  padding-top: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.is-quick-view .title-director-block {\n  min-height: 82px;\n  justify-content: center;\n  margin-bottom: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.is-quick-view .movie-summary h1[data-template="title"],\n.is-quick-view .movie-summary .movie-main-title {\n  font-size: 2rem;\n  font-weight: var(--font-weight-extrabold);\n  color: var(--color-text-primary);\n  line-height: 1.1;\n  margin-bottom: 4px;\n  letter-spacing: -0.03em;\n\n  &.title-medium { font-size: 1.7rem; }\n  &.title-long { font-size: 1.4rem; }\n  &.title-xl-long { font-size: 1.15rem; }\n  &.title-xxl-long { font-size: 1rem; }\n  &.title-xxxl-long { font-size: 0.85rem; }\n}\n\n.is-quick-view .front-director-info {\n  font-size: calc(var(--font-size-xs) * 1.5);\n  color: var(--color-text-secondary);\n  margin-top: 4px;\n  margin-bottom: var(--space-md);\n  line-height: 1.4;\n  white-space: normal;\n  display: block;\n  width: 100%;\n\n  & a {\n    color: inherit;\n    text-decoration: none;\n\n    &:hover {\n      color: var(--color-text-primary);\n      text-decoration: underline;\n    }\n  }\n}\n\n.is-quick-view .card-rating-block {\n  position: relative;\n  z-index: 10;\n  transform: none;\n  padding: 0 0 2px;\n  margin: -8px 0 0;\n  pointer-events: auto;\n  justify-content: center;\n  align-items: center;\n  gap: var(--space-lg);\n  display: flex;\n}\n\n.is-quick-view .card-rating-block * {\n  pointer-events: auto;\n}\n\n.is-quick-view .star-rating-container {\n  display: flex;\n  align-items: center;\n  gap: var(--space-sm);\n  cursor: pointer;\n}\n\n.star-rating-container.is-interactive .star-icon:hover {\n  transform: scale(1.35);\n  z-index: 20;\n  filter: drop-shadow(0 0 4px rgba(255, 189, 7, 0.6));\n  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);\n}\n\n.star-rating-container.is-interactive .star-icon:active {\n  transform: scale(0.92);\n  filter: brightness(0.95);\n}\n\n.is-quick-view .star-icon {\n  width: 42px;\n  height: 42px;\n  position: relative;\n  cursor: pointer;\n  transition: transform 0.2s ease;\n}\n\n.star-icon-path {\n  stroke: var(--color-accent);\n  stroke-width: 2;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n.star-icon-path--empty { fill: transparent; }\n.star-icon-path--filled {\n  fill: var(--color-accent);\n  clip-path: inset(0 100% 0 0);\n}\n\n.is-quick-view .card-action-btn {\n  width: 60px;\n  height: 60px;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid var(--color-border);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--color-text-primary);\n  text-decoration: none;\n  transition: background-color 0.2s ease, transform 0.2s ease;\n\n  &:hover {\n    background: rgba(255, 255, 255, 0.12);\n    transform: scale(1.05);\n  }\n\n  &.is-active {\n    background: rgba(229, 9, 20, 0.2);\n    border-color: #e50914;\n\n    & svg {\n      color: #e50914 !important;\n      fill: #e50914 !important;\n      stroke: #e50914 !important;\n    }\n  }\n\n  & svg {\n    width: 38px;\n    height: 38px;\n    stroke: currentColor;\n    fill: none;\n    stroke-width: 2.5px;\n  }\n}\n\n.is-quick-view .movie-meta {\n  display: flex;\n  align-items: center;\n  margin-top: auto;\n  padding-top: var(--space-xs);\n}\n\n.is-quick-view .modal-horizontal-divider {\n  flex-grow: 1;\n  height: 1px;\n  background-color: var(--color-border);\n  align-self: center;\n  margin-inline: var(--space-md);\n  opacity: 0.8;\n}\n\n.is-quick-view .card-icons-line {\n  display: flex;\n  align-items: center;\n  gap: var(--space-md);\n}\n\n.is-quick-view .platform-icon svg {\n  width: 33px;\n  height: 33px;\n}\n\n/* COLORES ESTUDIOS (Light Mode por defecto o .light-mode) */\n.netflix-icon { color: #e50914; }\n.disney-icon { color: #990000; }\n.wb-icon { color: #000b6c; }\n.universal-icon { color: #444444; }\n.sony-icon { color: #004098; }\n.paramount-icon { color: #0063ff; }\n.lionsgate-icon { color: #CC7722; }\n.amazon-icon { color: #f6a61f; }\n.twenty-icon { color: #000b6c; }\n.a24-icon { color: #000; }\n.movistar-icon { color: #00a9e0; }\n.miramax-icon { color: #005596; }\n.apple-icon { color: #000; }\n.canalplus-icon { color: #000; }\n.bbc-icon { color: #000; }\n\n/* COLORES ESTUDIOS (Dark Mode) */\n:root:not(.light-mode) .disney-icon, html.dark-mode .disney-icon { color: #D9534F; }\n:root:not(.light-mode) .wb-icon, html.dark-mode .wb-icon { color: #4da4f2; }\n:root:not(.light-mode) .universal-icon, html.dark-mode .universal-icon { color: #BBBBBB; }\n:root:not(.light-mode) .sony-icon, html.dark-mode .sony-icon { color: #3182ce; }\n:root:not(.light-mode) .paramount-icon, html.dark-mode .paramount-icon { color: #E0E0E0; }\n:root:not(.light-mode) .lionsgate-icon, html.dark-mode .lionsgate-icon { color: #f9d7b5; }\n:root:not(.light-mode) .twenty-icon, html.dark-mode .twenty-icon { color: #E0E0E0; }\n:root:not(.light-mode) .a24-icon, html.dark-mode .a24-icon { color: #fff; }\n:root:not(.light-mode) .miramax-icon, html.dark-mode .miramax-icon { color: #4da4f2; }\n:root:not(.light-mode) .apple-icon, html.dark-mode .apple-icon { color: #fff; }\n:root:not(.light-mode) .canalplus-icon, html.dark-mode .canalplus-icon { color: #fff; }\n:root:not(.light-mode) .bbc-icon, html.dark-mode .bbc-icon { color: #fff; }\n\n.is-quick-view .year-flag-group {\n  display: flex;\n  align-items: center;\n  font-size: 2rem;\n  line-height: 1;\n  gap: var(--space-sm);\n}\n\n.is-quick-view .year-link {\n  color: inherit;\n  text-decoration: none;\n  font-weight: var(--font-weight-bold);\n}\n\n.country-info { display: flex; align-items: center; gap: var(--space-xxs); }\n.is-quick-view .country-flag-icon svg {\n  width: 28px;\n  height: 28px;\n  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);\n}\n\n/* COSTADO TRASERO (DERECHO EN DESKTOP) */\n.is-quick-view .back-meta-header {\n  display: flex;\n  justify-content: flex-end;\n  align-items: center;\n  width: 100%;\n  margin-bottom: var(--space-lg);\n}\n\n.is-quick-view .episode-duration-group {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: calc(var(--font-size-sm) * 1.5);\n  font-weight: var(--font-weight-bold, 700);\n  letter-spacing: 1px;\n  color: var(--color-text-secondary);\n}\n\n[data-template="wikipedia-link"],\n[data-template="justwatch-link"] {\n  display: flex;\n  align-items: center;\n  text-decoration: none;\n  margin-left: var(--space-xs);\n\n  & svg {\n    width: 1.5em;\n    height: 1.5em;\n  }\n}\n\n.is-quick-view .ratings-container {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-lg);\n}\n\n.is-quick-view .rating-line {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  font-variant-numeric: tabular-nums;\n}\n\n.is-quick-view .rating-left {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--color-text-primary);\n  font-size: calc(var(--font-size-base) * 1.5);\n  font-weight: var(--font-weight-bold);\n  text-decoration: none;\n  flex-shrink: 0;\n\n  &:hover { opacity: 0.85; }\n}\n\n.is-quick-view .rating-icon {\n  width: 1.6em;\n  height: 1.6em;\n  border-radius: var(--radius-sm);\n}\n\n.is-quick-view .rating-votes-count {\n  display: flex !important;\n  flex-direction: column;\n  justify-content: center;\n  min-width: 6ch;\n  white-space: nowrap;\n  text-align: right;\n  font-size: var(--font-size-base);\n  font-weight: bold;\n  line-height: 1;\n\n  &::after {\n    content: "votos";\n    font-size: 0.6em;\n    font-weight: normal;\n    color: var(--color-text-secondary);\n    text-align: right;\n    width: 100%;\n    margin-top: 2px;\n    white-space: nowrap;\n  }\n}\n\n.is-quick-view .rating-bar-container {\n  flex-grow: 1;\n  width: 100%;\n  height: var(--space-sm);\n  border-radius: var(--space-xxs);\n  background-color: var(--color-bg);\n  overflow: hidden;\n  position: relative;\n}\n\n.is-quick-view .rating-bar {\n  height: 100%;\n  border-radius: var(--space-xxs);\n  background-color: var(--color-accent);\n}\n\n.is-quick-view .back-original-title-wrapper {\n  margin-top: var(--space-lg);\n  margin-bottom: 0;\n  padding: 0;\n\n  & span {\n    font-size: 1.6rem;\n    font-weight: bold;\n    line-height: 1.1;\n    color: var(--color-text-primary);\n\n    &.title-medium { font-size: 1.45rem; }\n    &.title-long { font-size: 1.3rem; }\n    &.title-xl-long { font-size: 1.05rem; }\n  }\n}\n\n.is-quick-view .front-director-info {\n  font-size: calc(var(--font-size-xs) * 1.5);\n  font-weight: var(--font-weight-normal);\n  color: var(--color-text-secondary);\n  margin-top: 4px;\n  margin-bottom: var(--space-xs);\n  line-height: 1.4;\n\n  & a {\n    color: inherit;\n    text-decoration: none;\n    transition: color var(--duration-fast);\n\n    &:hover {\n      color: var(--color-text-primary);\n      text-decoration: underline;\n    }\n  }\n}\n\n.is-quick-view .details-list {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-md);\n  margin-top: var(--space-lg);\n  margin-bottom: 0;\n  padding-top: var(--space-md);\n  border-top: 1px solid var(--color-border);\n  font-size: calc(var(--font-size-xs) * 1.5);\n  line-height: 1.5;\n  color: var(--color-text-secondary);\n}\n\n.is-quick-view .detail-item[data-template="actors-container"],\n.is-quick-view .detail-item[data-template="genre-container"] {\n  display: block;\n  white-space: normal;\n}\n\n.is-quick-view :is([data-template="actors"], [data-template="genre"], .detail-data) a {\n  color: var(--color-text-primary);\n  text-decoration: none;\n  display: inline;\n  white-space: normal;\n\n  &:hover {\n    color: var(--color-text-primary);\n    text-decoration: underline;\n  }\n}\n\n.is-quick-view .detail-label {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  vertical-align: -2px;\n  margin-right: 8px;\n  color: var(--color-accent);\n  flex-shrink: 0;\n}\n\n.is-quick-view .detail-icon {\n  width: 18px;\n  height: 18px;\n  max-width: 18px;\n  max-height: 18px;\n  stroke: currentColor;\n  stroke-width: 2.6;\n  fill: none;\n  flex-shrink: 0;\n  display: inline-block;\n}\n\n.is-quick-view .detail-label-title {\n  display: inline-block;\n  font-weight: var(--font-weight-bold, 700);\n  color: var(--color-text-primary);\n  margin-right: 0.5em;\n}\n\n.is-quick-view .scrollable-content {\n  overflow: visible;\n  height: auto;\n\n  &::after { display: none; }\n}\n\n.is-quick-view .plot-summary-final {\n  margin-top: var(--space-lg);\n  padding-top: var(--space-md);\n  border-top: 1px solid var(--color-border);\n  font-size: calc(var(--font-size-xs) * 1.5);\n  line-height: 1.5;\n  color: var(--color-text-secondary);\n}\n\n/* ADAPTACI\xD3N ESCRITORIO (min-width: 701px) - Ventana Flotante Cl\xE1sica 2 Columnas */\n@media (min-width: 701px) {\n  .quick-view-modal {\n    top: 50%;\n    left: 50%;\n    width: 90%;\n    max-width: 720px;\n    max-height: 92vh;\n    height: auto;\n    border-radius: var(--radius-xl);\n    transform: translate(-50%, -50%);\n  }\n\n  .is-quick-view .flip-card-inner {\n    display: block;\n    position: relative;\n    overflow: visible;\n  }\n\n  .is-quick-view .flip-card-front {\n    width: 50%;\n    height: auto;\n    border-right: 1px solid var(--color-border);\n    border-bottom: none;\n    overflow-y: hidden;\n  }\n\n  .is-quick-view .flip-card-back {\n    position: absolute;\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: auto;\n    width: 50%;\n    overflow-y: auto;\n    scrollbar-width: thin;\n  }\n}\n\n/* ADAPTACI\xD3N M\xD3VIL (max-width: 700px) - Bottom Sheet desde abajo */\n@media (max-width: 700px) {\n  .site-header {\n    padding: 0 12px;\n  }\n\n  .quick-view-modal {\n    top: auto;\n    bottom: 0;\n    left: 50%;\n    width: 96%;\n    height: 92dvh;\n    max-height: 92dvh;\n    border-radius: var(--radius-xl) var(--radius-xl) 0 0;\n    transform: translate(-50%, 0);\n  }\n\n  /* Barrita superior de arrastre */\n  .quick-view-modal::before {\n    content: "";\n    position: absolute;\n    top: 12px;\n    left: 50%;\n    transform: translateX(-50%);\n    width: 40px;\n    height: 5px;\n    background-color: var(--color-border);\n    border-radius: 10px;\n    z-index: 10;\n    pointer-events: none;\n  }\n\n  .is-quick-view .flip-card-inner {\n    flex-direction: column;\n  }\n\n  .is-quick-view .flip-card-front {\n    padding-top: 30px;\n    padding-bottom: var(--space-xs);\n    border-bottom: none;\n    width: 100%;\n  }\n\n  .is-quick-view .poster-container {\n    width: 70%;\n    margin-inline: auto;\n  }\n\n  .is-quick-view .flip-card-back {\n    padding-top: 0;\n    width: 100%;\n  }\n}\n';

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
    if (url.pathname === "/seo-card.css" || url.pathname === "/seo-card-v2.css") {
      return new Response(SEO_CARD_CSS, {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*"
        }
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
