// =================================================================
//                 EDGE FUNCTION: search-movies
// =================================================================
// v2.3 - Corregida. Nombres de argumentos RPC alineados con SQL.
// =================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son variables de entorno requeridas.");
}

const makeETag = async (o: unknown): Promise<string> => {
  const json = JSON.stringify(o);
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(json));
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `"${hex}"`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    'Vary': 'Authorization, Origin',
  };

  try {
    const authorization = req.headers.get('Authorization');
    let supabaseClient: SupabaseClient;

    if (authorization) {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
      });
    } else {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }

    const { activeFilters, currentPage, pageSize } = await req.json();
    const etag = await makeETag({ activeFilters, currentPage, pageSize, authorization });

    if (req.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers: { ...corsHeaders, ...cacheHeaders, 'ETag': etag } });
    }

    // ✨ CORRECCIÓN: Las claves del objeto ahora coinciden 100% con los nombres
    // de los argumentos en la nueva función SQL.
    const { data, error } = await supabaseClient.rpc('search_movies_offset', {
        search_term: activeFilters.searchTerm || null,
        genre_name: activeFilters.genre || null,
        year_range: activeFilters.year || null,
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
      throw error;
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
      headers: { ...corsHeaders, ...cacheHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});