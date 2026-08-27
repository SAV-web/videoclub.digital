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
 * Ej: "Acción" → "accion", "Sci-Fi" → "sci-fi", "Noir" → "noir", "Biografía" → "biografia"
 *     "Cine B" → null (no indexable: no genera enlace canónico en la URL)
 */
export function genreToSlug(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const slug = toSlug(genre);
  if (!slug) return null;

  // 1. Coincidencia directa de slug en el mapa canónico
  if (GENRE_SLUG_MAP[slug]) {
    return slug;
  }

  // 2. Búsqueda por nombre normalizado (case-insensitive)
  const norm = genre.trim().toLowerCase();
  const direct = Object.keys(GENRE_SLUG_MAP).find(k => GENRE_SLUG_MAP[k].toLowerCase() === norm);
  return direct ?? null;
}

/**
 * Convierte un slug de URL al nombre oficial del género.
 * Solo reconoce los 21 slugs canónicos oficiales (relación 1:1 estricta).
 * Ej: "deporte" → "Deporte", "accion" → "Acción", "animacion" → "Animación"
 *     "sport" → null, "dibujos" → null (los términos de búsqueda pertenecen al buscador, no a la URL)
 */
export function slugToGenre(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const clean = toSlug(slug);
  return GENRE_SLUG_MAP[clean] || null;
}

/**
 * Expande el nombre canónico de un género a todas las etiquetas y variantes almacenadas en PostgreSQL
 * para que las consultas Full-Text en search_movies_offset recuperen todas las películas asociadas.
 * Nota: Esto opera en la capa de base de datos / búsqueda, manteniendo la URL 100% limpia y canónica.
 */
export function expandGenreForDb(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const slug = toSlug(genre);

  const EXPANSIONS: Record<string, string> = {
    // 1. Acción
    accion: "Acción,Action,Adrenalina",

    // 2. Animación
    animacion: "Animación,Animation,Animado,Dibujos,CGI",

    // 3. Aventuras
    aventuras: "Aventuras,Aventura,Adventure,Épico,Epico",

    // 4. Bélico
    belico: "Bélico,Belico,War,Guerra",

    // 5. Biografía
    biografia: "Biografía,Biografia,Biography,Biográfico,Biografico,Biopic",

    // 6. Noir
    noir: "Noir,FilmNoir,Film-Noir,Cine negro,Negro,Neo-Noir",

    // 7. Comedia
    comedia: "Comedia,Comedy,Humor,Cómico,Comico",

    // 8. Crimen
    crimen: "Crimen,Crime,Policiaco,Policial,Criminal,Delito,Mafia",

    // 9. Deporte
    deporte: "Deporte,Deportes,Sport,Sports,Deportivo",

    // 10. Documental
    documental: "Documental,Documentary",

    // 11. Drama
    drama: "Drama",

    // 12. Familiar
    familiar: "Familiar,Family,Infantil,Niños,Ninos",

    // 13. Fantasía
    fantasia: "Fantasía,Fantasia,Fantasy,Fantástico,Fantastico",

    // 14. Histórico
    historico: "Histórico,Historico,History,Historia,Época,Epoca",

    // 15. Intriga
    intriga: "Intriga,Mystery,Misterio,Enigma,Investigación,Investigacion",

    // 16. Música
    musica: "Música,Musica,Music,Musical,Canciones",

    // 17. Romance
    romance: "Romance,Romántico,Romantico,Amor",

    // 18. Sci-Fi
    "sci-fi": "Sci-Fi,Scifi,Ciencia ficción,Ciencia ficcion,Ciencia-Ficción,Futurista,Distopía,Distopia",

    // 19. Terror
    terror: "Terror,Horror,Miedo",

    // 20. Thriller
    thriller: "Thriller,Psicológico,Psicologico,Tensión,Tension,Suspense",

    // 21. Western
    western: "Western,Oeste,Vaqueros",
  };

  return EXPANSIONS[slug] || genre;
}
