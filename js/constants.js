// =================================================================
//                      CONSTANTES GLOBALES
// =================================================================
// Centralizar constantes ayuda a prevenir errores de tipeo y facilita
// el mantenimiento, ya que los valores solo necesitan ser actualizados en un lugar.

export const CSS_CLASSES = {
    // Clases de estado
    ACTIVE: 'active',
    DISABLED: 'disabled',
    IS_FLIPPED: 'is-flipped',
    IS_SCROLLED: 'is-scrolled',
    SHOW: 'show',
    SIDEBAR_OPEN: 'sidebar-is-open',

    // Clases de componentes y elementos
    MOVIE_CARD: 'movie-card',
    // ✨ CORRECCIÓN: 'pagination-button' eliminado, ya que ahora se usa '.btn'
    FILTER_PILL_REMOVE_BTN: 'remove-filter-btn',
    SIDEBAR_AUTOCOMPLETE_ITEM: 'sidebar-autocomplete-item',
    AUTOCOMPLETE_ITEM: 'autocomplete-item',
    TYPE_FILTER_MOVIES: 'type-filter--movies',
    TYPE_FILTER_SERIES: 'type-filter--series',

    // Clases de lazy-loading de imágenes
    LAZY_LQIP: 'lazy-lqip',
    LOADED: 'loaded',
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
    GRID_CONTAINER: '#grid-container',
    PAGINATION_CONTAINER: '#pagination-container',
    SEARCH_FORM: '#search-form',
    SEARCH_INPUT: '#search-input',
    SORT_SELECT: '#sort-select',
    THEME_TOGGLE: '#theme-toggle',
    BACK_TO_TOP: '#back-to-top',
    SIDEBAR_TOGGLE_BTN: '#sidebar-toggle-btn',
    SIDEBAR_OVERLAY: '#sidebar-overlay',
    TYPE_FILTER_TOGGLE: '#type-filter-toggle',
    HEADER_PREV_BTN: '#header-prev-btn',
    HEADER_NEXT_BTN: '#header-next-btn',
    AUTOCOMPLETE_RESULTS: '#autocomplete-results',
    CLEAR_FILTERS_BTN: '#clear-filters-btn',
    ACTIVE_FILTERS_CONTAINER: '#active-filters-container',
    YEAR_SLIDER: '#year-slider',
    YEAR_START_INPUT: '#year-start-input',
    YEAR_END_INPUT: '#year-end-input',
    TOAST_CONTAINER: '#toast-container',
    MOVIE_CARD_TEMPLATE: '#movie-card-template',

    // Otros selectores
    SIDEBAR_FILTER_FORM: '.sidebar-filter-form',
    SIDEBAR_AUTOCOMPLETE_RESULTS: '.sidebar-autocomplete-results',
    SIDEBAR_FILTER_INPUT: '.sidebar-filter-input',

    // ✨ CORRECCIÓN: Selector actualizado para usar la nueva clase '.btn'.
    // Ahora es un selector más genérico para cualquier botón clickable que no esté activo.
    CLICKABLE_BTN: '.btn:not(.active)',

    FLIP_CARD_INNER: '.flip-card-inner',
    SCROLLABLE_CONTENT: '.scrollable-content',
    PLOT_SUMMARY: '.plot-summary-final',
};

export const DEFAULTS = {
    // Valores por defecto para el estado
    SORT: 'relevance,asc',
    MEDIA_TYPE: 'all',
};