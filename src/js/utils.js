// =================================================================
//                      FUNCIONES DE UTILIDAD (OPTIMIZADO)
// =================================================================
import { CONFIG } from "./constants.js";
import flagSpriteUrl from "../flags.svg";

// =================================================================
//          REGLAS DE NEGOCIO (Domain Logic / Contracts)
// =================================================================

/**
 * Comprueba si el tipo de medio corresponde a una serie.
 * @param {string} type - Tipo de medio (ej. 'S', 'S-MINI')
 * @returns {boolean}
 */
export const isMovieSeries = (type) => Boolean(type && String(type).toUpperCase().startsWith("S"));

/**
 * Formatea el rango de años de una obra.
 * @param {string|number} year - Año de inicio
 * @param {string|number} yearEnd - Año de fin (para series)
 * @param {boolean} isSeries - Si es serie o película
 * @param {string} fallback - Texto a mostrar si no hay año
 * @returns {string} Rango formateado (ej. "2010-15")
 */
export const formatYearRange = (year, yearEnd, isSeries, fallback = "N/A") => {
  let text = year ? String(year) : fallback;
  if (isSeries && yearEnd) {
    text += yearEnd === "M" ? " (M)" : (yearEnd === "-" ? "-" : `-${String(yearEnd).slice(-2)}`);
  }
  return text;
};

/**
 * Genera la URL completa hacia el póster en alta calidad en Supabase.
 * @param {string} imagePath - Identificador de la imagen
 * @returns {string}
 */
export const getHqPosterUrl = (imagePath) => {
  if (!imagePath || imagePath === ".") return "";
  return `${CONFIG.POSTER_BASE_URL}${imagePath}.webp`;
};

/**
 * Mapea el payload crudo de la API a un objeto enriquecido para el Frontend.
 * @param {Object} movie - Objeto crudo de la base de datos
 * @returns {Object} Objeto enriquecido y formateado
 */
export function mapMoviePayload(movie) {
  if (!movie) return movie;
  const isSeries = isMovieSeries(movie.type);
  const actualOriginalTitle = (movie.original_title && movie.original_title.trim() && movie.original_title.toLowerCase() !== movie.title.toLowerCase()) ? movie.original_title : movie.title;
  
  return {
    ...movie,
    isSeries,
    displayYear: formatYearRange(movie.year, movie.year_end, isSeries, "N/A"),
    posterUrl: getHqPosterUrl(movie.image),
    displayOriginalTitle: actualOriginalTitle,
    hasOriginalTitle: actualOriginalTitle !== movie.title,
    hasCritic: Boolean(movie.critic && movie.critic.trim()),
    displayEpisodes: isSeries && movie.episodes ? `${movie.episodes} x` : "",
    parsedActors: movie.actors ? movie.actors.split(",").map(a => a.trim()) : [],
    parsedDirectors: movie.directors ? movie.directors.split(",").map(d => d.trim()) : [],
    studioList: movie.studios_list ? movie.studios_list.split(",") : []
  };
}

// =================================================================
//          1. FORMATO DE DATOS (High Performance)
// =================================================================

// Cache para Intl.NumberFormat (Es costoso instanciarlo cada vez)
const compactFormatter = new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 });
const thousandsFormatter = new Intl.NumberFormat('de-DE'); // Coherencia de locale (usa puntos para miles igual)

/**
 * Formatea votos con reglas específicas por plataforma para UI (Ej: 1,5 M, 251 k).
 * @param {number|string} votes
 * @param {string} [platform] - 'imdb' o 'fa' para aplicar redondeo específico.
 */
export const formatVotesUnified = (votes, platform) => {
  // Conversión numérica rápida
  const numVotes = typeof votes === 'number' ? votes : parseInt(String(votes).replace(/\D/g, ""), 10);
  
  if (!numVotes || isNaN(numVotes)) return "";

  // 1. Millones (Ej: 1,5 M)
  if (numVotes >= 1000000) {
    return compactFormatter.format(numVotes).replace("M", " M");
  }

  // 2. Miles altos (Ej: 251 k)
  if (numVotes >= 100000) {
    return `${Math.floor(numVotes / 1000)} k`;
  }

  // 3. Menores de 1000
  if (numVotes < 1000) {
    // Redondeo a la decena
    const rounded = Math.round(numVotes / 10) * 10;
    return thousandsFormatter.format(rounded);
  }

  // 4. Menores de 3000
  if (numVotes < 3000) {
    // Redondeo a centena
    const rounded = Math.ceil(numVotes / 100) * 100;
    return thousandsFormatter.format(rounded);
  }

  if (platform === 'imdb') {
    // Redondeo al millar (IMDb style)
    const rounded = Math.ceil(numVotes / 1000) * 1000;
    return thousandsFormatter.format(rounded);
  }
  
  if (platform === 'fa') {
    // Redondeo a centena (FA style)
    const rounded = Math.ceil(numVotes / 100) * 100;
    return thousandsFormatter.format(rounded);
  }

  // Fallback
  return thousandsFormatter.format(numVotes);
};

