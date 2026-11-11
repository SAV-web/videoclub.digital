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
} from "../../src/shared/constants.js";

import {
  toSlug,
  GENRE_SLUG_MAP,
  GENRE_SYNONYMS,
  genreToSlug,
  OFFICIAL_GENRES,
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
  OFFICIAL_GENRES,
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

export function escapeAttr(str) {
  return escapeHtml(str);
}

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
