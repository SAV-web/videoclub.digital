// =================================================================
//                      FUNCIONES DE UTILIDAD (HELPERS)
// =================================================================
// FICHERO: src/js/utils.js
// RESPONSABILIDAD: Caja de herramientas funciones puras y helpers
// genéricos reutilizables en toda la aplicación.
// =================================================================

import { CONFIG } from "./config.js";

// =================================================================
//          1. FORMATO DE DATOS (Texto y Números)
// =================================================================

/**
 * Formatea un número de votos a formato compacto (ej: "1.2 K", "5.678").
 * OPTIMIZACIÓN: Usa Intl.NumberFormat para localización nativa eficiente.
 * @param {string|number} votes - El número de votos.
 * @returns {string} El número formateado.
 */
export const formatVotesUnified = (votes) => {
  const numVotes = parseInt(String(votes).replace(/\D/g, ""), 10);
  if (isNaN(numVotes) || numVotes === 0) return "";

  if (numVotes >= 1000000) {
    // Para millones, simplificamos (ej. 1.2 M)
    return new Intl.NumberFormat('es-ES', {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(numVotes).replace("M", " M"); // Ajuste estético
  }
  
  if (numVotes >= 1000) {
    // Para miles, usamos la K si es muy grande o punto si es exacto
    // En tu diseño original usabas "1.234 K" para > 1M, aquí mantenemos
    // consistencia con el estándar español de puntos para miles: 1.234
    return new Intl.NumberFormat('es-ES').format(numVotes);
  }

  return numVotes.toString();
};

/**
 * Convierte una duración en minutos a formato legible.
 * Soporta formato corto para series.
 * @param {string|number} minutesString - La duración en minutos.
 * @param {boolean} [useShortLabel=false] - Si true, usa "'" (series). Si false, "min" (pelis).
 * @returns {string} La duración formateada (ej: "2h 15min" o "45'").
 */
export const formatRuntime = (minutesString, useShortLabel = false) => {
  const minutes = parseInt(minutesString, 10);
  if (isNaN(minutes) || minutes <= 0) return "";
  
  // ▼▼▼ NUEVA REGLA DE EXCEPCIÓN ▼▼▼
  // Si es una serie (useShortLabel es true) y dura exactamente 60 minutos,
  // forzamos "60'" en lugar de dejar que la lógica de abajo devuelva "1h".
  if (useShortLabel && minutes === 60) {
    return "60'";
  }
  // ▲▲▲ FIN REGLA ▲▲▲

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const minLabel = useShortLabel ? "'" : "min";

  if (h > 0 && m === 0) return `${h}h`; 
  return h > 0 ? `${h}h ${m}${minLabel}` : `${m}${minLabel}`;
};

/**
 * Normaliza texto: minúsculas y sin acentos.
 * Útil para búsquedas y filtrado.
 */
export const normalizeText = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Resalta un término de búsqueda dentro de un texto (insensible a acentos).
 * Devuelve HTML seguro.
 */
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

/**
 * Capitaliza la primera letra de cada palabra.
 */
export const capitalizeWords = (str) => {
  if (!str) return "";
  return str.replace(/\b\w/g, l => l.toUpperCase());
};

// =================================================================
//          2. CONTROL DE FLUJO Y LÓGICA
// =================================================================

/**
 * Función Debounce estándar.
 * Retrasa la ejecución de una función hasta que deje de invocarse.
 */
export const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

/**
 * Genera mensajes de error amigables para el usuario.
 */
export function getFriendlyErrorMessage(error) {
  // Errores de red comunes (fetch)
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    return "Error de conexión. Comprueba tu internet.";
  }
  // Errores de aborto (no deberían llegar aquí si se gestionan bien, pero por si acaso)
  if (error.name === "AbortError") {
    return null; // Ignorar silenciosamente
  }
  return "Ha ocurrido un error inesperado. Inténtalo más tarde.";
}

// =================================================================
//          3. MANIPULACIÓN DEL DOM
// =================================================================

/**
 * Helper para crear elementos DOM de forma declarativa.
 * @param {string} tag - Etiqueta HTML.
 * @param {object} options - Propiedades (className, textContent, dataset, etc).
 */
export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  
  for (const [key, value] of Object.entries(options)) {
    if (key === "dataset") {
      Object.assign(element.dataset, value);
    } else if (key === "attributes") {
      for (const [attr, val] of Object.entries(value)) {
        element.setAttribute(attr, val);
      }
    } else if (key === "innerHTML") {
      element.innerHTML = value; // Usar con precaución (XSS)
    } else {
      element[key] = value;
    }
  }
  return element;
}

/**
 * Dispara una animación CSS temporal (tipo 'pop') en un elemento.
 */
export const triggerPopAnimation = (element) => {
  if (!element) return;
  element.classList.remove("pop-animation"); // Reinicio forzado
  void element.offsetWidth; // Trigger reflow
  element.classList.add("pop-animation");
  
  element.addEventListener("animationend", () => {
    element.classList.remove("pop-animation");
  }, { once: true });
};

/**
 * Precarga la imagen LCP (Largest Contentful Paint) para mejorar Core Web Vitals.
 * OPTIMIZADO: Carga directa del recurso WebP sin lógica responsive innecesaria.
 */
export function preloadLcpImage(movieData) {
  if (!movieData?.image || movieData.image === ".") return;

  // Construcción de URL idéntica a card.js para aprovechar caché del navegador
  const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
  const imageUrl = `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp?v=${version}`;

  // Evitar duplicados
  if (document.querySelector(`link[rel="preload"][href="${imageUrl}"]`)) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = imageUrl;
  link.setAttribute("fetchpriority", "high"); // Prioridad crítica

  // Auto-limpieza del DOM tras la carga
  link.onload = () => link.remove();
  link.onerror = () => link.remove();

  document.head.appendChild(link);
}

// =================================================================
//          4. FEEDBACK DE USUARIO (HÁPTICO)
// =================================================================

/**
 * Dispara vibración en dispositivos móviles compatibles.
 * @param {'light' | 'medium' | 'success'} style 
 */
export function triggerHapticFeedback(style = "light") {
  if (!("vibrate" in navigator)) return;
  
  // Respetar preferencia de usuario de "movimiento reducido"
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  try {
    switch (style) {
      case "light": navigator.vibrate(10); break;
      case "medium": navigator.vibrate(20); break;
      case "success": navigator.vibrate([10, 50, 20]); break;
    }
  } catch (e) {
    // Ignorar errores en entornos restrictivos
  }
}