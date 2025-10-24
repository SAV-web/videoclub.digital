// =================================================================
//          EDGE FUNCTION: get-user-movie-data
// =================================================================
// v1.0 - Endpoint de solo lectura (GET) para obtener todas las
//        entradas de un usuario (watchlist y ratings) y
//        transformarlas en un objeto optimizado para el frontend.
// =================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * Función principal que se ejecuta con cada petición.
 */
Deno.serve(async (req) => {
  // Manejo de la solicitud pre-vuelo (preflight) de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. AUTENTICACIÓN
    // ----------------------------------------------------------------
    // Esta función requiere un usuario autenticado. Si no hay token, se rechaza.
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      throw new Error('Se requiere autenticación. Falta el token JWT.');
    }

    // Creamos un cliente de Supabase CON el contexto del usuario.
    // La consulta respetará las políticas de RLS automáticamente.
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } }
    );

    // 2. CONSULTA A LA BASE DE DATOS
    // ----------------------------------------------------------------
    // Seleccionamos solo las columnas que necesita el frontend.
    // La política RLS asegura que solo obtendremos las filas del usuario actual.
    const { data, error } = await supabaseClient
      .from('user_movie_entries')
      .select('movie_id, on_watchlist, rating');

    if (error) {
      // Si la consulta falla, lanzamos el error.
      throw error;
    }
    
    // 3. TRANSFORMACIÓN DE DATOS
    // ----------------------------------------------------------------
    // Convertimos el array de respuesta de la BD en un objeto clave-valor
    // para un acceso más rápido en el frontend.
    // De: [{ movie_id: 123, on_watchlist: true, rating: 8 }, ...]
    // A:  { "123": { onWatchlist: true, rating: 8 }, ... }
    const userMovieData = data.reduce((acc, entry) => {
        acc[entry.movie_id] = {
            onWatchlist: entry.on_watchlist,
            rating: entry.rating,
        };
        return acc;
    }, {});

    // 4. RESPUESTA EXITOSA
    // ----------------------------------------------------------------
    return new Response(JSON.stringify(userMovieData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    // 5. MANEJO DE ERRORES
    // ----------------------------------------------------------------
    console.error('Error en la Edge Function "get-user-movie-data":', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: err.message === 'Se requiere autenticación.' ? 401 : 500, // Devolvemos 401 Unauthorized si falta el token
    });
  }
})