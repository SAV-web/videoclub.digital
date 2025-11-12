// =================================================================
//                      CONSTANTES GLOBALES
// =================================================================
// Centralizar constantes ayuda a prevenir errores de tipeo y facilita
// el mantenimiento, ya que los valores solo necesitan ser actualizados en un lugar.

export const CSS_CLASSES = {
  // Clases de estado
  ACTIVE: "active",
  DISABLED: "disabled",
  IS_FLIPPED: "is-flipped",
  IS_SCROLLED: "is-scrolled",
  SHOW: "show",
  SIDEBAR_OPEN: "sidebar-is-open",

  // Clases de componentes y elementos
  MOVIE_CARD: "movie-card",
  // ✨ CORRECCIÓN: 'pagination-button' eliminado, ya que ahora se usa '.btn'
  FILTER_PILL_REMOVE_BTN: "remove-filter-btn",
  SIDEBAR_AUTOCOMPLETE_ITEM: "sidebar-autocomplete-item",
  AUTOCOMPLETE_ITEM: "autocomplete-item",
  TYPE_FILTER_MOVIES: "type-filter--movies",
  TYPE_FILTER_SERIES: "type-filter--series",

  // Clases de lazy-loading de imágenes
  LAZY_LQIP: "lazy-lqip",
  LOADED: "loaded",
};

export const SELECTORS = {
  // Selectores de Data Attributes
  TITLE: '[data-template="title"]',
  DIRECTOR: '[data-template="director"]',
  YEAR: '[data-template="year"]',
  COUNTRY_CONTAINER: '[data-template="country-container"]',
  COUNTRY_FLAG: '[data-template="country-flag"]',
  COUNTRY_NAME: '[data-template="country-name"]',
  DURATION: '[data-template="duration"]',
  FA_LINK: '[data-template="fa-link"]',
  FA_ICON: '[data-template="fa-link"] img',
  FA_RATING: '[data-template="fa-rating"]',
  FA_VOTES: '[data-template="fa-votes"]',
  IMDB_LINK: '[data-template="imdb-link"]',
  IMDB_ICON: '[data-template="imdb-link"] img',
  IMDB_RATING: '[data-template="imdb-rating"]',
  IMDB_VOTES: '[data-template="imdb-votes"]',
  GENRE: '[data-template="genre"]',
  ACTORS: '[data-template="actors"]',
  SYNOPSIS: '[data-template="synopsis"]',

  // Selectores de ID para acceso centralizado
  GRID_CONTAINER: "#grid-container",
  PAGINATION_CONTAINER: "#pagination-container",
  SEARCH_FORM: "#search-form",
  SEARCH_INPUT: "#search-input",
  SORT_SELECT: "#sort-select",
  THEME_TOGGLE: "#theme-toggle",
  BACK_TO_TOP: "#back-to-top",
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

  // Otros selectores
  SIDEBAR_FILTER_FORM: ".sidebar-filter-form",
  SIDEBAR_AUTOCOMPLETE_RESULTS: ".sidebar-autocomplete-results",
  SIDEBAR_FILTER_INPUT: ".sidebar-filter-input",

  // ✨ CORRECCIÓN: Selector actualizado para usar la nueva clase '.btn'.
  // Ahora es un selector más genérico para cualquier botón clickable que no esté activo.
  CLICKABLE_BTN: ".btn:not(.active)",

  FLIP_CARD_INNER: ".flip-card-inner",
  SCROLLABLE_CONTENT: ".scrollable-content",
  PLOT_SUMMARY: ".plot-summary-final",
};

export const DEFAULTS = {
  // Valores por defecto para el estado
  SORT: "relevance,asc",
  MEDIA_TYPE: "all",
};
// ✨ MEJORA: Centralizamos TODOS los iconos SVG reutilizables.
export const ICONS = {
  // Para el botón de toggle de rotación
  PAUSE: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
  SQUARE_STOP: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,

  // Para el botón de colapsar/expandir sidebar
  REWIND: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>`,
  FORWARD: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>`,

  // Para el botón de "Limpiar filtros"
  PLAY: `<svg class="sidebar-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
  PAUSE_SMALL: "⏸︎",
  
  CHEVRON_RIGHT: `<svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
};

/**
 * @typedef {object} FilterItem
 * @property {string} label - El texto que se muestra en la UI.
 * @property {string[]|undefined} excludable - Opcional. Lista de valores que pueden ser excluidos.
 */

/** @type {Object.<string, FilterItem>} */
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
      N: "Netflix",
    },
  },
  studio: {
    label: "Estudios",
    items: {
      D: "Disney",
      W: "Warner Bros.",
      P: "Paramount",
      U: "Universal",
      S: "Sony-Columbia",
      L: "Lionsgate",
      F: "20th Century",
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
    // Propiedad especial para indicar qué géneros pueden tener un botón de exclusión.
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
      "Woody Allen": "Woody Allen",
      "Alfred Hitchcock": "Hitchcock",
      "Steven Spielberg": "Spielberg",
      "Martin Scorsese": "Scorsese",
      "Pedro Almodóvar": "Almodóvar",
    },
  },
  actor: {
    label: "Actores",
    items: {
      "Tom Cruise": "Tom Cruise",
      "Robert De Niro": "De Niro",
      "Brad Pitt": "Brad Pitt",
      "Helen Mirren": "Helen Mirren",
      "Javier Bardem": "Javier Bardem",
    },
  },
};