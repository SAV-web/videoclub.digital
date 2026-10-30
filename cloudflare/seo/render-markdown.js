// =================================================================
//        RENDERIZADOR MARKDOWN EN EL EDGE (SEO / AGENTES IA)
//              (cloudflare/seo/render-markdown.js)
// =================================================================
// Genera fichas de texto en Markdown de alta densidad semántica ante
// peticiones con cabecera Accept: text/markdown (Perplexity, SearchGPT,
// Claude, bots de IA). Reduce el egress en un ~97% frente a HTML.
// =================================================================

import {
  parseList,
  isSeriesType,
  formatVotesUnified,
  toSlug,
  computePersonAgeInfo,
  formatYear
} from './seo-types.js';

/**
 * Renderiza la ficha en Markdown de una película o serie.
 *
 * @param {Object} movie - Objeto película de Supabase.
 * @param {string} [siteOrigin="https://videoclub.digital"] - Origen canónico del sitio.
 * @returns {string} Ficha limpia en formato Markdown.
 */
export function renderMovieMarkdown(movie, siteOrigin = 'https://videoclub.digital') {
  if (!movie) return '';

  const isSeries = isSeriesType(movie.type);
  const typeUpper = (movie.type || '').toUpperCase().trim();
  const isMini = typeUpper === 'SM' || typeUpper === 'SAM' || typeUpper === 'SDM' || String(movie.year_end).trim().toUpperCase() === 'M';
  const mediaLabel = isMini ? 'Miniserie' : isSeries ? 'Serie de TV' : '';
  const rawGenres = parseList(movie.genres_list);
  const directors = parseList(movie.directors_list);
  const actors = parseList(movie.actors_list);
  const studios = parseList(movie.studios_list);

  const countryName = movie.countries?.name || '';
  const displayOriginalTitle = movie.original_title?.trim() || movie.title;
  const canonicalUrl = `${siteOrigin}/titulo/${movie.slug}/`;

  const lines = [];

  // Título y tipo
  const typeSuffix = mediaLabel ? ` - ${mediaLabel}` : '';
  const yearSuffix = movie.year ? ` (${movie.year}${typeSuffix})` : '';
  lines.push(`# ${movie.title}${yearSuffix}`);
  lines.push('');

  // Metadatos esenciales
  if (displayOriginalTitle && displayOriginalTitle !== movie.title) {
    lines.push(`- **Título original:** ${displayOriginalTitle}`);
  }
  if (movie.year) {
    lines.push(`- **Año:** ${movie.year}`);
  }
  if (countryName) {
    lines.push(`- **País:** ${countryName}`);
  }
  if (directors.length > 0) {
    lines.push(`- **Dirección:** ${directors.join(', ')}`);
  }
  if (actors.length > 0) {
    lines.push(`- **Reparto:** ${actors.join(', ')}`);
  }
  if (rawGenres.length > 0) {
    lines.push(`- **Género:** ${rawGenres.join(', ')}`);
  }
  if (isSeries && movie.episodes) {
    lines.push(`- **Episodios:** ${movie.episodes} ep.`);
  } else if (movie.minutes) {
    lines.push(`- **Duración:** ${movie.minutes} min.`);
  }

  // Notas y votos
  if (movie.fa_rating) {
    const votesStr = movie.fa_votes ? ` (${formatVotesUnified(movie.fa_votes)} votos)` : '';
    lines.push(`- **Valoración FilmAffinity:** ${movie.fa_rating}${votesStr}`);
  }
  if (movie.imdb_rating) {
    const votesStr = movie.imdb_votes ? ` (${formatVotesUnified(movie.imdb_votes)} votos)` : '';
    lines.push(`- **Valoración IMDb:** ${movie.imdb_rating}${votesStr}`);
  }
  if (studios.length > 0) {
    lines.push(`- **Estudio / Distribución:** ${studios.join(', ')}`);
  }

  // Sinopsis
  if (movie.synopsis) {
    lines.push('');
    lines.push('## Sinopsis');
    lines.push(movie.synopsis.trim());
  }

  // Enlace canónico
  lines.push('');
  lines.push('---');
  lines.push(`*Ficha canónica en VIDEOCLUB.DIGITAL: ${canonicalUrl}*`);

  return lines.join('\n');
}

/**
 * Renderiza el perfil en Markdown de una persona VIP (Director / Actor).
 *
 * @param {Object} person - Objeto persona de Supabase.
 * @param {Object} [options={}] - Opciones con activeRole, filmographies, etc.
 * @param {string} [siteOrigin="https://videoclub.digital"] - Origen canónico del sitio.
 * @returns {string} Perfil limpio en formato Markdown.
 */
export function renderPersonMarkdown(person, options = {}, siteOrigin = 'https://videoclub.digital') {
  if (!person) return '';

  const slug = person.slug || toSlug(person.name);
  const canonicalUrl = `${siteOrigin}/${slug}/`;
  const countryName = person.countries?.name || '';
  const ageInfo = computePersonAgeInfo(person.birthday, person.deathday);

  const defaultRole = (person.type === 'D' || person.type === 'DA') ? 'director' : 'actor';
  const roleLabels = {
    D: 'Director',
    A: 'Actor',
    DA: 'Director y Actor',
    AD: 'Actor y Director'
  };
  const occupation = roleLabels[person.type] || (defaultRole === 'director' ? 'Director' : 'Actor');

  const lines = [];
  lines.push(`# ${person.name}`);
  lines.push('');

  lines.push(`- **Ocupación:** ${occupation}`);
  if (countryName) {
    lines.push(`- **País:** ${countryName}`);
  }
  if (ageInfo?.datesStr) {
    const datesWithAge = `${ageInfo.datesStr} ${ageInfo.ageStr}`.trim();
    lines.push(`- **Fechas:** ${datesWithAge}`);
  }
  if (person.place_of_birth) {
    lines.push(`- **Lugar de nacimiento:** ${person.place_of_birth.trim()}`);
  }

  // Biografía
  const bio = person.biography || person.titulo_bio;
  if (bio) {
    lines.push('');
    lines.push('## Biografía');
    lines.push(bio.trim());
  }

  // Filmografía
  const filmographies = options.filmographies || {};
  const directorFilms = filmographies.director || [];
  const actorFilms = filmographies.actor || [];

  if (directorFilms.length > 0) {
    lines.push('');
    lines.push('## Filmografía Destacada como Director');
    for (const m of directorFilms) {
      const yearStr = m.year ? ` (${m.year})` : '';
      const movieUrl = m.slug ? ` - ${siteOrigin}/titulo/${m.slug}/` : '';
      lines.push(`- ${m.title}${yearStr}${movieUrl}`);
    }
  }

  if (actorFilms.length > 0) {
    lines.push('');
    lines.push('## Filmografía Destacada como Actor');
    for (const m of actorFilms) {
      const yearStr = m.year ? ` (${m.year})` : '';
      const movieUrl = m.slug ? ` - ${siteOrigin}/titulo/${m.slug}/` : '';
      lines.push(`- ${m.title}${yearStr}${movieUrl}`);
    }
  }

  // Enlace canónico
  lines.push('');
  lines.push('---');
  lines.push(`*Perfil canónico en VIDEOCLUB.DIGITAL: ${canonicalUrl}*`);

  return lines.join('\n');
}

