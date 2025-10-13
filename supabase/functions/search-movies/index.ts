// =================================================================
//                 EDGE FUNCTION: search-movies
// =================================================================
// v2.0 - Optimizado con Seguridad JWT y Caché en CDN
//
// Propósito:
// 1. Actuar como un proxy seguro entre el cliente y la base de datos.
// 2. Requerir autenticación de usuario (JWT) o tratar como anónimo.
// 3. NUNCA usar la 'service_role_key' para peticiones de clientes.
// 4. Implementar una estrategia de caché a nivel de CDN para reducir la carga
//    de la base de datos y mejorar la latencia.
// 5. Gestionar CORS para permitir peticiones desde el frontend.
// =================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Leemos las credenciales base desde las variables de entorno una sola vez.
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

Deno.serve(async (req) => {
  // Las peticiones OPTIONS de pre-vuelo de CORS son cruciales.
  // No deben ser cacheadas y deben responder inmediatamente.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ✨ MEJORA: Definimos las cabeceras de caché para reutilizarlas.
  // s-maxage: El CDN puede cachear la respuesta por 120 segundos.
  // stale-while-revalidate: El CDN sirve una respuesta vieja mientras pide una nueva en segundo plano.
  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600'
  };

  try {
    // Obtenemos la cabecera de autorización que contiene el JWT del usuario.
    const authorization = req.headers.get('Authorization');
    
    let supabaseClient: SupabaseClient;

    // --- Lógica de Cliente Dual: Autenticado vs. Anónimo ---
    if (authorization) {
      // Si hay una cabecera, es un usuario autenticado. Creamos un cliente
      // que actúa en su nombre. Las llamadas a la DB respetarán las políticas RLS
      // específicas para ese usuario.
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
      });
    } else {
      // Si NO hay cabecera, es un usuario anónimo. Creamos un cliente público
      // estándar que solo tiene los permisos del rol 'anon'.
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }

    // Extraemos los parámetros de búsqueda del cuerpo de la petición.
    const { activeFilters, currentPage, pageSize } = await req.json();

    // Invocamos la función RPC 'search_and_count' usando el cliente apropiado.
    const { data, error } = await supabaseClient.rpc('search_and_count', {
        search_term: activeFilters.searchTerm || null,
        p_genre_name: activeFilters.genre || null,
        p_year: activeFilters.year || null,
        p_country_name: activeFilters.country || null,
        p_director_name: activeFilters.director || null,
        p_actor_name: activeFilters.actor || null,
        p_media_type: activeFilters.mediaType || 'all',
        p_selection: activeFilters.selection || null,
        p_sort: activeFilters.sort || 'relevance,asc',
        p_excluded_genres: activeFilters.excludedGenres || [],
        p_excluded_countries: activeFilters.excludedCountries || [],
        p_limit: pageSize,
        p_offset: (currentPage - 1) * pageSize
    });

    if (error) {
      // Si la RPC devuelve un error (ej. RLS deniega el acceso), lo propagamos.
      throw error;
    }
    
    // Normalizamos la respuesta para el cliente.
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const responsePayload = { items, total };

    // Devolvemos la respuesta exitosa con las cabeceras de caché.
    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, ...cacheHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // Gestionamos cualquier error que haya ocurrido en el bloque try.
    console.error('Error en la Edge Function "search-movies":', err);
    
    // Devolvemos una respuesta de error, también con cabeceras de caché
    // para evitar que un pico de errores sobrecargue el sistema.
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, ...cacheHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});