// =================================================================
//          EDGE FUNCTION: set-user-movie-data
// =================================================================
// v1.0 - Endpoint único para crear o actualizar la entrada de un
//        usuario para una película (watchlist y/o rating).
//        Utiliza el método POST y la operación UPSERT para máxima
//        eficiencia.
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

  // Solo permitimos el método POST para este endpoint
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: `Método ${req.method} no permitido.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405, // 405 Method Not Allowed
    });
  }

  try {
    // 1. AUTENTICACIÓN Y CREACIÓN DE CLIENTE
    // ----------------------------------------------------------------
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      throw new Error('Se requiere autenticación. Falta el token JWT.');
    }

    // Creamos un cliente de Supabase CON el contexto del usuario.
    // Todas las operaciones respetarán las políticas de RLS.
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } }
    );
    
    // Obtenemos el ID del usuario autenticado para usarlo en la consulta.
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Usuario no encontrado o token inválido.');

    // 2. PROCESAMIENTO DE LA PETICIÓN
    // ----------------------------------------------------------------
    const { movieId, onWatchlist, rating } = await req.json();

    // Validación básica de la entrada
    if (!movieId) {
      return new Response(JSON.stringify({ error: 'Falta el parámetro "movieId".' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Construimos el objeto que vamos a insertar o actualizar.
    const entryData: {
        user_id: string;
        movie_id: number;
        on_watchlist?: boolean;
        rating?: number | null;
    } = {
        user_id: user.id,
        movie_id: movieId,
    };
    
    // Añadimos los campos solo si están definidos en la petición.
    // Esto nos permite actualizaciones parciales (ej. solo cambiar el rating).
    if (onWatchlist !== undefined) {
      entryData.on_watchlist = onWatchlist;
    }
    if (rating !== undefined) {
      // Si el rating es 0 o null, lo guardamos como NULL en la BD para "borrar" la valoración.
      entryData.rating = rating || null;
    }

    // 3. OPERACIÓN UPSERT EN LA BASE DE DATOS
    // ----------------------------------------------------------------
    // `upsert()` intenta un INSERT. Si falla por la restricción UNIQUE (user_id, movie_id),
    // entonces ejecuta un UPDATE en la fila conflictiva. Es atómico y muy eficiente.
    const { error } = await supabaseClient
      .from('user_movie_entries')
      .upsert(entryData, {
        onConflict: 'user_id, movie_id', // Le decimos a Supabase cuál es la restricción que puede fallar
      });

    if (error) {
        // Si hay un error de base de datos (ej. check de rating falla), lo lanzamos.
        throw error;
    }

    return new Response(JSON.stringify({ success: true, message: `Datos de la película ${movieId} actualizados.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // 200 OK es apropiado para un UPSERT exitoso.
    });

  } catch (err) {
    console.error('Error en la Edge Function "set-user-movie-data":', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})