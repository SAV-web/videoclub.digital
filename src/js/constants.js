// =================================================================
// CONSTANTES GLOBALES (La "Caja Fuerte" de la configuración)
// Este archivo guarda todos los textos, límites y configuraciones de la app.
// Al tenerlos todos aquí, si algún día queremos cambiar un texto o un límite,
// solo tenemos que editar este archivo sin buscar por todo el código.
// =================================================================

// --- Variables de Entorno (Contraseñas y URLs secretas) ---
// 'import.meta.env' es la forma en la que Vite lee el archivo oculto '.env' de tu ordenador.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Avisamos en la consola si al desarrollador se le olvidó crear el archivo .env
if (!envUrl || !envKey) {
  const msg = "[Config] Faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.";
  console.error(msg);
}

// Lógica de seguridad por si faltan las claves:
// - Si estamos programando (DEV), ponemos texto falso para que la web no explote.
// - Si estamos en Internet (PROD), lo dejamos vacío para darnos cuenta del error.
const usePlaceholder = import.meta.env.DEV && (!envUrl || !envKey);

const supabaseUrl = usePlaceholder ? "https://placeholder.supabase.co" : (envUrl || "");
const supabaseKey = usePlaceholder ? "placeholder" : (envKey || "");

/**
 * CONFIGURACIÓN PRINCIPAL DE LA WEB
 * Usamos 'Object.freeze' para "congelar" este objeto. Es como ponerle un candado.
 * Así evitamos que otro trozo de código cambie estos valores por accidente (ej: CONFIG.ITEMS_PER_PAGE = 0).
 */
export const CONFIG = Object.freeze({
  // API
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseKey,
  POSTER_BASE_URL: "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/",
  PROFILE_BASE_URL: "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/vips/",
  
  // Paginación
  ITEMS_PER_PAGE: 42,
  DYNAMIC_PAGE_SIZE_LIMIT: 56,
  WALL_MODE_ITEMS_PER_PAGE: 72,
  WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT: 84,
  // Renderizamos de 12 en 12 para que el móvil no se quede "congelado" pintando 70 de golpe
  CARD_BATCH_SIZE: 12, 
  
  // Comportamiento
  MAX_ACTIVE_FILTERS: 20,
  MAX_EXCLUDED_FILTERS: 20,
  SEARCH_DEBOUNCE_DELAY: 400, // Tiempo de espera tras teclear antes de buscar (milisegundos)
  
  // Límites de Datos
  YEAR_MIN: 1926,
  YEAR_MAX: new Date().getFullYear(),
  
  // Sistema
  STORAGE_VERSION: 1, // Si cambiamos esto, obligamos al navegador a borrar la caché vieja
});

/**
 * LISTAS DE EXCLUSIÓN
 * Actores que en realidad son etiquetas o grupos y no queremos que salgan sugeridos.
 */
export const IGNORED_ACTORS = Object.freeze(["(a)", "animación", "animacion", "documental"]);

/**
 * Regiones Geopolíticas (Virtuales para filtrado compuesto)
 * Agrupan varios códigos de país bajo un solo nombre para el usuario.
 */
export const REGIONAL_GROUPS = Object.freeze({
  NORDICS: {
    label: "Nordic",
    value: "nordic",
    codes: ["DK", "FI", "IS", "NO", "SE"]
  },
  LATAM: {
    label: "Latam",
    value: "latam",
    codes: ["AR", "MX", "BR", "CL", "CO", "PE", "UY", "VE", "CU", "PY", "BO", "EC", "CR", "GT", "DO"]
  }
});

export const DEFAULTS = Object.freeze({
  SORT: "relevance,asc",
  MEDIA_TYPE: "all",
});

/**
 * DICCIONARIO DE CLASES CSS
 * Guardar las clases aquí evita errores tipográficos. Si en el código escribes
 * CSS_CLASSES.ACTIVE, JavaScript te avisará si te equivocas. Si escribes "active" a mano
 * por todas partes y te equivocas escribiendo "ative", el navegador no te avisará.
 */
export const CSS_CLASSES = Object.freeze({
  ACTIVE: "active",
  DISABLED: "disabled",
  IS_SCROLLED: "is-scrolled",
  SIDEBAR_OPEN: "sidebar-is-open",
  
  // Global Body States (Contratos de UI)
  SIDEBAR_COLLAPSED: "sidebar-collapsed",
  SIDEBAR_DRAGGING_BODY: "sidebar-is-dragging",
  ROTATION_DISABLED: "rotation-disabled",
  MODAL_OPEN: "modal-open",
  USER_LOGGED_IN: "user-logged-in",
  IS_DRAGGING: "is-dragging", // Element state (sidebar/modal)
  IS_FETCHING: "is-fetching", // Barra de progreso global
  DARK_MODE: "dark-mode",     // Tema (en html)
  IS_SCROLLING: "is-scrolling", // Optimización de rendimiento
  
  // Componentes
  MOVIE_CARD: "movie-card",
  FILTER_PILL_REMOVE_BTN: "remove-filter-btn",
  SIDEBAR_AUTOCOMPLETE_ITEM: "sidebar-autocomplete-item",
  
  // Tipos
  TYPE_FILTER_MOVIES: "type-filter--movies",
  TYPE_FILTER_SERIES: "type-filter--series",

  // Carga
  LAZY_LQIP: "lazy-lqip",
  LOADED: "loaded",
});

