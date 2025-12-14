// =================================================================
//                      FUNCIONES DE UTILIDAD (HELPERS)
// =================================================================
// FICHERO: src/js/utils.js
// RESPONSABILIDAD: Caja de herramientas de funciones puras:
// - Formato de datos.
// - Control de flujo y red (incluye Request Manager).
// - Manipulación del DOM.
// - Feedback (Vibración).
// =================================================================

import { CONFIG } from "./constants.js";
import flagSpriteUrl from "../flags.svg";

// =================================================================
//          1. FORMATO DE DATOS (Texto y Números)
// =================================================================

export const formatVotesUnified = (votes, platform) => {
  const numVotes = parseInt(String(votes).replace(/\D/g, ""), 10);
  if (isNaN(numVotes) || numVotes === 0) return "";

  // 1. Millones: Formato compacto (Ej: 1,5 M)
  if (numVotes >= 1000000) {
    return new Intl.NumberFormat('es-ES', {
      notation: "compact", 
      maximumFractionDigits: 1
    }).format(numVotes).replace("M", " M");
  }

  // 2. Entre 100.000 y 999.999: Formato miles + k (Ej: 251 k)
  if (numVotes >= 100000) {
    return `${Math.floor(numVotes / 1000)} k`;
  }

  // 3. Menores de 100.000

  // < 3.000: Redondeo a la centena (para ambos)
  if (numVotes < 3000) {
    return (Math.ceil(numVotes / 100) * 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  if (platform === 'imdb') {
    // Redondear al millar al alza (Ej: 85740 -> 86.000)
    return (Math.ceil(numVotes / 1000) * 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  if (platform === 'fa') {
    // Redondear a la centena al alza (Ej: 85740 -> 85.800)
    return (Math.ceil(numVotes / 100) * 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // 4. Miles y resto (Fallback): Forzamos el punto con Regex
  // Esto garantiza que 1500 se vea "1.500" y 15000 se vea "15.000"
  return numVotes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const formatRuntime = (minutesString, useShortLabel = false) => {
  const minutes = parseInt(minutesString, 10);
  if (isNaN(minutes) || minutes <= 0) return "";
  
  // Excepción para series exactas de 60 min
  if (useShortLabel && minutes === 60) return "60'";

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const minLabel = useShortLabel ? "'" : "min";

  if (h > 0 && m === 0) return `${h}h`; 
  return h > 0 ? `${h}h ${m}${minLabel}` : `${m}${minLabel}`;
};

export const normalizeText = (text) => {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export const highlightAccentInsensitive = (text, searchTerm) => {
  if (!text || !searchTerm) return text;
  const normalizedText = normalizeText(text);
  const normalizedSearchTerm = normalizeText(searchTerm);
  const index = normalizedText.indexOf(normalizedSearchTerm);
  
  if (index === -1) return text;
  
  const before = text.substring(0, index);
  const match = text.substring(index, index + normalizedSearchTerm.length);
  const after = text.substring(index + normalizedSearchTerm.length);
  
  return `${before}<strong>${match}</strong>${after}`;
};

export const capitalizeWords = (str) => {
  if (!str) return "";
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

// =================================================================
//          2. CONTROL DE FLUJO Y RED
// =================================================================

export const debounce = (func, delay) => {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

export function getFriendlyErrorMessage(error) {
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return "Error de conexión. Comprueba tu internet.";
  }
  if (error.name === "AbortError") return null;
  return "Ha ocurrido un error inesperado. Inténtalo más tarde.";
}

/* --- GESTOR DE PETICIONES (Antes requestManager.js) --- */
const requestControllers = new Map();

/**
 * Crea un AbortController único para una clave, cancelando el anterior.
 * Útil para evitar condiciones de carrera en búsquedas rápidas.
 */
export function createAbortableRequest(key) {
  const existingController = requestControllers.get(key);
  if (existingController) {
    existingController.abort();
    requestControllers.delete(key);
  }
  
  const controller = new AbortController();
  requestControllers.set(key, controller);
  
  // Autolimpieza
  controller.signal.addEventListener('abort', () => {
      requestControllers.delete(key);
  }, { once: true });

  return controller;
}

// =================================================================
//          3. MANIPULACIÓN DEL DOM
// =================================================================

// HELPER: Renderizado de Banderas unificado
export function renderCountryFlag(container, flagSpan, countryCode, countryName = "") {
  if (!container) return;
  
  if (countryCode && flagSpan) {
    const code = countryCode.toLowerCase();
    container.style.display = "flex";
    flagSpan.className = "country-flag-icon";
    flagSpan.title = countryName || "";
    flagSpan.innerHTML = `
      <svg width="16" height="16">
        <use href="${flagSpriteUrl}#flag-${code}"></use>
      </svg>
    `;
  } else {
    container.style.display = "none";
  }
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "dataset") Object.assign(element.dataset, value);
    else if (key === "attributes") for (const [attr, val] of Object.entries(value)) element.setAttribute(attr, val);
    else if (key === "innerHTML") element.innerHTML = value;
    else element[key] = value;
  }
  return element;
}

export const triggerPopAnimation = (element) => {
  if (!element) return;
  element.classList.remove("pop-animation");
  void element.offsetWidth; 
  element.classList.add("pop-animation");
  element.addEventListener("animationend", () => element.classList.remove("pop-animation"), { once: true });
};

export function preloadLcpImage(movieData) {
  if (!movieData?.image || movieData.image === ".") return;
  const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
  const imageUrl = `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp?v=${version}`;

  if (document.querySelector(`link[rel="preload"][href="${imageUrl}"]`)) return;

  const link = document.createElement("link");
  link.rel = "preload"; link.as = "image"; link.href = imageUrl;
  link.setAttribute("fetchpriority", "high");
  link.onload = () => link.remove();
  link.onerror = () => link.remove();
  document.head.appendChild(link);
}

// =================================================================
//          4. FEEDBACK DE USUARIO (HÁPTICO)
// =================================================================

export function triggerHapticFeedback(style = "light") {
  if (!("vibrate" in navigator)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    switch (style) {
      case "light": navigator.vibrate(10); break;
      case "medium": navigator.vibrate(20); break;
      case "success": navigator.vibrate([10, 50, 20]); break;
    }
  } catch (e) {}
}