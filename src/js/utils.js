// =================================================================
//                 CAJA DE HERRAMIENTAS (Utils)
// =================================================================
// Funciones puras y rápidas que se usan por toda la web.
// =================================================================

import { CONFIG } from "./constants.js";
import flagSpriteUrl from "../flags.svg";

// =================================================================
//          1. PREPARAR DATOS DE PELÍCULAS
// =================================================================

// ¿Es una serie? (Miramos si empieza por 'S' o 's')
export const isMovieSeries = (type) => type?.[0]?.toLowerCase() === 's';

// Pone bonito el rango de años (ej: "2010-15" o "2020 (M)")
export const formatYearRange = (year, yearEnd, isSeries, fallback = "N/A") => {
  let text = year ? String(year) : fallback;
  if (isSeries && yearEnd) text += (yearEnd === "M" || yearEnd === "-") ? ` ${yearEnd}` : `-${String(yearEnd).slice(-2)}`;
  return text;
};

// URL del póster en alta calidad
export const getHqPosterUrl = (img) => img && img !== "." ? `${CONFIG.POSTER_BASE_URL}${img}.webp` : "";

// Coge los datos brutos de la base de datos y los pone bonitos para usarlos en la web
export function mapMoviePayload(movie) {
  if (!movie) return movie;
  const isSeries = isMovieSeries(movie.type);
  const origTitle = movie.original_title?.trim();
  const hasOrig = origTitle && origTitle.toLowerCase() !== movie.title.toLowerCase();
  
  return {
    ...movie,
    isSeries,
    displayYear: formatYearRange(movie.year, movie.year_end, isSeries, "N/A"),
    posterUrl: getHqPosterUrl(movie.image),
    displayOriginalTitle: hasOrig ? origTitle : movie.title,
    hasOriginalTitle: hasOrig,
    displayEpisodes: isSeries && movie.episodes ? `${movie.episodes} x` : "",
    parsedActors: movie.actors?.split(",").map(a => a.trim()) || [],
    parsedDirectors: movie.directors?.split(",").map(d => d.trim()) || [],
    studioList: movie.studios_list?.split(",") || []
  };
}

// =================================================================
//          2. EL TRADUCTOR (Textos, Números y Tiempos)
// =================================================================

// Creados fuera para ahorrar batería (crearlos es lento)
const compactFormatter = new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 });
const thousandsFormatter = new Intl.NumberFormat('de-DE'); // Usamos 'de-DE' porque usa puntos en los miles (1.000)

