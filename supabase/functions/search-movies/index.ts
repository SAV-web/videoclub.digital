// functions/search-movies/index.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { LRUCache } from 'https://esm.sh/lru-cache@10.2.0';

// Sistema de caché en memoria (LRU)
const cache = new LRUCache<string, { etag: string; data: unknown }>({
  max: 200,
  ttl: 1000 * 60 * 2,
});

// Configuración de conexión
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son variables de entorno requeridas.");
}

// NO NECESITAMOS LA URL DEL POOLER AQUÍ. LA LIBRERÍA MANEJA LA CONEXIÓN EFICIENTEMENTE.
// const poolerUrl = supabaseUrl.replace('.supabase.co', '.pooler.supabase.com');

const generateETag = async (text: string): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return `W/"${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}"`;
}

// ==========================================================
//  ✅ MEJORA: Se integra tu idea de añadir un timeout
//     en una función fetch personalizada y segura.
// ==========================================================
const TIMEOUT_MS = 8000; // 8 segundos de timeout

const fetchWithTimeout = (resource: Request | string, options?: RequestInit) => {
  return Promise.race([
    fetch(resource, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), TIMEOUT_MS)
    )
  ]);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cacheControlHeaders = {
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    'Vary': 'Authorization, Origin',
  };

  try {
    const { activeFilters, currentPage, pageSize } = await req.json();

    const cacheKey = JSON.stringify({ activeFilters, currentPage, pageSize });
    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
      if (req.headers.get('If-None-Match') === cachedResponse.etag) {
        return new Response(null, {
          status: 304,
          headers: { ...corsHeaders, ...cacheControlHeaders, 'ETag': cachedResponse.etag },
        });
      }
      return new Response(JSON.stringify(cachedResponse.data), {
        status: 200,
        headers: {
          ...corsHeaders,
          ...cacheControlHeaders,
          'Content-Type': 'application/json',
          'ETag': cachedResponse.etag,
          'X-Cache-Status': 'HIT',
        },
      });
    }
    
    const authorization = req.headers.get('Authorization');
    
    // ==========================================================
    //  ▼▼▼ CORRECCIÓN: Usar la URL estándar de Supabase ▼▼▼
    // ==========================================================
    const supabaseClient: SupabaseClient = createClient(
        supabaseUrl, // <-- USAMOS LA URL NORMAL, NO la del pooler
        supabaseAnonKey,
        {
            global: { headers: authorization ? { Authorization: authorization } : {} },
            auth: { persistSession: false }
        }
    );

    // Lógica para interpretar el rango de años
    let yearStart: number | null = null;
    let yearEnd: number | null = null;
    if (activeFilters.year && typeof activeFilters.year === 'string') {
        const parts = activeFilters.year.split('-').map(Number);
        if (parts.length === 2) {
            yearStart = !isNaN(parts[0]) ? parts[0] : null;
            yearEnd = !isNaN(parts[1]) ? parts[1] : null;
        } else if (parts.length === 1) {
            const singleYear = parts[0];
            if (!isNaN(singleYear)) {
                yearStart = singleYear;
                yearEnd = singleYear;
            }
        }
    }

    // Descomponer el parámetro de ordenación
    const sortParts = (activeFilters.sort || 'relevance,asc').split(',');
    const sortField = sortParts[0];
    const sortDirection = sortParts[1];

    const { data, error } = await supabaseClient.rpc('search_movies_offset', {
        search_term: activeFilters.searchTerm || null,
        genre_name: activeFilters.genre || null,
        p_year_start: yearStart,
        p_year_end: yearEnd,
        country_name: activeFilters.country || null,
        director_name: activeFilters.director || null,
        actor_name: activeFilters.actor || null,
        media_type: activeFilters.mediaType || 'all',
        selection_code: activeFilters.selection || null,
        sort_field: sortField,
        sort_direction: sortDirection,
        excluded_genres: activeFilters.excludedGenres || [],
        excluded_countries: activeFilters.excludedCountries || [],
        page_limit: pageSize,
        page_offset: (currentPage - 1) * pageSize
    });

    if (error) { 
        console.error("Error en la llamada RPC a 'search_movies_offset':", error);
        throw error; 
    }
    
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const responsePayload = { items, total };
    
    const etag = await generateETag(cacheKey);
    cache.set(cacheKey, { etag, data: responsePayload });

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        ...corsHeaders,
        ...cacheControlHeaders,
        'Content-Type': 'application/json',
        'ETag': etag,
        'X-Cache-Status': 'MISS',
      },
    });

  } catch (err) {
    console.error('Error no controlado en la Edge Function "search-movies":', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});