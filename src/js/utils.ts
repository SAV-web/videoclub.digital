/// <reference types="vite/client" />



// =================================================================
//                 CAJA DE HERRAMIENTAS (Utils)
// =================================================================
// Funciones puras y rápidas que se usan por toda la web.
// =================================================================

import { CONFIG } from "./constants.js";
import { ERROR_CODES } from "./contracts.js";
import flagSpriteUrl from "../flags.svg";
import { Movie, MappedMovie } from "./types.js";

// =================================================================
//          1. PREPARAR DATOS DE PELÍCULAS
// =================================================================

// ¿Es una serie? (Miramos si empieza por 'S' o 's')
export const isMovieSeries = (type: string | null | undefined): boolean => 
  type?.[0]?.toLowerCase() === 's';

// Pone bonito el rango de años (ej: "2010-15" o "2020 (M)")
export const formatYearRange = (
  year: number | string | null | undefined, 
  yearEnd: string | null | undefined, 
  isSeries: boolean, 
  fallback: string = "N/A"
): string => {
  let text = year ? String(year) : fallback;
  if (isSeries && yearEnd) {
    text += yearEnd === "M" ? " (M)" : (yearEnd === "-" ? " -" : `-${String(yearEnd).slice(-2)}`);
  }
  return text;
};

/**
 * Convierte una cadena de filtro de año (ej: "1980-2020", "1995" o null) en una tupla [minYear, maxYear].
 */
export function parseYearRangeRaw(yearStr: string | null | undefined): [number, number] {
  if (!yearStr || !yearStr.trim()) return [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX];
  const parts = yearStr.split("-").map(Number);
  const min = isNaN(parts[0]) ? CONFIG.YEAR_MIN : parts[0];
  const max = parts.length > 1 ? (isNaN(parts[1]) ? CONFIG.YEAR_MAX : parts[1]) : min;
  return [min, max];
}

// URL del póster en alta calidad
export const getHqPosterUrl = (img: string | null | undefined): string => 
  img && img !== "." ? `${CONFIG.POSTER_BASE_URL}${img}.webp` : "";

// Coge los datos brutos de la base de datos y los pone bonitos para usarlos en la web
export function mapMoviePayload(movie: Movie): MappedMovie {
  const isSeries = isMovieSeries(movie.type);
  const origTitle = movie.original_title?.trim();
  const title = movie.title || "";
  const hasOrig = !!(origTitle && origTitle.toLowerCase() !== title.toLowerCase());
  
  const genresStr = movie.genres || movie.genres_list || "";
  const directorsStr = movie.directors || movie.directors_list || "";
  const actorsStr = movie.actors || movie.actors_list || "";
  const studiosStr = movie.studios_list || "";

  return {
    ...movie,
    genres: genresStr,
    directors: directorsStr,
    actors: actorsStr,
    isSeries,
    displayYear: formatYearRange(movie.year, movie.year_end, isSeries, "N/A"),
    posterUrl: getHqPosterUrl(movie.image),
    displayOriginalTitle: hasOrig ? origTitle : title,
    hasOriginalTitle: hasOrig,
    displayEpisodes: isSeries && movie.episodes ? `${movie.episodes} x` : "",
    parsedActors: actorsStr ? actorsStr.split(",").map(a => a.trim()).filter(Boolean) : [],
    parsedDirectors: directorsStr ? directorsStr.split(",").map(d => d.trim()).filter(Boolean) : [],
    studioList: studiosStr ? studiosStr.split(",").map(s => s.trim()).filter(Boolean) : []
  } as MappedMovie;
}

// =================================================================
//          2. EL TRADUCTOR (Textos, Números y Tiempos)
// =================================================================

// Creados fuera para ahorrar batería (crearlos es lento)
const compactFormatter = new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 });
const thousandsFormatter = new Intl.NumberFormat('de-DE'); // Usamos 'de-DE' porque usa puntos en los miles (1.000)

// Pone bonitos los números de votos (Ej: 1500000 -> "1,5 M")
export const formatVotesUnified = (votes: number | string | null | undefined, platform?: 'fa' | 'imdb'): string => {
  const numVotes = typeof votes === 'number' ? votes : parseInt(String(votes || "").replace(/\D/g, ""), 10);
  if (!numVotes || isNaN(numVotes)) return "";

  if (numVotes >= 1000000) return compactFormatter.format(numVotes).replace("M", " M");
  if (numVotes >= 100000) return `${Math.floor(numVotes / 1000)} k`;
  
  let rounded = numVotes;
  if (numVotes < 1000) rounded = Math.round(numVotes / 10) * 10;
  else if (numVotes < 3000 || platform === 'fa') rounded = Math.ceil(numVotes / 100) * 100;
  else if (platform === 'imdb') rounded = Math.ceil(numVotes / 1000) * 1000;
  
  return thousandsFormatter.format(rounded);
};