// Pone bonitos los números de votos (Ej: 1500000 -> "1,5 M")
export const formatVotesUnified = (votes, platform) => {
  const numVotes = typeof votes === 'number' ? votes : parseInt(String(votes).replace(/\D/g, ""), 10);
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
export const formatRuntime = (minutesString, useShortLabel = false) => {
  const minutes = +minutesString; 
  if (!minutes || minutes <= 0) return "";
  if (useShortLabel) return `${minutes}'`;

  const h = (minutes / 60) | 0; // "| 0" quita los decimales a velocidad luz
  const m = minutes % 60;
  return h ? `${h}h` + (m ? ` ${m}min` : '') : `${m}min`;
};

// --- LIMPIEZA DE TEXTOS Y BÚSQUEDAS ---
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

// Quita acentos y mayúsculas (la 'á' pasa a 'a')
export const normalizeText = t => t?.toLowerCase().normalize("NFD").replace(DIACRITICS_REGEX, "").trim() || "";

const GENRES = [
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
export const normalizeGenreText = t => GENRES.reduce((acc, [p, r]) => acc.replace(p, r), normalizeText(t));

// Protege contra símbolos raros en el buscador (Previene ataques ReDoS)
export const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ilumina en negrita lo que has buscado, ignorando si pusiste acentos
export const highlightAccentInsensitive = (text, searchTerm) => {
  if (!text) return document.createTextNode("");
  if (!searchTerm) return document.createTextNode(text);

  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);
  const fragment = document.createDocumentFragment();
  const regex = new RegExp(escapeRegExp(normalizedSearch), "gi");
  
  let lastIndex = 0;
  let match;

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
export const capitalizeWords = (str) => str ? str.replace(/\b\w/g, l => l.toUpperCase()) : "";

// =================================================================
//          3. CONTROL DE TRÁFICO (Red y Clics)
// =================================================================

// El "Anti-Ametralladora": Espera a que termines de escribir para buscar
export const debounce = (func, delay) => {
  let timeout;
  const debounced = function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
};

// Traduce errores raros en algo que un humano pueda entender
export const getFriendlyErrorMessage = (e) => 
  e?.name === "AbortError" ? null : 
  e?.message?.includes("Failed to fetch") ? "Error de conexión. Revisa tu internet." : 
  "Ha ocurrido un error inesperado. Inténtalo más tarde.";

const requestControllers = new Map();
// Si pides cargar una página, pero luego pinchas en otra antes de que cargue, cancela la anterior
export function createAbortableRequest(key) {
  requestControllers.get(key)?.abort();
  const controller = new AbortController();
  requestControllers.set(key, controller);
  return controller;
}

// =================================================================
//          4. MANIPULACIÓN VISUAL (DOM, Táctil y CSS)
// =================================================================

// Pinta la banderita del país
export function renderCountryFlag(container, flagSpan, countryCode, countryName = "") {
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

// Crea HTML rapidísimo usando Object.assign
export function createElement(tag, { dataset, attributes, style, ...props } = {}) {
  const el = Object.assign(document.createElement(tag), props);
  if (style) el.style.cssText = style;
  if (dataset) Object.assign(el.dataset, dataset);
  if (attributes) Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// Hace que un botón dé un pequeño "saltito" al pulsarlo
export const triggerPopAnimation = (element) => {
  if (!element) return;
  element.classList.remove("pop-animation");
  void element.offsetWidth; // Fuerza al navegador a reiniciar la animación
  element.classList.add("pop-animation");
  element.addEventListener("animationend", () => element.classList.remove("pop-animation"), { once: true });
};

// Avisa al navegador para que cargue la primera imagen antes que nada (Mejora el LCP)
export function preloadLcpImage(movieData) {
  const imageUrl = movieData?.posterUrl || getHqPosterUrl(movieData?.image);
  if (!imageUrl) return;

  if (document.querySelector(`link[rel="preload"][href="${imageUrl}"]`)) return;

  const link = document.createElement("link");
  Object.assign(link, { rel: "preload", as: "image", href: imageUrl });
  link.setAttribute("fetchpriority", "high"); 
  document.head.appendChild(link);
}

const canVibrate = "vibrate" in navigator;
// Vibra el móvil un poquito al tocar botones (si no lo tienes quitado en ajustes)
export function triggerHapticFeedback(style = "light") {
  if (!canVibrate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  
  try {
    switch (style) {
      case "light": navigator.vibrate(10); break;
      case "medium": navigator.vibrate(20); break;
      case "success": navigator.vibrate([10, 30, 10]); break; // Patrón distintivo
    }
  } catch (e) { /* Ignorar errores en entornos restringidos */ }
}

// =================================================================
//          5. LA MEMORIA LOCAL (Segura y Versionada)
// =================================================================

export const LocalStore = {
  get: (key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return (parsed?.v === CONFIG.STORAGE_VERSION) ? parsed.d : null;
    } catch (e) { return null; }
  },
  set: (key, value) => {
    try {
      const payload = { v: CONFIG.STORAGE_VERSION, d: value };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { 
      if (import.meta.env.DEV) console.warn("Storage full or disabled", e); 
    }
  },
  remove: (key) => { try { localStorage.removeItem(key); } catch (e) {} }
};

// =================================================================
//          6. RENDIMIENTO MAGISTRAL (Programador de Tareas)
// =================================================================

// Pinta las tarjetas "a trocitos" para que la pantalla nunca se congele
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

// Animaciones de Hollywood (cuando pinchas una peli y se hace grande)
export function executeViewTransition(updateDomCallback) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    updateDomCallback();
    const resolved = Promise.resolve();
    return { finished: resolved, ready: resolved, updateCallbackDone: resolved };
  }
  
  return document.startViewTransition(updateDomCallback);
}