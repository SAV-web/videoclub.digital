// =================================================================
//                      FUNCIONES DE UTILIDAD (HELPERS)
// =================================================================
// Este archivo es una "caja de herramientas" que contiene funciones genéricas y reutilizables
// que no pertenecen a ningún módulo específico, pero que son útiles en toda la aplicación.
// Ayuda a mantener el código DRY (Don't Repeat Yourself - No te repitas).

import { CONFIG } from './config.js';

/**
 * Formatea un número añadiendo un punto como separador de miles.
 * Es una función de ayuda interna para `formatVotesUnified`.
 * @param {number} num - El número a formatear.
 * @returns {string} El número formateado como string.
 */
function formatNumberWithDots(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formatea un número de votos a un formato unificado y legible (ej: "1.234 K", "5.678").
 * @param {string|number} votes - El número de votos.
 * @returns {string} El número de votos formateado.
 */
export const formatVotesUnified = (votes) => {
    const numVotes = parseInt(String(votes).replace(/\D/g, ''), 10);
    if (isNaN(numVotes)) return '';
    if (numVotes >= 1000000) {
        const thousands = Math.floor(numVotes / 1000);
        return `${formatNumberWithDots(thousands)} K`;
    }
    if (numVotes > 0) {
        return formatNumberWithDots(numVotes);
    }
    return '';
};

/**
 * Convierte una duración en minutos a un formato de horas y minutos (ej: "2h 5min").
 * @param {string|number} minutesString - La duración en minutos.
 * @returns {string} La duración formateada.
 */
export const formatRuntime = (minutesString) => {
    const minutes = parseInt(minutesString, 10);
    if (isNaN(minutes) || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

/**
 * Crea una función "debounced". Una función debounced solo se ejecuta una vez
 * después de que haya pasado un cierto tiempo sin que se la llame.
 * @param {Function} func - La función a ejecutar después del tiempo de espera.
 * @param {number} delay - El tiempo de espera en milisegundos.
 * @returns {Function} La nueva función "debounced".
 */
export const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

/**
 * Normaliza un texto: lo convierte a minúsculas y le quita los acentos y diacríticos.
 * @param {string} text - El texto a normalizar.
 * @returns {string} El texto normalizado.
 */
export const normalizeText = (text) => {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Busca un término dentro de un texto y lo resalta con la etiqueta <strong>.
 * La búsqueda es insensible a mayúsculas y acentos.
 * @param {string} text - El texto original donde buscar.
 * @param {string} searchTerm - El término de búsqueda a resaltar.
 * @returns {string} El texto con el término resaltado en HTML.
 */
export const highlightAccentInsensitive = (text, searchTerm) => {
    if (!text || !searchTerm) return text;
    const normalizedText = normalizeText(text);
    const normalizedSearchTerm = normalizeText(searchTerm);
    const index = normalizedText.indexOf(normalizedSearchTerm);
    if (index === -1) {
        return text;
    }
    const before = text.substring(0, index);
    const match = text.substring(index, index + normalizedSearchTerm.length);
    const after = text.substring(index + normalizedSearchTerm.length);
    return `${before}<strong>${match}</strong>${after}`;
};

/**
 * Convierte un string a formato "Title Case" (la primera letra de cada palabra en mayúscula).
 * @param {string} str - El string a formatear.
 * @returns {string} El string formateado.
 */
export const capitalizeWords = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/**
 * Crea y configura un elemento del DOM de forma declarativa y concisa.
 * @param {string} tag - La etiqueta del elemento a crear (ej: 'div', 'button').
 * @param {object} [options={}] - Un objeto con propiedades para asignar al elemento.
 * @returns {HTMLElement} El elemento del DOM creado y configurado.
 */
export function createElement(tag, options = {}) {
    const element = document.createElement(tag);
    Object.entries(options).forEach(([key, value]) => {
        if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key === 'attributes') {
            Object.entries(value).forEach(([attrKey, attrValue]) => {
                element.setAttribute(attrKey, attrValue);
            });
        } else if (key === 'innerHTML') {
            element.innerHTML = value;
        } else {
            element[key] = value;
        }
    });
    return element;
}

/**
 * Aplica una animación de "pop" a un elemento del DOM y la elimina al terminar.
 * @param {HTMLElement} element - El elemento que recibirá la animación.
 */
export const triggerPopAnimation = (element) => {
    if (!element) return;
    element.classList.add('pop-animation');
    element.addEventListener('animationend', () => {
        element.classList.remove('pop-animation');
    }, { once: true });
};

/**
 * Interpreta un objeto de error y devuelve un mensaje amigable para el usuario.
 * @param {Error|object} error - El objeto de error capturado.
 * @returns {string} Un mensaje de error legible.
 */
export function getFriendlyErrorMessage(error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        return 'Error de red. Por favor, comprueba tu conexión a internet o inténtalo más tarde.';
    }
    return 'Ha ocurrido un error inesperado en el servidor. Por favor, inténtalo más tarde.';
}

/**
 * Inyecta dinámicamente un <link rel="preload"> responsivo para la imagen LCP.
 * Utiliza imagesrcset y imagesizes para que el navegador descargue el tamaño óptimo.
 * @param {object} movieData - El objeto de datos de la primera película de la lista.
 */
export function preloadLcpImage(movieData) {
    if (!movieData || !movieData.image || movieData.image === '.') {
        return;
    }

    // Nota: Esta implementación asume que tu backend/CDN puede servir imágenes
    // redimensionadas añadiendo un parámetro de consulta '?w=...'.
    // Si no es el caso, el `href` de fallback seguirá funcionando.
    const baseImageUrl = `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`;

    const existingLink = document.querySelector(`link[rel="preload"][href="${baseImageUrl}"]`);
    if (existingLink) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = baseImageUrl; // href de fallback
    link.setAttribute('fetchpriority', 'high');
    
    // Se construye el srcset para diferentes anchos de dispositivo.
    link.imageSrcset = `
        ${baseImageUrl}?w=250 250w,
        ${baseImageUrl}?w=400 400w,
        ${baseImageUrl}?w=500 500w
    `;
    
    // Se le indica al navegador el tamaño que la imagen ocupará en la pantalla.
    link.imageSizes = "(max-width: 62em) 50vw, (max-width: 80em) 25vw, 20vw";

    link.onload = () => link.remove();
    link.onerror = () => link.remove();

    document.head.appendChild(link);
    console.log(`%c[LCP PRELOAD] Iniciando precarga responsiva para: ${baseImageUrl}`, 'color: #9c27b0');
}