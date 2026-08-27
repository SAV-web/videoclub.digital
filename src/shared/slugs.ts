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
  accion: "Acción",
  animacion: "Animación",
  aventuras: "Aventuras",
  belico: "Bélico",
  biografia: "Biografía",
  noir: "Noir",
  "cine-negro": "Noir",
  "film-noir": "Noir",
  comedia: "Comedia",
  crimen: "Crimen",
  deporte: "Deporte",
  documental: "Documental",
  drama: "Drama",
  familiar: "Familiar",
  infantil: "Familiar",
  fantasia: "Fantasía",
  fantastico: "Fantasía",
  historico: "Histórico",
  intriga: "Intriga",
  misterio: "Intriga",
  musica: "Música",
  musical: "Música",
  romance: "Romance",
  "sci-fi": "Sci-Fi",
  terror: "Terror",
  thriller: "Thriller",
  western: "Western",
};

/**
 * Aliases de géneros que mapean a slugs canónicos estándar (tabla oficial).
 */
const GENRE_ALIASES: Record<string, string> = {
  // 1. Acción (Action / adrenalina)
  "action": "accion",
  "adrenalina": "accion",

  // 2. Animación (Animation / animado, dibujos, cgi)
  "animation": "animacion",
  "animado": "animacion",
  "animada": "animacion",
  "dibujos": "animacion",
  "cgi": "animacion",

  // 3. Aventuras (Adventure / épico)
  "adventure": "aventuras",
  "aventura": "aventuras",
  "epico": "aventuras",
  "epica": "aventuras",

  // 4. Bélico (War / guerra)
  "war": "belico",
  "guerra": "belico",

  // 5. Biografía (Biography / biográfico, biopic)
  "biography": "biografia",
  "biografico": "biografia",
  "biografica": "biografia",
  "biopic": "biografia",

  // 6. Noir (FilmNoir / cine negro, negro, neo-noir)
  "filmnoir": "noir",
  "film-noir": "noir",
  "cine-negro": "noir",
  "negro": "noir",
  "neo-noir": "noir",

  // 7. Comedia (Comedy / humor, cómico)
  "comedy": "comedia",
  "humor": "comedia",
  "comico": "comedia",
  "comica": "comedia",

  // 8. Crimen (Crime / policiaco, policial, criminal, delito, mafia)
  "crime": "crimen",
  "policiaco": "crimen",
  "policial": "crimen",
  "criminal": "crimen",
  "delito": "crimen",
  "mafia": "crimen",

  // 9. Deporte (Sport / deportes, deportivo)
  "sport": "deporte",
  "sports": "deporte",
  "deportes": "deporte",
  "deportivo": "deporte",

  // 10. Documental (Documentary)
  "documentary": "documental",

  // 11. Drama (Drama)
  "drama": "drama",

  // 12. Familiar (Family / infantil, niños)
  "family": "familiar",
  "infantil": "familiar",
  "ninos": "familiar",

  // 13. Fantasía (Fantasy / fantástico)
  "fantasy": "fantasia",
  "fantastico": "fantasia",
  "fantastica": "fantasia",

  // 14. Histórico (History / época, historia)
  "history": "historico",
  "historia": "historico",
  "historica": "historico",
  "epoca": "historico",

  // 15. Intriga (Mystery / misterio, enigma, investigación)
  "mystery": "intriga",
  "misterio": "intriga",
  "enigma": "intriga",
  "investigacion": "intriga",

  // 16. Música (Music / musical, canciones)
  "music": "musica",
  "musical": "musica",
  "canciones": "musica",

  // 17. Romance (Romance / romántico, amor)
  "romance": "romance",
  "romantico": "romance",
  "romantica": "romance",
  "amor": "romance",

  // 18. Sci-Fi (Sci-Fi / sci fi, scifi, ciencia ficción, futurista, distopía)
  "scifi": "sci-fi",
  "ciencia-ficcion": "sci-fi",
  "futurista": "sci-fi",
  "distopia": "sci-fi",

  // 19. Terror (Horror / miedo)
  "horror": "terror",
  "miedo": "terror",

  // 20. Thriller (Thriller / psicológico, tensión, suspense)
  "psicologico": "thriller",
  "tension": "thriller",
  "suspense": "thriller",

  // 21. Western (Western / oeste, vaqueros)
  "oeste": "western",
  "vaqueros": "western",
};

/**
 * Convierte el nombre de un género a su slug canónico registrado en GENRE_SLUG_MAP.
 * Si el valor no está en el mapa, devuelve null (whitelist estricta).
 * Ej: "Acción" → "accion", "Sci-Fi" → "sci-fi", "Noir" → "noir", "Biografía" → "biografia"
 *     "Experimental" → null  (valor desconocido: no genera segmento en la URL)
 */
