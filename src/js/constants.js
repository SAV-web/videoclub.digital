// =================================================================
//                      CONSTANTES GLOBALES (UNIFICADO)
// =================================================================
// Este archivo es la única fuente de verdad para configuraciones,
// selectores DOM, clases CSS y datos estáticos.
// =================================================================

// --- Validación de Entorno (Seguridad) ---
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback solo en desarrollo para no romper el flujo local si falta .env
const defaultUrl = "https://wibygecgfczcvaqewleq.supabase.co";
const defaultKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc";

const supabaseUrl = envUrl || defaultUrl;
const supabaseKey = envKey || defaultKey;

/**
 * CONFIGURACIÓN TÉCNICA Y DE COMPORTAMIENTO
 * Nota: Soporta variables de entorno (.env) para mayor seguridad.
 */
export const CONFIG = {
  // Credenciales de Supabase (Validadas arriba)
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseKey,
  
  // URLs de Assets
  POSTER_BASE_URL: "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/",
  
  // Paginación y Límites
  ITEMS_PER_PAGE: 42,
  DYNAMIC_PAGE_SIZE_LIMIT: 56, // Límite para mostrar resultados en una sola página
  
  // Filtros y Búsqueda
  MAX_ACTIVE_FILTERS: 20,
  MAX_EXCLUDED_FILTERS: 20, // Límite específico para exclusiones
  SEARCH_DEBOUNCE_DELAY: 400, // ms
  
  // Rangos
  YEAR_MIN: 1926,
  YEAR_MAX: 2025,
  
  // Persistencia
  STORAGE_VERSION: 1, // Incrementar para invalidar cachés locales antiguas
};

/**
 * ACTORES QUE NO DEBEN SER CLICKABLES NI APARECER EN FILTROS
 */
export const IGNORED_ACTORS = ["(a)", "animación", "animacion", "documental"];

/**
 * VALORES POR DEFECTO PARA EL ESTADO
 */
export const DEFAULTS = {
  SORT: "relevance,asc",
  MEDIA_TYPE: "all",
};

/**
 * CLASES CSS DE ESTADO Y UTILIDAD
 */
export const CSS_CLASSES = {
  // Estados
  ACTIVE: "active",
  DISABLED: "disabled",
  IS_FLIPPED: "is-flipped",
  IS_SCROLLED: "is-scrolled",
  SHOW: "show",
  SIDEBAR_OPEN: "sidebar-is-open",

  // Componentes
  MOVIE_CARD: "movie-card",
  FILTER_PILL_REMOVE_BTN: "remove-filter-btn",
  SIDEBAR_AUTOCOMPLETE_ITEM: "sidebar-autocomplete-item",
  AUTOCOMPLETE_ITEM: "autocomplete-item",
  TYPE_FILTER_MOVIES: "type-filter--movies",
  TYPE_FILTER_SERIES: "type-filter--series",

  // Carga de imágenes
  LAZY_LQIP: "lazy-lqip",
  LOADED: "loaded",
};

/**
 * SELECTORES DEL DOM (IDs, Clases y Atributos)
 */
export const SELECTORS = {
  // Elementos de la Tarjeta (Data Attributes)
  TITLE: '[data-template="title"]',
  DIRECTOR: '[data-template="director"]',
  YEAR: '[data-template="year"]',
  COUNTRY_CONTAINER: '[data-template="country-container"]',
  COUNTRY_FLAG: '[data-template="country-flag"]',
  DURATION: '[data-template="duration"]',
  FA_LINK: '[data-template="fa-link"]',
  FA_RATING: '[data-template="fa-rating"]',
  FA_VOTES: '[data-template="fa-votes"]',
  IMDB_LINK: '[data-template="imdb-link"]',
  IMDB_RATING: '[data-template="imdb-rating"]',
  IMDB_VOTES: '[data-template="imdb-votes"]',
  GENRE: '[data-template="genre"]',
  ACTORS: '[data-template="actors"]',
  SYNOPSIS: '[data-template="synopsis"]',

  // Elementos Globales (IDs)
  GRID_CONTAINER: "#grid-container",
  PAGINATION_CONTAINER: "#pagination-container",
  SEARCH_FORM: "#search-form",
  SEARCH_INPUT: "#search-input",
  SORT_SELECT: "#sort-select",
  THEME_TOGGLE: "#theme-toggle",
  SIDEBAR_TOGGLE_BTN: "#sidebar-toggle-btn",
  SIDEBAR_OVERLAY: "#sidebar-overlay",
  TYPE_FILTER_TOGGLE: "#type-filter-toggle",
  HEADER_PREV_BTN: "#header-prev-btn",
  HEADER_NEXT_BTN: "#header-next-btn",
  AUTOCOMPLETE_RESULTS: "#autocomplete-results",
  CLEAR_FILTERS_BTN: "#clear-filters-btn",
  ACTIVE_FILTERS_CONTAINER: "#active-filters-container",
  YEAR_SLIDER: "#year-slider",
  YEAR_START_INPUT: "#year-start-input",
  YEAR_END_INPUT: "#year-end-input",
  TOAST_CONTAINER: "#toast-container",
  MOVIE_CARD_TEMPLATE: "#movie-card-template",

  // Elementos Dinámicos (Clases)
  SIDEBAR_FILTER_FORM: ".sidebar-filter-form",
  SIDEBAR_AUTOCOMPLETE_RESULTS: ".sidebar-autocomplete-results",
  SIDEBAR_FILTER_INPUT: ".sidebar-filter-input",
  CLICKABLE_BTN: ".btn:not(.active)",
  FLIP_CARD_INNER: ".flip-card-inner",
  SCROLLABLE_CONTENT: ".scrollable-content",
  PLOT_SUMMARY: ".plot-summary-final",
};

