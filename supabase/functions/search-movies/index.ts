// =================================================================
//                 EDGE FUNCTION: search-movies
// =================================================================
// v2.4 - Refactorizada la lógica de filtrado por año. La función ahora
//        se encarga de procesar el string de rango de años y pasa
//        parámetros numéricos limpios a la base de datos, mejorando
//        el rendimiento y la separación de responsabilidades.
// =================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Variables de entorno de Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son variables de entorno requeridas.");
}

/**
 * Genera un ETag (Entity Tag) a partir de un objeto para el caching HTTP.
 * @param o El objeto para generar el hash.
 * @returns Una promesa que se resuelve con el string del ETag.
 */
const makeETag = async (o: unknown): Promise<string> => {
  const json = JSON.stringify(o);
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(json));
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `"${hex}"`;
};

Deno.serve(async (req) => {
  // Manejo de la solicitud pre-vuelo (preflight) de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Cabeceras de caché optimizadas para CDN
  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    'Vary': 'Authorization, Origin', // Vary indica que la respuesta depende de estas cabeceras
  };

  try {
    const authorization = req.headers.get('Authorization');
    let supabaseClient: SupabaseClient;

    // Crea un cliente con el contexto del usuario si está autenticado, o anónimo si no lo está.
    // Esto es crucial para que las políticas de RLS (Row Level Security) funcionen.
    if (authorization) {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
      });
    } else {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }

    const { activeFilters, currentPage, pageSize } = await req.json();

    // Genera el ETag a partir de la petición. Incluye la autorización
    // porque los resultados podrían ser diferentes para usuarios distintos.
    const etag = await makeETag({ activeFilters, currentPage, pageSize, authorization });

    // Si el cliente ya tiene la versión más reciente (el ETag coincide),
    // devolvemos una respuesta 304 Not Modified para ahorrar ancho de banda y procesamiento.
    if (req.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ...corsHeaders, ...cacheHeaders, 'ETag': etag } });
    }
    
    // ========================================================================
    // == LÓGICA DE TRADUCCIÓN DE AÑOS (NUEVA IMPLEMENTACIÓN) ==
    // ========================================================================
    // Aquí movemos la responsabilidad de interpretar el string del rango de años
    // fuera de la base de datos y la ponemos en la capa de lógica de negocio.
    let yearStart: number | null = null;
    let yearEnd: number | null = null;

    if (activeFilters.year && typeof activeFilters.year === 'string') {
        if (activeFilters.year.includes('-')) {
            // Caso 1: Es un rango (ej. "1990-2005")
            const [start, end] = activeFilters.year.split('-').map(Number);
            yearStart = !isNaN(start) ? start : null;
            yearEnd = !isNaN(end) ? end : null;
        } else {
            // Caso 2: Es un año único (ej. "2010")
            const singleYear = Number(activeFilters.year);
            if (!isNaN(singleYear)) {
                yearStart = singleYear;
                yearEnd = singleYear; // Para un año único, el inicio y el fin son el mismo.
            }
        }
    }
    // ========================================================================

    const { data, error } = await supabaseClient.rpc('search_movies_offset', {
        search_term: activeFilters.searchTerm || null,
        genre_name: activeFilters.genre || null,
        // -- Parámetros de año refactorizados --
        p_year_start: yearStart,
        p_year_end: yearEnd,
        // ------------------------------------
        country_name: activeFilters.country || null,
        director_name: activeFilters.director || null,
        actor_name: activeFilters.actor || null,
        media_type: activeFilters.mediaType || 'all',
        selection_code: activeFilters.selection || null,
        sort_by: activeFilters.sort || 'relevance,asc',
        excluded_genres: activeFilters.excludedGenres || [],
        excluded_countries: activeFilters.excludedCountries || [],
        page_limit: pageSize,
        page_offset: (currentPage - 1) * pageSize
    });

    if (error) {
      console.error("Error desde la RPC de Supabase:", error);
      throw error; // El bloque catch se encargará de la respuesta HTTP
    }
    
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const responsePayload = { items, total };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, ...cacheHeaders, 'ETag': etag, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('Error en la Edge Function "search-movies":', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, // No cachear respuestas de error
      status: 500,
    });
  }
});