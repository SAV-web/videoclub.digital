/**
 * =================================================================
 *   SEO TYPES & HELPERS (cloudflare/seo/seo-types.js)
 * =================================================================
 * Funciones puras de formateo, proyección de base de datos y utilidades
 * de seguridad para el renderer SEO en Edge.
 */

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
  'wikipedia',
  'justwatch',
  'countries(name, code)',
].join(', ');

export const POSTER_BASE_URL = "/posters/";

export const STUDIO_DATA = {
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

export const OFFICIAL_GENRES = [
  "Acción", "Animación", "Aventuras", "Bélico", "Biografía", "Noir",
  "Comedia", "Crimen", "Deporte", "Documental", "Drama", "Familiar",
  "Fantasía", "Histórico", "Intriga", "Música", "Romance", "Sci-Fi",
  "Terror", "Thriller", "Western"
];

export function toSlug(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const GENRE_SLUG_MAP = Object.fromEntries(
  OFFICIAL_GENRES.map(g => [toSlug(g), g])
);

export function genreToSlug(name) {
  if (!name) return null;
  const s = toSlug(name);
  return GENRE_SLUG_MAP[s] ? s : null;
}

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

export function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(s => String(s).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function isSeriesType(type) {
  return Boolean(type && String(type).trim().toLowerCase().startsWith('s'));
}

export function formatRuntime(minutes, isSeries = false) {
  const num = typeof minutes === 'number' ? minutes : parseInt(String(minutes || 0), 10);
  if (!num || isNaN(num) || num <= 0) {
    return isSeries ? 'Serie TV' : 'Película';
  }
  if (isSeries) {
    return `${num}′`;
  }
  const hrs = Math.floor(num / 60);
  const mins = num % 60;
  if (hrs === 0) return `${mins} m`;
  if (mins === 0) return `${hrs} h`;
  return `${hrs} h ${mins} m`;
}

export function formatYear(year, yearEnd, isSeries = false, fallback = '', type = '') {
  if (!year) return fallback;
  const text = String(year);
  const typeUpper = (type || '').toUpperCase().trim();
  const isMini = typeUpper === 'SM' || typeUpper === 'SAM' || typeUpper === 'SDM' || String(yearEnd).trim().toUpperCase() === 'M';
  const isOngoing = (typeUpper.startsWith('S') && typeUpper.endsWith('-')) || String(yearEnd).trim().toLowerCase() === 'current' || String(yearEnd).trim().toLowerCase() === 'present' || String(yearEnd).trim().toLowerCase() === 'actualidad' || String(yearEnd).trim() === '-';

  if (isSeries) {
    if (isOngoing) return `${text}-`;
    if (yearEnd && String(yearEnd).trim() !== 'M' && String(yearEnd).trim() !== '') {
      const normEnd = String(yearEnd).trim();
      const endSuffix = normEnd.length === 4 ? normEnd.slice(-2) : normEnd;
      const formatted = `${text}-${endSuffix}`;
      return isMini ? `${formatted} (M)` : formatted;
    }
    if (isMini) return `${text} (M)`;
  }
  return text;
}

export function getTitleLengthClass(title) {
  if (!title) return '';
  const len = title.length;
  if (len > 70) return 'title-xxxl-long';
  if (len > 50) return 'title-xxl-long';
  if (len > 35) return 'title-xl-long';
  if (len > 25) return 'title-long';
  if (len > 15) return 'title-medium';
  return '';
}

export const MIN_STAR_THRESHOLD = 5.5;

export function calculateAverageStars(averageRating) {
  if (averageRating === null || averageRating === undefined || averageRating <= MIN_STAR_THRESHOLD) return 0;
  if (averageRating >= 9) return 3;
  return ((averageRating - MIN_STAR_THRESHOLD) / 3.5) * 3;
}

export function formatVotesUnified(votes) {
  if (votes === null || votes === undefined || votes === '') return '';
  const numVotes = typeof votes === 'number' ? votes : parseInt(String(votes).replace(/\D/g, ''), 10);
  if (!numVotes || isNaN(numVotes) || numVotes <= 0) return '';

  if (numVotes >= 1000000) {
    const roundedThousand = Math.round(numVotes / 1000) * 1000;
    const millions = Math.round(roundedThousand / 10000) / 100;
    const formatted = String(millions).replace('.', ',');
    return `${formatted} M`;
  }
  if (numVotes >= 100000) {
    const k = Math.round(numVotes / 1000);
    if (k >= 1000) return '1 M';
    return `${k} k`;
  }
  if (numVotes >= 10000) {
    const rounded = Math.round(numVotes / 500) * 500;
    if (rounded >= 100000) return `${rounded / 1000} k`;
    return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  if (numVotes >= 1000) {
    const rounded = Math.round(numVotes / 100) * 100;
    return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  if (numVotes >= 100) {
    const rounded = Math.round(numVotes / 50) * 50;
    return String(rounded);
  }
  return '100';
}

export function preserveHyphenatedWords(text) {
  if (!text) return '';
  const sanitized = text.replace(/\s+([,.:;!?])/g, '$1');
  return sanitized.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])-(?=[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])/g, '$1\u2011');
}

export function getPosterUrl(movie) {
  if (!movie || !movie.slug) return '';
  return `${POSTER_BASE_URL}${movie.slug}.webp`;
}