/**
 * ICONOS SVG INLINE (Para inyección dinámica en Sidebar)
 */
export const ICONS = {
  PAUSE: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
  SQUARE_STOP: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,
  REWIND: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>`,
  FORWARD: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>`,
  PLAY: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
  PAUSE_SMALL: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  CHEVRON_RIGHT: `<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  POPCORN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7 3 5m6 1V3m4 4 2-2"/><circle cx="9" cy="13" r="3"/><path d="M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17M16 16h2"/></svg>`,
  CLAPPERBOARD: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Zm-14-.7 3.1 3.9m3.1-5.8 3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
  TV: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2-5 5-5-5"/><rect width="20" height="15" x="2" y="7" rx="2"/></svg>`,
};

/**
 * DATOS DE PLATAFORMAS (Streaming / Estudios)
 * Define ID del icono, dimensiones y viewBox para consistencia visual.
 */
export const STUDIO_DATA = {
  N: { id: "icon-netflix", class: "netflix-icon", title: "Netflix" },
  D: { id: "icon-disney", class: "disney-icon", title: "Disney" },
  W: { id: "icon-wb", class: "wb-icon", title: "Warner Bros." },
  U: { id: "icon-universal", class: "universal-icon", title: "Universal" },
  S: { id: "icon-sony", class: "sony-icon", title: "Sony-Columbia" },
  P: { id: "icon-paramount", class: "paramount-icon", title: "Paramount" },
  L: { id: "icon-lionsgate", class: "lionsgate-icon", title: "Lionsgate" },
  Z: { id: "icon-amazon", class: "amazon-icon", title: "Amazon MGM" },
  F: { id: "icon-twenty", class: "twenty-icon", title: "20th Century Fox" },
  2: { id: "icon-a24", class: "a24-icon", title: "A24" },
  O: { id: "icon-movistar", class: "movistar-icon", title: "Movistar" },
  X: { id: "icon-miramax", class: "miramax-icon", title: "Miramax" }
};

/**
 * CONFIGURACIÓN DE FILTROS LATERALES
 * Define etiquetas, ítems y si son excluibles.
 */
export const FILTER_CONFIG = {
  selection: {
    label: "Selección",
    items: {
      C: "Criterion",
      M: "1001 Movies",
      A: "Arrow",
      K: "Kino Lorber",
      E: "Eureka",
      H: "Series HBO",
      T: "A Contra+",
    },
    // Títulos largos para SEO / Cabecera de página (Single Source of Truth)
    titles: {
      C: "Colección Criterion",
      M: "1001 Películas que ver",
      A: "Arrow Video",
      H: "Series de HBO",
      T: "A Contracorriente",
    },
  },
  studio: {
    label: "Estudios",
    items: {
      D: "Disney",
      W: "Warner Bros.",
      P: "Paramount",
      U: "Universal",
      S: "Sony",
      N: "Netflix",
      Z: "Amazon",
      L: "Lionsgate",
      F: "20th Century",
      2: "A24",
      O: "Movistar",
      X: "Miramax",
    },
  },
  genre: {
    label: "Géneros",
    items: {
      Drama: "Drama",
      Comedia: "Comedia",
      Thriller: "Thriller",
      Acción: "Acción",
      Animación: "Animación",
      Documental: "Documental",
    },
    excludable: ["Animación", "Documental"],
  },
  country: {
    label: "Países",
    items: {
      EEUU: "EEUU",
      España: "España",
      UK: "UK",
      Francia: "Francia",
      Japón: "Japón",
      Italia: "Italia",
    },
    excludable: ["EEUU"],
  },
  director: {
    label: "Directores",
    items: {
      // Se poblará dinámicamente desde la API (Top 100)
    },
  },
  actor: {
    label: "Actores",
    items: {
      // Se poblará dinámicamente desde la API (Top 100)
    },
  },
};