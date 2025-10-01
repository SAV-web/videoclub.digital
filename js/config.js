// =================================================================
//                      CONFIGURACIÓN GLOBAL
// =================================================================

/**
 * Objeto de configuración principal de la aplicación.
 * Contiene URLs, claves de API y parámetros de comportamiento.
 */
export const CONFIG = {
    SUPABASE_URL: 'https://wibygecgfczcvaqewleq.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpYnlnZWNnZmN6Y3ZhcWV3bGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNTQzOTYsImV4cCI6MjA2OTgzMDM5Nn0.rmTThnjKCQDbwY-_3Xa2ravmUyChgiXNE9tLq2upkOc',
    POSTER_BASE_URL: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/',
    FA_ICON_URL: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/filmaffinity.png',
    IMDB_ICON_URL: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/imdb.png',
    WIKIPEDIA_ICON_URL: 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/wikipedia.png', // ✨ AÑADIDO
    ITEMS_PER_PAGE: 42,
    // ✨ AÑADIDO: Límite para mostrar resultados en una sola página.
    DYNAMIC_PAGE_SIZE_LIMIT: 56,
    MAX_FILTER_PILLS: 3,
    SEARCH_DEBOUNCE_DELAY: 400,
    YEAR_MIN: 1895,
    YEAR_MAX: 2025,
    MAX_ACTIVE_FILTERS: 2
};