// Pone bonito el tiempo (Ej: 130 -> "2h 10min")
export const formatRuntime = (minutesString: string | number | null | undefined, useShortLabel: boolean = false): string => {
  const minutes = +(minutesString || 0); 
  if (!minutes || minutes <= 0) return "";
  if (useShortLabel) return `${minutes}'`;

  const h = (minutes / 60) | 0; // "| 0" quita los decimales a velocidad luz
  const m = minutes % 60;
  return h ? `${h}h` + (m ? ` ${m}min` : '') : `${m}min`;
};

// --- LIMPIEZA DE TEXTOS Y BÚSQUEDAS ---
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

// Quita acentos y mayúsculas (la 'á' pasa a 'a', 'ø' a 'o', 'æ' a 'ae', etc. igual que PostgreSQL unaccent)
export const normalizeText = (t: string | null | undefined): string => {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ß/g, "ss")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ħ/g, "h")
    .replace(/ŋ/g, "n")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .trim();
};

const GENRES: ReadonlyArray<readonly [RegExp, string]> = [
  [/scifi|ciencia[\s-]?ficcion|futurista|distopia/g, "scifi"], [/filmnoir|negro|neo[\s-]?noir/g, "noir"],
  [/action|adrenalina/g, "accion"], [/adventure|epico/g, "aventuras"], [/animation|animado|dibujos|cgi/g, "animacion"],
  [/biography|biografico|biopic/g, "biografia"], [/comedy|humor|comico/g, "comedia"],
  [/crime|policiaco|policial|criminal|delito|mafia/g, "crimen"], [/documentary/g, "documental"],
  [/dramatico/g, "drama"], [/family/g, "familiar"], [/fantasy|fantastico/g, "fantasia"],
  [/history|epoca/g, "historico"], [/horror|miedo/g, "terror"], [/music\b/g, "musica"],
  [/canciones/g, "musical"], [/mystery|misterio|enigma|investigacion/g, "intriga"],
  [/love|romantico|amor/g, "romance"], [/short|cortometraje/g, "corto"], [/sport/g, "deporte"],
  [/suspense|psicologico|tension/g, "thriller"], [/war|guerra/g, "belico"], [/oeste|vaqueros/g, "western"]
];

// Limpia un género y unifica palabras clave ("ciencia ficcion" -> "scifi")
export const normalizeGenreText = (t: string | null | undefined): string => 
  GENRES.reduce((acc, [p, r]) => acc.replace(p, r), normalizeText(t));

// Protege contra símbolos raros en el buscador (Previene ataques ReDoS)
export const escapeRegExp = (s: string): string => 
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ilumina en negrita lo que has buscado, ignorando si pusiste acentos
export const highlightAccentInsensitive = (
  text: string | null | undefined, 
  searchTerm: string | null | undefined
): DocumentFragment | Text => {
  if (!text) return document.createTextNode("");
  if (!searchTerm) return document.createTextNode(text);

  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);
  const fragment = document.createDocumentFragment();
  const regex = new RegExp(escapeRegExp(normalizedSearch), "gi");
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedText)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
    }
    const strong = document.createElement("strong");
    strong.textContent = text.substring(matchIndex, matchIndex + searchTerm.length);
    fragment.appendChild(strong);
    lastIndex = matchIndex + searchTerm.length;
  }

  if (lastIndex === 0) return document.createTextNode(text);
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  return fragment;
};

// Pone la primera letra en mayúscula
export const capitalizeWords = (str: string | null | undefined): string => 
  str ? str.replace(/\b\w/g, l => l.toUpperCase()) : "";

// =================================================================
//          3. CONTROL DE TRÁFICO (Red y Clics)
// =================================================================

export interface DebouncedFunction<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

// El "Anti-Ametralladora": Espera a que termines de escribir para buscar
export const debounce = <T extends (...args: never[]) => void>(
  func: T, 
  delay: number
): DebouncedFunction<T> => {
  let timeout: number | undefined;
  
  const debounced = function (this: unknown, ...args: Parameters<T>) {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => func.apply(this, args), delay);
  };
  
  debounced.cancel = () => window.clearTimeout(timeout);
  return debounced;
};

