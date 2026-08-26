// =================================================================
//          SLUGS COMPARTIDOS (src/shared/slugs.ts)
// =================================================================
// Funciones de generación de slugs compartidas entre SPA y Astro SEO.
// La SPA las usa para construir/parsear pretty paths.
// El sitio Astro las usa para generar enlaces internos correctos.
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

/**
 * Diccionario canónico: slug → nombre real del género.
 * Usado por parsePrettyPath (lectura) y genreToSlug (escritura).
 */
export const GENRE_SLUG_MAP: Record<string, string> = {
  drama: "Drama",
  comedia: "Comedia",
  "sci-fi": "Sci-Fi",
  terror: "Terror",
  thriller: "Thriller",
  accion: "Acción",
  animacion: "Animación",
  documental: "Documental",
  aventuras: "Aventuras",
  belico: "Bélico",
  crimen: "Crimen",
  fantastico: "Fantástico",
  romance: "Romance",
  western: "Western",
  musical: "Musical",
  misterio: "Misterio",
  "cine-negro": "Cine negro"
};

/**
 * Convierte el nombre de un género a su slug canónico.
 * Busca primero en el diccionario; si no lo encuentra, genera un slug algorítmico.
 * Ej: "Acción" → "accion", "Sci-Fi" → "sci-fi", "Drama" → "drama"
 */
export function genreToSlug(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const norm = genre.trim().toLowerCase();
  const direct = Object.keys(GENRE_SLUG_MAP).find(slug => GENRE_SLUG_MAP[slug].toLowerCase() === norm);
  if (direct) return direct;
  return toSlug(genre);
}
