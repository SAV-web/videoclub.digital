// =================================================================
//          SLUGS COMPARTIDOS (src/shared/slugs.ts)
// =================================================================
// Funciones de generación y resolución de slugs canónicos compartidas
// entre la SPA y el subsistema Astro SEO.
// La SPA las usa para construir y parsear pretty paths de forma estricta (1:1).
// El sitio Astro las usa para generar enlaces internos canónicos.
// =================================================================

/**
 * Convierte cualquier texto a un slug URL-safe (ASCII, lowercase, guiones).
 * Ej: "Daniel Day-Lewis" → "daniel-day-lewis"
 *     "Ciencia Ficción"  → "ciencia-ficcion"
 */
export function toSlug(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =================================================================
//                      GÉNEROS CANÓNICOS (21)
// =================================================================

/**
 * Diccionario canónico estricto (1:1): slug canónico → nombre oficial del género.
 * Representa los 21 géneros canónicos oficiales del catálogo.
 * Usado por parsePrettyPath (lectura de URLs) y genreToSlug (escritura de URLs).
 */
export const GENRE_SLUG_MAP: Record<string, string> = {
  accion: "Acción",
  animacion: "Animación",
  aventuras: "Aventuras",
  belico: "Bélico",
  biografia: "Biografía",
  noir: "Noir",
  comedia: "Comedia",
  crimen: "Crimen",
  deporte: "Deporte",
  documental: "Documental",
  drama: "Drama",
  familiar: "Familiar",
  fantasia: "Fantasía",
  historico: "Histórico",
  intriga: "Intriga",
  musica: "Música",
  romance: "Romance",
  "sci-fi": "Sci-Fi",
  terror: "Terror",
  thriller: "Thriller",
  western: "Western",
};

/**
 * Convierte el nombre de un género a su slug canónico registrado en GENRE_SLUG_MAP.
 * Si el valor no está en la lista blanca de los 21 géneros oficiales, devuelve null.
 */
export function genreToSlug(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const slug = toSlug(genre);
  if (!slug) return null;

  if (GENRE_SLUG_MAP[slug]) return slug;

  const norm = genre.trim().toLowerCase();
  const direct = Object.keys(GENRE_SLUG_MAP).find(k => GENRE_SLUG_MAP[k].toLowerCase() === norm);
  return direct ?? null;
}

/**
 * Convierte un slug de URL al nombre oficial del género.
 * Solo reconoce los 21 slugs canónicos oficiales (relación 1:1 estricta).
 */
export function slugToGenre(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const clean = toSlug(slug);
  return GENRE_SLUG_MAP[clean] || null;
}

/**
 * Normaliza el nombre del género antes de enviarlo al RPC de PostgreSQL.
 * La resolución y expansión de sinónimos se delega dinámicamente a la tabla
 * `public.genres.synonyms` en la base de datos (Single Source of Truth).
 */
export function expandGenreForDb(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const trimmed = genre.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// =================================================================
//                      PAÍSES CANÓNICOS (SUPABASE)
// =================================================================

/**
 * Catálogo canónico de nombres de países sincronizado con la tabla `countries` de Supabase.
 * Se genera el mapa `COUNTRY_SLUG_MAP` de forma determinista mediante `toSlug(name)`.
 */
const OFFICIAL_COUNTRIES = [
  "EEUU", "España", "UK", "Francia", "Japón", "Italia", "Alemania", "Canadá", "Australia",
  "Corea del Sur", "Hong Kong", "México", "Argentina", "Suecia", "Dinamarca", "Noruega",
  "Polonia", "Rusia", "Irlanda", "Bélgica", "Austria", "Holanda", "Suiza", "Portugal",
  "Grecia", "Chequia", "Hungría", "Rumanía", "Brasil", "Chile", "Colombia", "Cuba",
  "India", "China", "Taiwán", "Irán", "Turquía", "Nueva Zelanda", "Islandia", "Finlandia",
  "Sudáfrica", "Israel", "Líbano", "Egipto", "Tailandia", "Indonesia", "Filipinas",
  "Afganistán", "Albania", "Argelia", "Arabia Saudí", "Armenia", "Azerbaiyán", "Bangladesh",
  "Bolivia", "Bosnia", "Botswana", "Bulgaria", "Bután", "Camboya", "Camerún", "Chipre",
  "Costa Rica", "Croacia", "Ecuador", "El Salvador", "Eslovaquia", "Eslovenia", "Estonia",
  "Etiopía", "Georgia", "Guatemala", "Honduras", "Irak", "Jamaica", "Jordania", "Kazajistán",
  "Kenia", "Lesotho", "Letonia", "Liberia", "Libia", "Lituania", "Luxemburgo", "Macedonia",
  "Malasia", "Marruecos", "Mauritania", "Mongolia", "Montenegro", "Mozambique", "Namibia",
  "Nepal", "Nicaragua", "Nigeria", "Paquistán", "Palestina", "Panamá", "Paraguay", "Perú",
  "Puerto Rico", "Senegal", "Serbia", "Singapur", "Sri Lanka", "Túnez", "Ucrania", "Uganda",
  "Uruguay", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabue",
  // Grupos Regionales de Filtrado
  "latam", "nordic"
];

export const COUNTRY_SLUG_MAP: Record<string, string> = Object.fromEntries(
  OFFICIAL_COUNTRIES.map(name => [toSlug(name), name])
);

/**
 * Convierte el nombre de un país a su slug canónico registrado en COUNTRY_SLUG_MAP.
 * Si el valor no está en el mapa, devuelve null (whitelist estricta).
 */
export function countryToSlug(country: string | null | undefined): string | null {
  if (!country) return null;
  const slug = toSlug(country);
  return COUNTRY_SLUG_MAP[slug] ? slug : null;
}

/**
 * Convierte un slug de URL al nombre oficial del país.
 */
export function slugToCountry(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const clean = toSlug(slug);
  return COUNTRY_SLUG_MAP[clean] || null;
}

// =================================================================
//                 ESTUDIOS, SELECCIONES Y PERSONAS
// =================================================================

export const STUDIO_SLUGS: ReadonlySet<string> = new Set([
  "warner", "universal", "sony", "paramount", "disney", "netflix",
  "amazon", "fox", "lionsgate", "canalplus", "bbc", "miramax",
  "a24", "movistar", "apple"
]);

export const SELECTION_SLUGS: ReadonlySet<string> = new Set([
  "1001movies", "tspdt", "criterion", "kinolorber", "toptv",
  "hbo", "acontra", "arrow", "eureka", "imprint"
]);

/**
 * Convierte un slug de director/actor a texto legible para consultas SQL.
 * Ej: "christopher-nolan" → "christopher nolan"
 */
export function slugToPersonQuery(slug: string): string {
  if (!slug) return "";
  return slug.replace(/-/g, " ").trim();
}
