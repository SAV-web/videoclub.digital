// =================================================================
//                      CONFIGURACIÓN GLOBAL
// =================================================================

/**
 * Objeto de configuración principal de la aplicación.
 * Contiene URLs, claves de API y parámetros de comportamiento.
 */
export const CONFIG = {
  SUPABASE_URL: "%%SUPABASE_URL%%",
  SUPABASE_ANON_KEY: "%%SUPABASE_ANON_KEY%%",
  POSTER_BASE_URL:
    "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/",
  ITEMS_PER_PAGE: 42,
  // ✨ AÑADIDO: Límite para mostrar resultados en una sola página.
  DYNAMIC_PAGE_SIZE_LIMIT: 56,
  MAX_FILTER_PILLS: 3,
  SEARCH_DEBOUNCE_DELAY: 400,
  YEAR_MIN: 1926,
  YEAR_MAX: 2025,
  MAX_ACTIVE_FILTERS: 2,
};
