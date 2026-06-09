// =================================================================
// FUNCIONES DE UTILIDAD (NUESTRAS HERRAMIENTAS PURAS)
// Este archivo es como una caja de herramientas. Contiene funciones que hacen
// una sola tarea (formatear fechas, quitar acentos, crear botones...).
// Como se usan miles de veces por segundo, están escritas con trucos avanzados 
// de JavaScript para consumir el mínimo de memoria y batería en los móviles.
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
// TRUCO: En lugar de convertir todo el texto a mayúsculas (lo que gasta memoria extra),
// miramos directamente la primera letra (posición [0]) para ver si es una 's' o 'S'.
export const isMovieSeries = (type) => Boolean(type && (type[0] === 'S' || type[0] === 's'));

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
    displayEpisodes: isSeries && movie.episodes ? `${movie.episodes} x` : "",
    parsedActors: movie.actors ? movie.actors.split(",").map(a => a.trim()) : [],
    parsedDirectors: movie.directors ? movie.directors.split(",").map(d => d.trim()) : [],
    studioList: movie.studios_list ? movie.studios_list.split(",") : []
  };
}

// =================================================================
//          1. FORMATO DE DATOS (High Performance)
// =================================================================

// TRUCO: Construir un formateador de números es un proceso muy lento para el navegador.
// Lo construimos una sola vez aquí fuera y lo reutilizamos, en lugar de crearlo en cada tarjeta.
const compactFormatter = new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 });
const thousandsFormatter = new Intl.NumberFormat('de-DE'); // Usamos 'de-DE' porque usa puntos en los miles (1.000)

/**
 * Convierte números largos en textos legibles (Ej: 1500000 -> "1,5 M", o 251000 -> "251 k").
 * @param {number|string} votes
 * @param {string} [platform] - 'imdb' o 'fa' para aplicar redondeo específico.
 */
export const formatVotesUnified = (votes, platform) => {
  // Convertimos el texto a número. Si trae letras mezcladas, las borramos primero.
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
  const minutes = +minutesString; // El signo "+" convierte un texto a número de forma hiper-rápida.
  
  // Validamos que el número tenga sentido (no sea 0, negativo o texto inválido)
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  
  if (useShortLabel) return `${minutes}'`;

  // TRUCO BITWISE: El "| 0" al final hace exactamente lo mismo que Math.floor() 
  // (quitar los decimales), pero hablando directamente con el procesador. ¡Es mucho más rápido!
  const h = (minutes / 60) | 0; 
  const m = minutes % 60;

  if (h > 0 && m === 0) return `${h}h`; 
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

// Expresión regular que detecta cualquier símbolo "flotante" (tildes, diéresis, etc.)
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

// Diccionario para que el buscador encuentre géneros aunque se escriban de otra forma
const GENRE_REPLACEMENTS = [
  { p: /scifi|ciencia[\s-]?ficcion|futurista|distopia/g, r: "scifi" },
  { p: /filmnoir|negro|neo[\s-]?noir/g, r: "noir" },
  { p: /action|adrenalina/g, r: "accion" },
  { p: /adventure|epico/g, r: "aventuras" },
  { p: /animation|animado|dibujos|cgi/g, r: "animacion" },
  { p: /biography|biografico|biopic/g, r: "biografia" },
  { p: /comedy|humor|comico/g, r: "comedia" },
  { p: /crime|policiaco|policial|criminal|delito|mafia/g, r: "crimen" },
  { p: /documentary/g, r: "documental" },
  { p: /dramatico/g, r: "drama" },
  { p: /family/g, r: "familiar" },
  { p: /fantasy|fantastico/g, r: "fantasia" },
  { p: /history|epoca/g, r: "historico" },
  { p: /horror|miedo/g, r: "terror" },
  { p: /music\b/g, r: "musica" }, 
  { p: /canciones/g, r: "musical" },
  { p: /mystery|misterio|enigma|investigacion/g, r: "intriga" },
  { p: /love|romantico|amor/g, r: "romance" },
  { p: /short|cortometraje/g, r: "corto" },
  { p: /sport/g, r: "deporte" },
  { p: /suspense|psicologico|tension/g, r: "thriller" },
  { p: /war|guerra/g, r: "belico" },
  { p: /oeste|vaqueros/g, r: "western" }
];

/**
 * Normaliza texto eliminando acentos y mayúsculas para búsquedas y comparaciones.
 * @param {string} text 
 * @returns {string}
 */
export const normalizeText = (text) => {
  if (!text) return "";
  // MAGIA ANTI-ACENTOS:
  // 1. normalize("NFD") separa la letra de su tilde (la 'á' pasa a ser una 'a' + '´').
  // 2. replace(...) borra todas las tildes flotantes que hemos separado usando la regla de arriba.
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS_REGEX, "").trim();
};

/**
 * Normalización ESPECÍFICA para Géneros.
 * Borra acentos y, además, traduce sinónimos ("ciencia ficcion" -> "scifi").
 * @param {string} text 
 * @returns {string}
 */