// Traduce errores raros en algo que un humano pueda entender
export const getFriendlyErrorMessage = (e: unknown): string | null => {
  const err = e as Record<string, unknown> | null | undefined;
  return err?.name === "AbortError" ? null : 
    err?.code === ERROR_CODES.ABORTED ? null :
    err?.code === ERROR_CODES.AUTH_REQUIRED ? String(err.message) :
    err?.code === ERROR_CODES.CONFIGURATION ? String(err.message) :
    err?.code === ERROR_CODES.DATABASE ? String(err.message) :
    err?.code === ERROR_CODES.VALIDATION ? String(err.message) :
    err?.code === ERROR_CODES.NETWORK ? String(err.message) :
    (typeof err?.message === "string" && err.message.includes("Failed to fetch")) ? "Error de conexión. Revisa tu internet." : 
    "Ha ocurrido un error inesperado. Inténtalo más tarde.";
};

const requestControllers = new Map<string, AbortController>();
// Si pides cargar una página, pero luego pinchas en otra antes de que cargue, cancela la anterior
export function createAbortableRequest(key: string): AbortController {
  requestControllers.get(key)?.abort();
  const controller = new AbortController();
  requestControllers.set(key, controller);
  return controller;
}

// =================================================================
//          4. MANIPULACIÓN VISUAL (DOM, Táctil y CSS)
// =================================================================

// Pinta la banderita del país
export function renderCountryFlag(
  container: HTMLElement | null, 
  flagSpan: HTMLElement | null, 
  countryCode: string | null | undefined, 
  countryName: string = ""
): void {
  if (!container || !flagSpan) return;
  if (countryCode) {
    container.style.display = "flex"; 
    flagSpan.className = "country-flag-icon";
    flagSpan.title = countryName || "";
    flagSpan.textContent = "";
    
    // Creamos SVG seguro contra inyección de código (XSS)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    svg.innerHTML = `<use href="${flagSpriteUrl}#flag-${countryCode.toLowerCase()}"></use>`;
    flagSpan.appendChild(svg);
  } else {
    container.style.display = "none";
  }
}

interface CreateElementOptions {
  dataset?: Record<string, string>;
  attributes?: Record<string, string>;
  style?: string;
  [key: string]: unknown;
}

