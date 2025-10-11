
// =================================================================
//                  EDGE FUNCTION: search-movies
// =================================================================
// Ubicación: supabase/functions/search-movies/index.ts
//
// Propósito:
// 1. Actuar como un proxy seguro entre el cliente y la base de datos.
// 2. Proteger la función RPC 'search_and_count' contra abusos.
// 3. Requerir una API key secreta para su uso.
// 4. Gestionar CORS para permitir peticiones desde el frontend.
// =================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Variables de entorno que se configurarán en el panel de Supabase
const PROJECT_SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL');
const PROJECT_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY');
const SEARCH_MOVIES_API_KEY = Deno.env.get('SEARCH_MOVIES_API_KEY');

// El handler principal que se ejecuta con cada petición
Deno.serve(async (req) => {
  // =================================================================
  // 1. GESTIÓN DE CORS (Cross-Origin Resource Sharing)
  // =================================================================
  // El navegador envía una petición OPTIONS "pre-flight" para verificar
  // si el servidor permite la petición real. Debemos responder a ella.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // =================================================================
    // 2. VALIDACIÓN DE SEGURIDAD (API KEY)
    // =================================================================
    const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!apiKey || apiKey !== SEARCH_MOVIES_API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =================================================================
    // 3. PROCESAMIENTO DE LA PETICIÓN
    // =================================================================
    // Obtenemos los parámetros de búsqueda del cuerpo de la petición.
    const { activeFilters, currentPage, pageSize } = await req.json();

    // Creamos un cliente de Supabase especial para el servidor.
    // Usamos la 'service_role_key' para que tenga permisos elevados
    // y pueda saltarse las políticas de RLS si fuera necesario.
    const supabaseAdmin = createClient(PROJECT_SUPABASE_URL, PROJECT_SUPABASE_SERVICE_ROLE_KEY);

    // =================================================================
    // 4. LLAMADA A LA FUNCIÓN RPC
    // =================================================================
    const { data, error } = await supabaseAdmin.rpc('search_and_count', {
        search_term: activeFilters.searchTerm || '',
        p_genre_name: activeFilters.genre,
        p_year: activeFilters.year,
        p_country_name: activeFilters.country,
        p_director_name: activeFilters.director,
        p_actor_name: activeFilters.actor,
        p_media_type: activeFilters.mediaType,
        p_selection: activeFilters.selection,
        p_sort: activeFilters.sort,
        p_excluded_genres: activeFilters.excludedGenres,
        p_excluded_countries: activeFilters.excludedCountries,
        p_limit: pageSize,
        p_offset: (currentPage - 1) * pageSize
    });

    if (error) {
      // Si la base de datos devuelve un error, lo propagamos.
      throw new Error(error.message);
    }

    // =================================================================
    // 5. RESPUESTA EXITOSA
    // =================================================================
    // Normalizamos la respuesta para que coincida con lo que el frontend
    // esperaba de la llamada RPC directa.
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const responsePayload = { items, total };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // =================================================================
    // 6. GESTIÓN DE ERRORES
    // =================================================================
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