/**
 * Convierte los minutos a un formato de horas y minutos amigable.
 * @param {string|number} minutesString 
 * @param {boolean} useShortLabel - Si es true devuelve "120'"
 * @returns {string} Ej: "2h 30min"
 */
export const formatRuntime = (minutesString, useShortLabel = false) => {
  const minutes = +minutesString; // Conversión unaria rápida
  // Validación robusta: Evitar NaN, Infinity o valores <= 0
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  
  if (useShortLabel) return `${minutes}'`;

  const h = (minutes / 60) | 0; // Math.floor bitwise (más rápido para enteros positivos)
  const m = minutes % 60;

  if (h > 0 && m === 0) return `${h}h`; 
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

/**
 * Normaliza texto eliminando acentos y mayúsculas para búsquedas y comparaciones.
 * @param {string} text 
 * @returns {string}
 */
export const normalizeText = (text) => {
  if (!text) return "";
  // Eliminamos reemplazos específicos de género para evitar efectos secundarios en nombres (ej: "Juan Negro" -> "Juan Noir")
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

/**
 * Normalización ESPECÍFICA para Géneros.
 * Mapea sinónimos comunes hacia un slug único (ej: "ciencia ficcion" -> "scifi").
 * @param {string} text 
 * @returns {string}
 */
export const normalizeGenreText = (text) => {
  if (!text) return "";
  let norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Lista de reemplazos (Ordenada por especificidad)
  const replacements = [
    // Sci-Fi
    { p: /scifi|ciencia[\s-]?ficcion|futurista|distopia/g, r: "scifi" },
    // Noir
    { p: /filmnoir|negro|neo[\s-]?noir/g, r: "noir" },
    // Action
    { p: /action|adrenalina/g, r: "accion" },
    // Adventure
    { p: /adventure|epico/g, r: "aventuras" },
    // Animation
    { p: /animation|animado|dibujos|cgi/g, r: "animacion" },
    // Biography
    { p: /biography|biografico|biopic/g, r: "biografia" },
    // Comedy
    { p: /comedy|humor|comico/g, r: "comedia" },
    // Crime
    { p: /crime|policiaco|policial|criminal|delito|mafia/g, r: "crimen" },
    // Documentary
    { p: /documentary/g, r: "documental" },
    // Drama
    { p: /dramatico/g, r: "drama" },
    // Family
    { p: /family/g, r: "familiar" },
    // Fantasy
    { p: /fantasy|fantastico/g, r: "fantasia" },
    // History
    { p: /history|epoca/g, r: "historico" },
    // Horror
    { p: /horror|miedo/g, r: "terror" },
    // Music (Cuidado con 'musical')
    { p: /music\b/g, r: "musica" }, 
    // Musical
    { p: /canciones/g, r: "musical" },
    // Mystery
    { p: /mystery|misterio|enigma|investigacion/g, r: "intriga" },
    // Romance
    { p: /love|romantico|amor/g, r: "romance" },
    // Short
    { p: /short|cortometraje/g, r: "corto" },
    // Sport
    { p: /sport/g, r: "deporte" },
    // Thriller
    { p: /suspense|psicologico|tension/g, r: "thriller" },
    // War
    { p: /war|guerra/g, r: "belico" },
    // Western
    { p: /oeste|vaqueros/g, r: "western" }
  ];

  for (const { p, r } of replacements) {
    norm = norm.replace(p, r);
  }

  return norm.trim();
};

/**
 * Resalta de forma insensible a mayúsculas y acentos un término de búsqueda.
 * Utiliza un DocumentFragment para máximo rendimiento en renderizado.
 * @param {string} text - Texto original
 * @param {string} searchTerm - Término a buscar
 * @returns {Node} Nodo de texto o Fragmento con el término resaltado en <strong>
 */
export const highlightAccentInsensitive = (text, searchTerm) => {
  if (!text) return document.createTextNode("");
  if (!searchTerm) return document.createTextNode(text);

  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);
  const index = normalizedText.indexOf(normalizedSearch);
  
  if (index === -1) return document.createTextNode(text);
  
  const fragment = document.createDocumentFragment();
  fragment.appendChild(document.createTextNode(text.substring(0, index)));
  
  const strong = document.createElement("strong");
  strong.textContent = text.substring(index, index + searchTerm.length);
  fragment.appendChild(strong);
  
  fragment.appendChild(document.createTextNode(text.substring(index + searchTerm.length)));
  
  return fragment;
};

/**
 * Capitaliza la primera letra de cada palabra.
 * @param {string} str 
 */
export const capitalizeWords = (str) => {
  if (!str) return "";
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

// =================================================================
//          2. CONTROL DE FLUJO Y RED
// =================================================================

/**
 * Limita la frecuencia de ejecución de una función.
 * Incluye un método .cancel() para abortar ejecuciones pendientes.
 * @param {Function} func - Función a ejecutar
 * @param {number} delay - Retraso en milisegundos
 * @returns {Function} Función debounced
 */
export const debounce = (func, delay) => {
  let timeout;
  const debounced = function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

/**
 * Transforma un error técnico en un mensaje amigable para el usuario.
 * @param {Error} error 
 * @returns {string|null}
 */
export function getFriendlyErrorMessage(error) {
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return "Error de conexión. Comprueba tu internet.";
  }
  if (error.name === "AbortError") return null;
  return "Ha ocurrido un error inesperado. Inténtalo más tarde.";
}

// Gestor de Peticiones (Request Manager)
const requestControllers = new Map();

/**
 * Crea o reinicia un AbortController para cancelar peticiones previas redundantes.
 * @param {string} key - Identificador de la petición
 * @returns {AbortController}
 */
export function createAbortableRequest(key) {
  const existing = requestControllers.get(key);
  if (existing) {
    existing.abort();
    requestControllers.delete(key);
  }
  
  const controller = new AbortController();
  requestControllers.set(key, controller);
  
  return controller;
}

// =================================================================
//          3. MANIPULACIÓN DEL DOM (OPTIMIZADA)
// =================================================================

/**
 * Inyecta el SVG de la bandera de un país de forma segura mediante sprites.
 * @param {HTMLElement} container - Contenedor a mostrar/ocultar
 * @param {HTMLElement} flagSpan - Elemento donde inyectar el SVG
 * @param {string} countryCode - Código ISO del país
 * @param {string} countryName - Nombre para el atributo title (accesibilidad)
 */
export function renderCountryFlag(container, flagSpan, countryCode, countryName = "") {
  if (!container || !flagSpan) return;
  
  if (countryCode) {
    const code = countryCode.toLowerCase();
    container.style.display = "flex"; // Evita reflow si ya estaba flex
    flagSpan.className = "country-flag-icon";
    flagSpan.title = countryName || "";
    
    // Limpieza y SVG Seguro (Evita XSS si countryCode viniera corrupto)
    flagSpan.textContent = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `${flagSpriteUrl}#flag-${code}`);
    svg.appendChild(use);
    flagSpan.appendChild(svg);
  } else {
    container.style.display = "none";
  }
}

/**
 * Creador de elementos DOM hiper-optimizado.
 * Destructura las propiedades especiales para poder hacer asignación directa del resto.
 * @param {string} tag - Etiqueta HTML (div, span, etc.)
 * @param {Object} options - Propiedades, atributos y dataset
 * @returns {HTMLElement}
 */
export function createElement(tag, { dataset, attributes, style, ...props } = {}) {
  const element = document.createElement(tag);
  
  // Asignación ultra-rápida de propiedades nativas (className, textContent, id, etc.)
  for (const key in props) {
    element[key] = props[key];
  }
  
  // Corrección: Soporte seguro para estilos inline pasados como string
  if (style) element.style.cssText = style;
  
  // Dataset (data-*)
  if (dataset) {
    for (const key in dataset) element.dataset[key] = dataset[key];
  }
  
  // Atributos genéricos (role, aria-*, etc.)
  if (attributes) {
    for (const key in attributes) element.setAttribute(key, attributes[key]);
  }
  
  return element;
}

/**
 * Dispara una animación de 'pop' CSS forzando un reflow si es necesario.
 * @param {HTMLElement} element 
 */
export const triggerPopAnimation = (element) => {
  if (!element) return;
  
  // Optimización: Evitar reflow (layout thrashing) si no es estrictamente necesario.
  // Solo forzamos el reinicio (remove -> reflow -> add) si la animación ya está corriendo.
  if (element.classList.contains("pop-animation")) {
    element.classList.remove("pop-animation");
    void element.offsetWidth; // Forzar Reflow
  }
  
  element.classList.add("pop-animation");
  
  // Usar { once: true } evita tener que eliminar el listener manualmente
  element.addEventListener("animationend", () => element.classList.remove("pop-animation"), { once: true });
};

/**
 * Inyecta un `<link rel="preload">` dinámico para la imagen principal (LCP).
 * Mejora radicalmente las métricas de Core Web Vitals.
 * @param {Object} movieData 
 */
export function preloadLcpImage(movieData) {
  if (!movieData) return;
  
  const imageUrl = movieData.posterUrl || getHqPosterUrl(movieData.image);
  if (!imageUrl) return;

  // Evitar duplicados
  if (document.querySelector(`link[rel="preload"][href="${imageUrl}"]`)) return;

  const link = document.createElement("link");
  link.rel = "preload"; 
  link.as = "image"; 
  link.href = imageUrl;
  link.setAttribute("fetchpriority", "high"); // Clave para LCP
  
  document.head.appendChild(link);
}

// =================================================================
//          4. FEEDBACK HÁPTICO (VIBRACIÓN)
// =================================================================

const canVibrate = "vibrate" in navigator;

/**
 * Dispara vibraciones hápticas nativas en móviles.
 * Respeta la configuración de accesibilidad del usuario.
 * @param {string} style - Intensidad ('light', 'medium', 'success')
 */
export function triggerHapticFeedback(style = "light") {
  if (!canVibrate) return;
  
  // Respetar preferencia de usuario (Accesibilidad)
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  
  try {
    switch (style) {
      case "light": navigator.vibrate(10); break;
      case "medium": navigator.vibrate(20); break;
      case "success": navigator.vibrate([10, 30, 10]); break; // Patrón distintivo
    }
  } catch (e) { /* Ignorar errores en entornos restringidos */ }
}

// =================================================================
//          5. STORAGE SEGURO (VERSIONADO)
// =================================================================

/**
 * Envoltorio seguro para localStorage con control de versiones.
 * Previene errores de parseo y vacía cachés incompatibles automáticamente.
 */
export const LocalStore = {
  get(key) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      // Verificación estricta de estructura y versión
      if (parsed && typeof parsed === 'object' && parsed.v === CONFIG.STORAGE_VERSION && 'd' in parsed) {
        return parsed.d;
      }
      return null; // Datos inválidos o versión antigua
    } catch (e) { return null; }
  },

  set(key, value) {
    try {
      const payload = { v: CONFIG.STORAGE_VERSION, d: value };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { 
      if (import.meta.env.DEV) console.warn("Storage full or disabled", e); 
    }
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* Ignorar */ }
  }
};

