/**
 * =================================================================
 *   SEO TYPES & HELPERS (cloudflare/seo/seo-types.js)
 * =================================================================
 * Funciones puras de formateo, proyección de base de datos y utilidades
 * de seguridad para el renderer SEO en Edge.
 *
 * RE-EXPORTACIÓN DE SSOT:
 * Centraliza la lógica compartida importando directamente de src/shared/
 * para garantizar paridad absoluta entre la SPA y el Edge Renderer.
 */

import {
  POSTER_BASE_URL,
  STUDIO_DATA,
  SHARED_CONFIG,
} from "../../src/shared/constants.js";

import {
  toSlug,
  GENRE_SLUG_MAP,
  GENRE_SYNONYMS,
  genreToSlug,
} from "../../src/shared/slugs.js";

import {
  parseList,
  isSeriesType,
  formatRuntime,
  formatModalDuration,
  formatYear,
  getTitleLengthClass,
  calculateAverageStars,
  formatVotesUnified,
  preserveHyphenatedWords,
  getPosterUrl,
  sanitizeExternalUrl,
  computePersonAgeInfo,
  MIN_STAR_THRESHOLD,
} from "../../src/shared/formatters.js";

export {
  POSTER_BASE_URL,
  STUDIO_DATA,
  SHARED_CONFIG,
  MIN_STAR_THRESHOLD,
  toSlug,
  GENRE_SLUG_MAP,
  GENRE_SYNONYMS,
  genreToSlug,
  parseList,
  isSeriesType,
  formatRuntime,
  formatModalDuration,
  formatYear,
  getTitleLengthClass,
  calculateAverageStars,
  formatVotesUnified,
  preserveHyphenatedWords,
  getPosterUrl,
  sanitizeExternalUrl,
  computePersonAgeInfo,
};

export const MOVIE_PROJECTION = [
  'id',
  'title',
  'original_title',
  'slug',
  'year',
  'year_end',
  'type',
  'genres_list',
  'directors_list',
  'actors_list',
  'studios_list',
  'synopsis',
  'minutes',
  'episodes',
  'fa_id',
  'fa_rating',
  'fa_votes',
  'imdb_id',
  'imdb_rating',
  'imdb_votes',
  'avg_rating',
  'thumbhash_st',
  'wikipedia',
  'justwatch',
  'countries(name, code)',
].join(', ');

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const SQRT_MAX_VOTES = {
  FA: Math.sqrt(220000),
  IMDB: Math.sqrt(3200000)
};

export function computeRatingPresentation(movie) {
  const isSuspenso = typeof movie.avg_rating === 'number' && movie.avg_rating > 0 && movie.avg_rating <= MIN_STAR_THRESHOLD;
  const avgStars = calculateAverageStars(movie.avg_rating);
  const clip1 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 0))) * 100;
  const clip2 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 1))) * 100;
  const clip3 = isSuspenso ? 100 : (1 - Math.max(0, Math.min(1, avgStars - 2))) * 100;

  const faBarWidth = movie.fa_votes ? Math.min(100, (Math.sqrt(movie.fa_votes) / SQRT_MAX_VOTES.FA) * 100) : 0;
  const imdbBarWidth = movie.imdb_votes ? Math.min(100, (Math.sqrt(movie.imdb_votes) / SQRT_MAX_VOTES.IMDB) * 100) : 0;
  const formattedFaVotes = formatVotesUnified(movie.fa_votes);
  const formattedImdbVotes = formatVotesUnified(movie.imdb_votes);

  return {
    isSuspenso,
    avgStars,
    clip1,
    clip2,
    clip3,
    faBarWidth,
    imdbBarWidth,
    formattedFaVotes,
    formattedImdbVotes
  };
}

export function buildItemListSchema(items, siteOrigin) {
  return {
    "@type": "ItemList",
    "numberOfItems": items.length,
    "itemListElement": items.map((m, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": isSeriesType(m.type) ? "TVSeries" : "Movie",
        "name": m.title || m.original_title,
        "url": `${siteOrigin}/titulo/${m.slug}/`,
        "image": `${siteOrigin}${getPosterUrl(m)}`,
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
  };
}

export const SPECULATION_RULES = {
  prerender: [
    {
      source: "list",
      urls: ["/"]
    },
    {
      where: {
        and: [
          {
            or: [
              { href_matches: "/*\\?movie=*" },
              { href_matches: "/*\\?_p=*" },
              { href_matches: "/*\\?year=*" },
              { href_matches: "/director/*" },
              { href_matches: "/actor/*" },
              { href_matches: "/genero/*" },
              { href_matches: "/pais/*" },
              { href_matches: "/seleccion/*" },
              { href_matches: "/estudio/*" }
            ]
          },
          { not: { href_matches: "/*#*" } }
        ]
      },
      eagerness: "moderate"
    }
  ]
};

/**
 * Envuelve palabras y unidades de duración/episodios en spans con clase .meta-unit
 * para replicar la modulación tipográfica de la modal SPA (-20% font-weight).
 */
export function formatMetaUnitsHtml(text) {
  if (!text) return '';
  const regex = /([a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\.)?)/g;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(text.substring(lastIndex, match.index));
    }
    result += `<span class="meta-unit">${escapeHtml(match[0])}</span>`;
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    result += escapeHtml(text.substring(lastIndex));
  }
  return result;
}