// Crea HTML rapidísimo usando Object.assign
export function createElement(tag: string, { dataset, attributes, style, ...props }: CreateElementOptions = {}): HTMLElement {
  const el = Object.assign(document.createElement(tag), props);
  if (style) el.style.cssText = style;
  if (dataset) Object.assign(el.dataset, dataset);
  if (attributes) Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// Hace que un botón dé un pequeño "saltito" al pulsarlo
export const triggerPopAnimation = (element: HTMLElement | null): void => {
  if (!element) return;
  element.classList.remove("pop-animation");
  void element.offsetWidth; // Fuerza al navegador a reiniciar la animación
  element.classList.add("pop-animation");
  element.addEventListener("animationend", () => element.classList.remove("pop-animation"), { once: true });
};

// Avisa al navegador para que cargue la primera imagen antes que nada (Mejora el LCP)
export function preloadLcpImage(movieData: Partial<MappedMovie> | null | undefined): void {
  const imageUrl = movieData?.posterUrl || getHqPosterUrl(movieData?.image);
  if (!imageUrl) return;

  if (document.querySelector(`link[rel="preload"][href="${imageUrl}"]`)) return;

  const link = document.createElement("link");
  Object.assign(link, { rel: "preload", as: "image", href: imageUrl });
  link.setAttribute("fetchpriority", "high"); 
  document.head.appendChild(link);
}

const canVibrate = typeof navigator !== 'undefined' && "vibrate" in navigator;
// Vibra el móvil un poquito al tocar botones (si no lo tienes quitado en ajustes)
export function triggerHapticFeedback(style: 'light' | 'medium' | 'success' = "light"): void {
  if (!canVibrate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  
  try {
    switch (style) {
      case "light": navigator.vibrate(10); break;
      case "medium": navigator.vibrate(20); break;
      case "success": navigator.vibrate([10, 30, 10]); break;
    }
  } catch (e) { /* Ignorar errores en entornos restringidos */ }
}

// =================================================================
//          5. LA MEMORIA LOCAL (Segura y Versionada)
// =================================================================

export const LocalStore = {
  get: <T = unknown>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      return (parsed?.v === CONFIG.STORAGE_VERSION) ? (parsed.d as T) : null;
    } catch (e) { return null; }
  },
  set: (key: string, value: unknown): void => {
    try {
      const payload = { v: CONFIG.STORAGE_VERSION, d: value };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { 
      if (import.meta.env.DEV) console.warn("Storage full or disabled", e); 
    }
  },
  remove: (key: string): void => { try { localStorage.removeItem(key); } catch (e) {} }
};

// =================================================================
//          6. RENDIMIENTO MAGISTRAL (Programador de Tareas)
// =================================================================

declare global {
  interface Window {
    scheduler?: {
      postTask<T>(task: () => T, options?: { priority?: 'user-blocking' | 'user-visible' | 'background' }): Promise<T>;
      yield?(): Promise<void>;
    };
  }
  interface Document {
    startViewTransition(updateCallback: () => void): ViewTransition;
  }
}

/**
 * Cede el control del Hilo Principal (Main Thread) al navegador para mantener
 * el scroll fluido y mejorar la métrica INP (Interaction to Next Paint).
 * Utiliza scheduler.yield() si está disponible (Chrome 115+) o cae suavemente a setTimeout.
 */
export async function yieldToMain(): Promise<void> {
  if (typeof document !== 'undefined' && document.hidden) return;

  if (typeof window !== 'undefined' && window.scheduler && typeof window.scheduler.yield === 'function') {
    return window.scheduler.yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Pinta las tarjetas "a trocitos" para que la pantalla nunca se congele
/**
 * Ejecuta una tarea en periodos de inactividad del navegador (idle) o usa setTimeout con el delay de fallback.
 */
export function runWhenIdle(callback: () => void, fallbackDelayMs = 500): void {
  const windowWithIdle = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
  if (typeof windowWithIdle.requestIdleCallback === "function") {
    windowWithIdle.requestIdleCallback(() => callback());
  } else {
    setTimeout(callback, fallbackDelayMs);
  }
}

export function scheduleWork<T>(task: () => T, priority: 'user-blocking' | 'user-visible' | 'background' = 'user-visible'): Promise<T> {
  // En segundo plano (p. ej., durante el scraping de la consola), no retrasamos las tareas sintéticas.
  // No hay interfaz que congelar ni frames que proteger en segundo plano.
  if (typeof document !== 'undefined' && document.hidden) {
    return Promise.resolve(task());
  }

  if (window.scheduler && window.scheduler.postTask) {
    return window.scheduler.postTask(task, { priority });
  }
  // Fallback con requestIdleCallback
  return new Promise(resolve => {
    runWhenIdle(() => resolve(task()), 1);
  });
}

export interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

// Animaciones de Hollywood (cuando pinchas una peli y se hace grande)
export function executeViewTransition(updateDomCallback: () => void): ViewTransition | { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> } {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    updateDomCallback();
    const resolved = Promise.resolve();
    return { finished: resolved, ready: resolved, updateCallbackDone: resolved };
  }
  
  return document.startViewTransition(updateDomCallback);
}

// Calcula el número total de páginas reales tras absorber los elementos huérfanos de la última página (1 o 2 elementos)
export function getAdjustedTotalPages(gridTotalItems: number, baseLimit: number): number {
  if (gridTotalItems === 0) return 0;
  const normalPageCount = Math.ceil(gridTotalItems / baseLimit);
  const lastPageSlots = gridTotalItems % baseLimit || baseLimit;
  const isOrphanPage = normalPageCount > 1 && lastPageSlots <= 2;
  return isOrphanPage ? normalPageCount - 1 : normalPageCount;
}

export interface PersonAgeInfo {
  bYear: string;
  dYear: string;
  datesStr: string;
  ageStr: string;
}

export function computePersonAgeInfo(
  birthday?: string | null,
  deathday?: string | null
): PersonAgeInfo {
  const getYear = (dateStr: string | null | undefined) => dateStr ? dateStr.split('-')[0] : '';
  const bYear = getYear(birthday);
  const dYear = getYear(deathday);

  let ageStr = "";
  if (birthday) {
    const bDate = new Date(birthday);
    const eDate = deathday ? new Date(deathday) : new Date();
    let age = eDate.getFullYear() - bDate.getFullYear();
    const m = eDate.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && eDate.getDate() < bDate.getDate())) age--;
    ageStr = deathday ? `(${age} ✝)` : `(${age})`;
  }

  const datesStr = bYear ? (dYear ? `${bYear}-${dYear}` : `${bYear}-`) : "";

  return { bYear, dYear, datesStr, ageStr };
}

export function applyLengthBasedClass(
  el: HTMLElement | null | undefined,
  text: string | null | undefined,
  thresholds: Array<[number, string]>,
  resetClassName = false
): void {
  if (!el) return;
  if (resetClassName) {
    el.className = "";
  }
  const str = text || "";
  const len = str.length;
  const sorted = [...thresholds].sort((a, b) => b[0] - a[0]);
  for (const [limit, className] of sorted) {
    if (len > limit) {
      el.classList.add(className);
      break;
    }
  }
}
