// =================================================================
//                      FUNCIONES DE UTILIDAD (OPTIMIZADO)
// =================================================================
import { CONFIG } from "./constants.js";
import flagSpriteUrl from "../flags.svg";

// =================================================================
//          1. FORMATO DE DATOS (High Performance)
// =================================================================

// Cache para Intl.NumberFormat (Es costoso instanciarlo cada vez)
const compactFormatter = new Intl.NumberFormat('es-ES', { notation: "compact", maximumFractionDigits: 1 });
const thousandsFormatter = new Intl.NumberFormat('de-DE'); // Coherencia de locale (usa puntos para miles igual)

/**
 * Formatea votos con reglas específicas por plataforma.
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

  // 3. Menores de 100k
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

// Normalización de texto (Memoización opcional si se llamara mucho, por ahora simple)
export const normalizeText = (text) => {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Resaltado de texto (Optimizado con DocumentFragment)
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

export const capitalizeWords = (str) => {
  if (!str) return "";
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

// =================================================================
//          2. CONTROL DE FLUJO Y RED
// =================================================================

// Debounce mejorado con método .cancel()
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

export function getFriendlyErrorMessage(error) {
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return "Error de conexión. Comprueba tu internet.";
  }
  if (error.name === "AbortError") return null;
  return "Ha ocurrido un error inesperado. Inténtalo más tarde.";
}

// Gestor de Peticiones (Request Manager)
const requestControllers = new Map();

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

// Renderizado de Banderas (SVG Sprite)
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

// Creador de elementos (Optimizado)
export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  
  // Asignación directa es más rápida que Object.entries para propiedades conocidas
  if (options.className) element.className = options.className;
  if (options.textContent) element.textContent = options.textContent;
  if (options.innerHTML) element.innerHTML = options.innerHTML;
  
  // Dataset y Atributos (si existen)
  if (options.dataset) {
    const keys = Object.keys(options.dataset);
    for (let i = 0; i < keys.length; i++) {
      element.dataset[keys[i]] = options.dataset[keys[i]];
    }
  }
  
  if (options.attributes) {
    const keys = Object.keys(options.attributes);
    for (let i = 0; i < keys.length; i++) {
      element.setAttribute(keys[i], options.attributes[keys[i]]);
    }
  }
  
  // Resto de propiedades (eventos, id, etc.)
  if (options.id) element.id = options.id;
  if (options.type) element.type = options.type;
  if (options.href) element.href = options.href;
  if (options.src) element.src = options.src;
  
  return element;
}

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

// Lazy Loading Prioritario (LCP)
export function preloadLcpImage(movieData) {
  if (!movieData?.image || movieData.image === ".") return;
  
  const imageUrl = `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`;

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