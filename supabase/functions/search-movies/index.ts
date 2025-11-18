// functions/search-movies/index.ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// Configuración de conexión
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !supabaseAnonKey) {
throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son variables de entorno requeridas.");
}
// Helper para timeouts (Mantenido por robustez)
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
// 1. Manejo de CORS (Preflight)
if (req.method === 'OPTIONS') {
return new Response('ok', { headers: corsHeaders });
}
// 2. Configuración de Caché CDN (Supabase Edge Network)
// - public: Puede ser cacheado por cualquier nodo intermedio.
// - s-maxage=120: La CDN sirve caché fresca durante 2 minutos (reduce hits a DB).
// - stale-while-revalidate=600: Durante 10 min adicionales, sirve caché antigua mientras revalida en background.
const cacheControlHeaders = {
'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
'Vary': 'Authorization, Origin, Accept-Encoding', // Importante para no mezclar respuestas de usuarios distintos
};
try {
// 3. Parseo de la petición
const { activeFilters, currentPage, pageSize } = await req.json();
const authorization = req.headers.get('Authorization');

// Cliente de Supabase
const supabaseClient: SupabaseClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        global: { headers: authorization ? { Authorization: authorization } : {} },
        auth: { persistSession: false }
    }
);

// 4. Lógica de filtros (Year parsing)
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

// 5. Lógica de ordenación
const sortParts = (activeFilters.sort || 'relevance,asc').split(',');
const sortField = sortParts[0];
const sortDirection = sortParts[1];

// 6. Llamada RPC a Base de Datos
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

// 7. Preparación de respuesta
const items = data || [];
const total = items.length > 0 ? items[0].total_count : 0;
const responsePayload = { items, total };

// 8. Retorno de respuesta con headers de caché
return new Response(JSON.stringify(responsePayload), {
  status: 200,
  headers: {
    ...corsHeaders,
    ...cacheControlHeaders, // Aquí es donde ocurre la magia de la CDN
    'Content-Type': 'application/json',
  },
});
} catch (err) {
console.error('Error en Edge Function "search-movies":', err);
return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
status: 500,
headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
}
});