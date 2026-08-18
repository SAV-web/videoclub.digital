// =================================================================
//          CONSTANTES COMPARTIDAS (src/shared/constants.ts)
// =================================================================
// Fuente única de la verdad (SSOT) para SPA (Vite) y SSG (Astro seo-site).
// =================================================================

export interface StudioConfig {
  id: string;
  class: string;
  title: string;
  w: number;
  h: number;
  vb?: string;
  img?: string;
  invertDark?: boolean;
}

export const POSTER_BASE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/";
export const PROFILE_BASE_URL = "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/vips/";

export const SHARED_CONFIG = {
  YEAR_MIN: 1900,
  YEAR_MAX: new Date().getFullYear(),
  ITEMS_PER_PAGE: 42,
  DYNAMIC_PAGE_SIZE_LIMIT: 44,
  WALL_MODE_ITEMS_PER_PAGE: 72,
  WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT: 74,
  CARD_BATCH_SIZE: 12,
  MAX_ACTIVE_FILTERS: 20,
  SEARCH_DEBOUNCE_DELAY: 400,
  STORAGE_VERSION: 1,
  POSTER_BASE_URL,
  PROFILE_BASE_URL,
} as const;

export const STUDIO_DATA: Record<string, StudioConfig> = {
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
  B: { id: "icon-bbc", class: "bbc-icon", title: "BBC", w: 20, h: 20 }
};

/**
 * LISTA DE ACTORES / CRÉDITOS A IGNORAR EN REPARTO
 */
export const IGNORED_ACTORS = [
  "(a)",
  "(A)",
  "animación",
  "animacion",
  "animation",
  "documental",
  "documentary"
] as const;

export const IGNORED_ACTORS_SET: ReadonlySet<string> = new Set(
  IGNORED_ACTORS.map(a => a.toLowerCase())
);

/**
 * CAMPOS DE TEXTO LIBRE O FILTROS QUE REQUIEREN NORMALIZACIÓN
 */
export const TEXT_FILTER_KEYS: ReadonlySet<string> = new Set([
  "searchTerm",
  "genre",
  "country",
  "director",
  "actor",
  "selection",
  "studio",
  "excludedGenres",
  "excludedCountries"
]);

/**
 * REGIONES GEOPOLÍTICAS (Filtrado compuesto mediante códigos ISO)
 */

export interface RegionalGroup {
  readonly label: string;
  readonly value: string;
  readonly codes: readonly string[];
}

export const REGIONAL_GROUPS: Record<string, RegionalGroup> = {
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
} as const;
