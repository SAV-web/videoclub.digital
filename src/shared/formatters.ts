// =================================================================
//          FORMATEADORES COMPARTIDOS (src/shared/formatters.ts)
// =================================================================
// Funciones puras de formateo y cálculo compartidas entre SPA y Astro.
// =================================================================

import { POSTER_BASE_URL } from "./constants.js";

/**
 * Obtiene la URL completa del póster WebP optimizado.
 * Respeta el centinela '.' utilizado en base de datos para películas sin póster.
 */
export function getPosterUrl(image: string | null | undefined): string {
  if (!image || image === ".") return "";
  return `${POSTER_BASE_URL}${image}.webp`;
}

/**
 * Convierte un texto separado por comas ("Drama, Suspense") en un array de strings limpios.
 */
export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Formatea el conteo de votos separando con un espacio las unidades k y M (ej: "161 k", "2.8 M").
 */
export function formatVotesUnified(votes: number | string | null | undefined): string {
  if (votes === null || votes === undefined || votes === '') return '';
  const numVotes = typeof votes === 'number' ? votes : parseInt(String(votes).replace(/\D/g, ''), 10);
  if (!numVotes || isNaN(numVotes)) return '';

  if (numVotes >= 1000000) {
    const millions = (numVotes / 1000000).toFixed(1);
    return `${millions.endsWith('.0') ? millions.slice(0, -2) : millions} M`;
  }
  if (numVotes >= 1000) {
    return `${Math.round(numVotes / 1000)} k`;
  }
  return String(numVotes);
}


/**
 * Reemplaza guiones dentro de palabras ("Sci-Fi", "Gordon-Levitt", "Day-Lewis")
 * por guiones no divisibles (U+2011) para evitar que salten de línea por la mitad.
 */
export function preserveHyphenatedWords(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])-(?=[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9])/g, "$1\u2011");
}

/**
 * Determina si el registro corresponde a una Serie de TV.
 */
export function isSeriesType(type: string | null | undefined): boolean {
  return Boolean(type && String(type).trim().toLowerCase().startsWith("s"));
}

/**
 * Formatea la duración en minutos a un texto legible ("1 h 45 m", "45 min/ep", etc.).
 */
export function formatRuntime(minutes: string | number | null | undefined, isSeries: boolean = false): string {
  const num = typeof minutes === "number" ? minutes : parseInt(String(minutes || 0), 10);
  if (!num || isNaN(num) || num <= 0) {
    return isSeries ? "Serie TV" : "Película";
  }
  if (isSeries) {
    return `${num} min/ep`;
  }
  const hrs = Math.floor(num / 60);
  const mins = num % 60;
  if (hrs === 0) return `${mins} m`;
  if (mins === 0) return `${hrs} h`;
  return `${hrs} h ${mins} m`;
}

/**
 * Formatea el año o rango de años de emisión de una película o serie.
 */
export function formatYear(
  year: number | string | null | undefined,
  yearEnd: string | null | undefined,
  isSeries: boolean = false,
  fallback: string = ""
): string {
  if (!year) return fallback;
  const text = String(year);
  if (isSeries && yearEnd) {
    const normEnd = String(yearEnd).trim().toLowerCase();
    if (normEnd === "current" || normEnd === "present" || normEnd === "actualidad" || normEnd === "-") {
      return `${text}-`;
    }
    if (normEnd === "m") {
      return `${text} (M)`;
    }
    const endSuffix = normEnd.length === 4 ? normEnd.slice(-2) : normEnd;
    return `${text}-${endSuffix}`;
  }
  return text;
}

/**
 * Devuelve la clase CSS correspondiente según la longitud del título (para Modal y fichas SSG).
 */
export function getTitleLengthClass(title: string | null | undefined): string {
  if (!title) return "";
  const len = title.length;
  if (len > 70) return "title-xxxl-long";
  if (len > 50) return "title-xxl-long";
  if (len > 35) return "title-xl-long";
  if (len > 25) return "title-long";
  if (len > 15) return "title-medium";
  return "";
}

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

/**
 * Normaliza cadenas de texto eliminando acentos, caracteres especiales internacionales
 * y convirtiendo a minúsculas para búsquedas y comparaciones consistentes.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[ß]/g, "ss")
    .replace(/[ðÐ]/g, "d")
    .replace(/[þÞ]/g, "th")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .replace(/[ħĦ]/g, "h")
    .replace(/[ŋŊ]/g, "n")
    .replace(/[ıI]/g, "i")
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .trim()
    .replace(/\s+/g, " ");
}

export const MIN_STAR_THRESHOLD = 5.5;
export const LEVEL_TO_RATING_MAP = [5, 7, 9] as const;

/**
 * Convierte la nota numérica de usuario (1-10) al número discreto de estrellas visuales (0-3).
 */
export function calculateUserStars(rating: number | null | undefined): number {
  if (!rating) return 0;
  if (rating >= 9) return 3;
  if (rating >= 7) return 2;
  if (rating >= 5) return 1;
  return 0;
}

/**
 * Convierte una nota media continua (0-10) en un valor de llenado de 3 estrellas (0.0 a 3.0).
 */
export function calculateAverageStars(averageRating: number | null | undefined): number {
  if (averageRating === null || averageRating === undefined || averageRating <= MIN_STAR_THRESHOLD) return 0;
  if (averageRating >= 9) return 3;
  return ((averageRating - MIN_STAR_THRESHOLD) / 3.5) * 3;
}

/**
 * Calcula el promedio ponderado entre FilmAffinity e IMDb.
 * Fórmula de negocio: ((FA + 0.5) + (IMDb - 0.3)) / 2.0
 */
export function calculateWeightedAverageRating(
  faRating: number | null | undefined,
  imdbRating: number | null | undefined
): number | null {
  if (
    faRating !== null &&
    faRating !== undefined &&
    faRating > 0 &&
    imdbRating !== null &&
    imdbRating !== undefined &&
    imdbRating > 0
  ) {
    const avg = (faRating + 0.5 + (imdbRating - 0.3)) / 2.0;
    return Math.round(avg * 10) / 10;
  }
  return null;
}

export interface PersonAgeInfo {
  bYear: string;
  dYear: string;
  datesStr: string;
  ageStr: string;
}

/**
 * Calcula la información cronológica y edad de personas (vivas o fallecidas).
 */
export function computePersonAgeInfo(
  birthday: string | null | undefined,
  deathday: string | null | undefined
): PersonAgeInfo {
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
      if (m < 0 || (m === 0 && deathDate.getUTCDate() < birthDate.getUTCDate())) {
        diff--;
      }
      age = diff;
    }
  }

  if (!isDeceased) {
    const now = new Date();
    let diff = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = now.getUTCMonth() - birthDate.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
      diff--;
    }
    age = diff;
  }

  const datesStr = isDeceased ? `${bYear}-${dYear}` : `${bYear}-`;
  const ageStr = isDeceased ? `(${age} ✝)` : `(${age})`;

  return { bYear, dYear, datesStr, ageStr };
}