export const normalizeGenreText = (text) => {
  if (!text) return "";
  let norm = text.toLowerCase().normalize("NFD").replace(DIACRITICS_REGEX, "");

  for (const { p, r } of GENRE_REPLACEMENTS) {
    norm = norm.replace(p, r);
  }

  return norm.trim();
};

/**
 * Resalta de forma insensible a mayúsculas y acentos un término de búsqueda.
 * Utiliza un DocumentFragment para máximo rendimiento en renderizado.
 * @param {string} text - Texto original
 * @param {string} searchTerm - Término a buscar
 * @returns {Node} Fragmento de HTML con el término resaltado en <strong>
 */
export const highlightAccentInsensitive = (text, searchTerm) => {
  if (!text) return document.createTextNode("");
  if (!searchTerm) return document.createTextNode(text);

  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);
  const index = normalizedText.indexOf(normalizedSearch);
  
  if (index === -1) return document.createTextNode(text);
  
  // TRUCO: DocumentFragment es como una "bolsa invisible" donde preparamos HTML.
  // Al meter la bolsa entera en la página de golpe, el navegador pinta todo a la vez (mucho más rápido).
  const fragment = document.createDocumentFragment();
  fragment.appendChild(document.createTextNode(text.substring(0, index)));
  
  const strong = document.createElement("strong");
  strong.textContent = text.substring(index, index + searchTerm.length);
  fragment.appendChild(strong);
  
  fragment.appendChild(document.createTextNode(text.substring(index + searchTerm.length)));
  
  return fragment;
};

const CAPITALIZE_REGEX = /\b\w/g;

/**
 * Capitaliza la primera letra de cada palabra.
 * @param {string} str 
 */
export const capitalizeWords = (str) => {
  if (!str) return "";
  return str.replace(CAPITALIZE_REGEX, l => l.toUpperCase());
};

// =================================================================
//          2. CONTROL DE FLUJO Y RED
// =================================================================

/**
 * Función DEBOUNCE (Filtro anti-ametralladora).
 * Si el usuario teclea muy rápido, no queremos hacer una búsqueda en la base de datos por cada letra.
 * Esta función "espera" a que el usuario deje de teclear durante unos milisegundos antes de actuar.
 * @param {Function} func - Función a ejecutar
 * @param {number} delay - Retraso en milisegundos
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

// Almacén de "mandos a distancia" para cancelar peticiones.
const requestControllers = new Map();

/**
 * Crea o reinicia un AbortController para cancelar peticiones previas redundantes.
 * Si pedimos cargar la página 2 y, antes de que llegue, pedimos la página 3, 
 * usamos esto para decirle al navegador: "Olvida la 2, ya no la quiero".
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
 * Inyecta el icono de la bandera de un país.
 * @param {HTMLElement} container - Contenedor a mostrar/ocultar
 * @param {HTMLElement} flagSpan - Elemento donde inyectar el SVG
 * @param {string} countryCode - Código del país (ej: 'es', 'us')
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
  
  // TRUCO: Object.assign no usa JavaScript, le pasa el trabajo directamente al lenguaje base
  // del navegador (C++), copiando todas las propiedades del tirón. Es rapidísimo.
  Object.assign(element, props);
  
  if (style) element.style.cssText = style;
  
  // Dataset (data-*)
  if (dataset) Object.assign(element.dataset, dataset);
  
  // Atributos genéricos (role, aria-*, etc.)
  if (attributes) {
    for (const key of Object.keys(attributes)) {
      element.setAttribute(key, attributes[key]);
    }
  }
  
  return element;
}

/**
 * Hace que un botón dé un pequeño "saltito" (Pop) al pulsarlo.
 * @param {HTMLElement} element 
 */
export const triggerPopAnimation = (element) => {
  if (!element) return;
  
  // TRUCO (REFLOW): Si pulsas el botón dos veces muy rápido, la animación no se reiniciaría.
  // Al consultar 'element.offsetWidth', estamos obligando al navegador a "mirar" la pantalla 
  // de forma forzada, lo que interrumpe la animación anterior y nos permite empezar de cero.
  if (element.classList.contains("pop-animation")) {
    element.classList.remove("pop-animation");
    void element.offsetWidth; 
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
 * Gestor seguro de almacenamiento en el móvil del usuario.
 * Usamos "try/catch" en todas partes porque, si el usuario está en "Navegación Privada",
 * el navegador a veces bloquea el almacenamiento y, sin esto, la web se colgaría.
 */
export const LocalStore = {
  get(key) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      // Solo cargamos los datos si la versión que guardamos (ej: 1) coincide con la de la web actual.
      // Así, si actualizamos la web y cambiamos cómo se guardan los datos, la caché antigua se descarta sola.
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
 * Creador de Tareas Inteligente (Para que el móvil no se "congele").
 * Si le mandamos pintar 100 pósters de golpe, el móvil se trabará durante 1 segundo.
 * Esta función usa requestIdleCallback, que le dice al navegador: "Ve pintando pósters
 * poco a poco, pero solo cuando el procesador esté libre y el usuario no esté tocando la pantalla".
 * @param {Function} task - Tarea a ejecutar
 * @param {string} priority - Prioridad ('user-visible', 'background', etc.)
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