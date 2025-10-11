// =================================================================
//          EDGE FUNCTION: search-movies (Versión Segura)
// =================================================================
// Ubicación: supabase/functions/search-movies/index.ts
//
// Propósito:
// 1. Actuar como un proxy seguro para la función RPC 'search_and_count'.
// 2. Eliminar por completo el uso de la 'service_role_key' para peticiones de clientes.
// 3. Implementar una lógica dual:
//    - Si la petición incluye un token JWT válido, se ejecuta con los permisos de ESE usuario (respetando RLS).
//    - Si la petición NO incluye token (usuario anónimo), se ejecuta con permisos públicos ('anon role').
// 4. Gestionar CORS para permitir peticiones desde el frontend.
// =================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Leemos las credenciales base del proyecto desde las variables de entorno una sola vez.
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

// El handler principal que se ejecuta con cada petición.
Deno.serve(async (req) => {
  // Manejamos la petición de pre-vuelo (preflight) de CORS.
  // El navegador la envía automáticamente antes de la petición POST real.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Obtenemos la cabecera de autorización, que contendrá el JWT si el usuario está logueado.
    const authorization = req.headers.get('Authorization');

    // =================================================================
    // LÓGICA DE CLIENTE DUAL: La clave de la seguridad del sistema.
    // =================================================================
    let supabaseClient;

    if (authorization) {
      // CASO 1: Usuario Autenticado.
      // Creamos un cliente de Supabase específico para la sesión del usuario que hace la llamada.
      // Supabase-js se encarga de validar el JWT. Si es falso o ha expirado, las llamadas fallarán.
      // Este cliente actuará con los permisos de RLS definidos para el rol 'authenticated'.
      console.log('Edge Function: Creando cliente para usuario autenticado.');
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
      });
    } else {
      // CASO 2: Usuario Anónimo.
      // Si no hay cabecera de autorización, es un visitante público.
      // Creamos un cliente estándar que usa la 'anon_key'.
      // Este cliente actuará con los permisos de RLS definidos para el rol 'anon'.
      console.log('Edge Function: Creando cliente para usuario anónimo.');
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    // =================================================================

    // Extraemos los parámetros de búsqueda del cuerpo de la petición.
    const { activeFilters, currentPage, pageSize } = await req.json();

    // Invocamos la función RPC usando el cliente correspondiente (autenticado o anónimo).
    // La base de datos aplicará las políticas de RLS adecuadas automáticamente.
    const { data, error } = await supabaseClient.rpc('search_and_count', {
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

    // Si la llamada a la RPC devuelve un error, lo lanzamos para que sea manejado por el bloque catch.
    if (error) {
      throw error;
    }
    
    // Normalizamos la respuesta para que coincida con lo que el frontend espera.
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const responsePayload = { items, total };

    // Devolvemos la respuesta exitosa.
    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // Capturamos cualquier error que haya ocurrido en el proceso.
    console.error('Error en la Edge Function:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      // Devolvemos un 500 para errores del servidor. El frontend mostrará un mensaje genérico.
      status: 500,
    });
  }
});