/**
 * DICCIONARIO DE SELECTORES HTML
 * Igual que las clases, los guardamos aquí para no repetir textos (strings) en el código.
 */
export const SELECTORS = Object.freeze({
  // Globales (IDs)
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
  PERSON_CARD_TEMPLATE: "#person-card-template",

  // Dinámicos (Clases/Atributos)
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
  
  SIDEBAR_FILTER_FORM: ".sidebar-filter-form",
  SIDEBAR_AUTOCOMPLETE_RESULTS: ".sidebar-autocomplete-results",
  SIDEBAR_FILTER_INPUT: ".sidebar-filter-input",
});

/**
 * ALMACÉN DE ICONOS
 * Guardamos el código de los iconos directamente aquí para no tener que cargar
 * archivos de imagen externos, lo que hace que la web cargue instantáneamente.
 */
export const ICONS = Object.freeze({
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
  LIST: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
  STAR: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  WATCHLIST: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>`,
});

/**
 * DATOS DE PLATAFORMAS (Streaming / Estudios)
 */
export const STUDIO_DATA = Object.freeze({
  N: { id: "icon-netflix", class: "netflix-icon", title: "Netflix", w: 20, h: 20 },
  D: { id: "icon-disney", class: "disney-icon", title: "Disney", w: 20, h: 20 },
  W: { id: "icon-wb", class: "wb-icon", title: "Warner Bros.", w: 20, h: 20 },
  U: { id: "icon-universal", class: "universal-icon", title: "Universal", w: 20, h: 20 },
  S: { id: "icon-sony", class: "sony-icon", title: "Sony-Columbia", w: 20, h: 20 },
  P: { id: "icon-paramount", class: "paramount-icon", title: "Paramount", w: 20, h: 20 },
  L: { id: "icon-lionsgate", class: "lionsgate-icon", title: "Lionsgate", w: 20, h: 20 },
  Z: { id: "icon-amazon", class: "amazon-icon", title: "Amazon MGM", w: 20, h: 20 },
  F: { id: "icon-twenty", class: "twenty-icon", title: "20th Century Fox", w: 20, h: 20 },
  T: { id: "icon-a24", class: "a24-icon", title: "A24", w: 20, h: 20 },
  O: { id: "icon-movistar", class: "movistar-icon", title: "Movistar", w: 20, h: 20 },
  X: { id: "icon-miramax", class: "miramax-icon", title: "Miramax", w: 20, h: 20 },
  A: { id: "icon-apple", class: "apple-icon", title: "Apple TV", w: 20, h: 20 },
  C: { id: "icon-canalplus", class: "canalplus-icon", title: "StudioCanal", w: 20, h: 20 },
  B: { id: "icon-bbc", title: "BBC", class: "bbc-icon", w: 20, h: 20 }

});

/**
 * DATOS DE SELECCIONES (Iconos PNG/SVG para Sidebar)
 * Soporta propiedad 'img' para rutas de imagen o 'id' para sprite SVG.
 * 'invertDark': true invierte colores en modo oscuro (útil para logos negros transparentes).
 */
export const SELECTION_DATA = Object.freeze({
});

/**
 * CONFIGURACIÓN DE FILTROS LATERALES (COMPLETA)
 */
export const FILTER_CONFIG = {
  selection: {
    label: "Selección",
    items: {
      M: "1001 Movies",
      P: "TSPDT",
      C: "Criterion",
      K: "Kino Lorber",
      S: "Top TV",
      H: "Series HBO",
      T: "A Contra+",
      A: "Arrow",
      E: "Eureka",
      B: "BFI",
    },
    titles: {
      M: "1001 Películas que ver antes de morir",
      P: "They Shoot Pictures, Don't They?",
      C: "The Criterion Collection",
      K: "Archivo Kino Lorber",
      H: "Series de HBO",
      S: "Mejores series según los rankings",
      T: "A Contracorriente Films",
      A: "Colección Arrow Video",
      E: "Colección Eureka",
      B: "Colección BFI",
    },
  },
  studio: {
    label: "Estudios",
    items: {
      W: "Warner Bros.",
      U: "Universal",
      S: "Sony",
      P: "Paramount",
      D: "Disney",
      N: "Netflix",
      Z: "Amazon-MGM",
      F: "20th Century",
      L: "Lionsgate",
      C: "Canal+",
      B: "BBC",
      X: "Miramax",
      T: "A24",
      O: "Movistar",
      A: "Apple TV",
    },
  },
  genre: {
    label: "Géneros",
    items: {
      Drama: "Drama",
      Comedia: "Comedia",
      "Sci-Fi": "Sci-Fi",
      Terror: "Terror",
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
    excludable: ["EEUU", "España"],
  },
  director: {
    label: "Directores",
    // Se puebla dinámicamente al cargar el sidebar (ver updateDynamicFilters en sidebar.js)
    items: {},
  },
  actor: {
    label: "Actores",
    // Se puebla dinámicamente al cargar el sidebar (ver updateDynamicFilters en sidebar.js)
    items: {},
  },
};