export function genreToSlug(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const slug = toSlug(genre);
  if (!slug) return null;

  // 1. Alias directo conocido (ej: "ciencia-ficcion" → "sci-fi", "biopic" → "biografia")
  if (GENRE_ALIASES[slug]) {
    return GENRE_ALIASES[slug];
  }

  // 2. Coincidencia directa de slug en el mapa
  if (GENRE_SLUG_MAP[slug]) {
    return slug;
  }

  // 3. Búsqueda por nombre normalizado (case-insensitive)
  const norm = genre.trim().toLowerCase();
  const direct = Object.keys(GENRE_SLUG_MAP).find(k => GENRE_SLUG_MAP[k].toLowerCase() === norm);
  return direct ?? null;
}

/**
 * Convierte un slug o cualquiera de sus aliases (en inglés o sinónimos temáticos) al nombre oficial del género.
 * Ej: "sport" → "Deporte", "action" → "Acción", "dibujos" → "Animación", "deporte" → "Deporte"
 */
export function slugToGenre(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const clean = toSlug(slug);
  const canonSlug = GENRE_ALIASES[clean] || clean;
  return GENRE_SLUG_MAP[canonSlug] || null;
}

/**
 * Expande el nombre canónico o alias de un género a todas las etiquetas reales almacenadas en la base de datos
 * (PostgreSQL search_movies_offset unnest string_to_array).
 * Incluye nombres oficiales en español, nombres en inglés y sinónimos/etiquetas temáticas.
 */
export function expandGenreForDb(genre: string | null | undefined): string | null {
  if (!genre) return null;
  const slug = toSlug(genre);
  
  // Normalización del slug al canónico
  const canonSlug = GENRE_ALIASES[slug] || (GENRE_SLUG_MAP[slug] ? slug : null);
  const targetSlug = canonSlug || slug;

  const EXPANSIONS: Record<string, string> = {
    // 1. Acción | Action | adrenalina
    "accion": "Acción,Action,Adrenalina",

    // 2. Animación | Animation | animado, dibujos, cgi
    "animacion": "Animación,Animation,Animado,Dibujos,CGI",

    // 3. Aventuras | Adventure | épico
    "aventuras": "Aventuras,Aventura,Adventure,Épico,Epico",

    // 4. Bélico | War | guerra
    "belico": "Bélico,Belico,War,Guerra",

    // 5. Biografía | Biography | biográfico, biopic
    "biografia": "Biografía,Biografia,Biography,Biográfico,Biografico,Biopic",

    // 6. Noir | FilmNoir | cine negro, negro, neo-noir
    "noir": "Noir,FilmNoir,Film-Noir,Cine negro,Negro,Neo-Noir",

    // 7. Comedia | Comedy | humor, cómico
    "comedia": "Comedia,Comedy,Humor,Cómico,Comico",

    // 8. Crimen | Crime | policiaco, policial, criminal, delito, mafia
    "crimen": "Crimen,Crime,Policiaco,Policial,Criminal,Delito,Mafia",

    // 9. Deporte | Sport | deportes, deportivo
    "deporte": "Deporte,Deportes,Sport,Sports,Deportivo",

    // 10. Documental | Documentary
    "documental": "Documental,Documentary",

    // 11. Drama | Drama
    "drama": "Drama",

    // 12. Familiar | Family | Infantil, niños
    "familiar": "Familiar,Family,Infantil,Niños,Ninos",

    // 13. Fantasía | Fantasy | fantástico
    "fantasia": "Fantasía,Fantasia,Fantasy,Fantástico,Fantastico",

    // 14. Histórico | History | época, historia
    "historico": "Histórico,Historico,History,Historia,Época,Epoca",

    // 15. Intriga | Mystery | misterio, enigma, investigación
    "intriga": "Intriga,Mystery,Misterio,Enigma,Investigación,Investigacion",

    // 16. Música | Music | musical, canciones
    "musica": "Música,Musica,Music,Musical,Canciones",

    // 17. Romance | Romance | romántico, amor
    "romance": "Romance,Romántico,Romantico,Amor",

    // 18. Sci-Fi | Sci-Fi | scifi, ciencia ficción, futurista, distopía
    "sci-fi": "Sci-Fi,Scifi,Ciencia ficción,Ciencia ficcion,Ciencia-Ficción,Futurista,Distopía,Distopia",

    // 19. Terror | Horror | miedo
    "terror": "Terror,Horror,Miedo",

    // 20. Thriller | Thriller | psicológico, tensión, suspense
    "thriller": "Thriller,Psicológico,Psicologico,Tensión,Tension,Suspense",

    // 21. Western | Western | oeste, vaqueros
    "western": "Western,Oeste,Vaqueros",
  };

  return EXPANSIONS[targetSlug] || genre;
}