// =================================================================
//          6. SCHEDULING (Rendimiento)
// =================================================================

/**
 * Programa una tarea pesada dividiendo la carga de trabajo en el hilo principal.
 * Usa la moderna API Scheduler si está disponible, con fallback a requestIdleCallback.
 * @param {Function} task - Tarea a ejecutar
 * @param {string} priority - Prioridad ('user-visible', 'background', etc.)
 * @returns {Promise}
 */
export function scheduleWork(task, priority = 'user-visible') {
  if ('scheduler' in window && window.scheduler.postTask) {
    return window.scheduler.postTask(task, { priority });
  }
  // Fallback con requestIdleCallback
  return new Promise(resolve => {
    const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    idleCallback(() => resolve(task()), { timeout: 300 });
  });
}

// =================================================================
//          7. ANIMACIONES Y TRANSICIONES (View Transitions API)
// =================================================================

/**
 * Ejecuta un cambio de DOM con View Transitions si el navegador lo soporta
 * y el usuario no tiene activada la preferencia de movimiento reducido (a11y).
 */
export function executeViewTransition(updateDomCallback) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  if (!document.startViewTransition || prefersReducedMotion) {
    updateDomCallback();
    // Retornamos un "mock" de la API para que los métodos .finished y .ready no rompan el código
    const resolved = Promise.resolve();
    return { finished: resolved, ready: resolved, updateCallbackDone: resolved };
  }
  
  return document.startViewTransition(updateDomCallback);
}