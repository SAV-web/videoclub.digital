// =================================================================
//          EDGE FUNCTION: manage-user-lists
// =================================================================
// v1.1 - Refactorizado: La petición DELETE ahora usa parámetros de
//        URL (query params) en lugar de un body para mayor
//        compatibilidad y seguimiento de estándares REST.
// =================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son variables de entorno requeridas.");
}

/**
 * Función principal que se ejecuta con cada petición.
 */
Deno.serve(async (req) => {
  // Manejo de la solicitud pre-vuelo (preflight) de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. AUTENTICACIÓN Y CREACIÓN DE CLIENTE
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      // Devolvemos un 401 Unauthorized si no hay token
      return new Response(JSON.stringify({ error: 'Se requiere autenticación. Falta el token JWT.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    // 2. ENRUTAMIENTO BASADO EN EL MÉTODO HTTP
    switch (req.method) {
      case 'GET':
        return await handleGet(supabaseClient);
      case 'POST':
        return await handlePost(supabaseClient, req);
      case 'DELETE':
        return await handleDelete(supabaseClient, req);
      default:
        return new Response(JSON.stringify({ error: `Método ${req.method} no permitido.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405, // 405 Method Not Allowed
        });
    }
  } catch (err) {
    console.error('Error en la Edge Function "manage-user-lists":', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})

/**
 * Maneja las peticiones GET.
 * Obtiene todas las películas en las listas del usuario autenticado.
 */
async function handleGet(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from('user_movie_lists')
    .select('movie_id, list_type');

  if (error) throw error;

  const userLists = {
    favorites: [],
    watched: [],
  };

  data.forEach(item => {
    if (item.list_type === 'favorite') {
      userLists.favorites.push(item.movie_id);
    } else if (item.list_type === 'watched') {
      userLists.watched.push(item.movie_id);
    }
  });

  return new Response(JSON.stringify(userLists), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

/**
 * Maneja las peticiones POST.
 * Añade una película a una lista específica del usuario.
 */
async function handlePost(supabaseClient: SupabaseClient, req: Request) {
  const { movieId, listType } = await req.json();

  if (!movieId || !listType) {
    return new Response(JSON.stringify({ error: 'Faltan los parámetros "movieId" o "listType".' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
  if (listType !== 'favorite' && listType !== 'watched') {
    return new Response(JSON.stringify({ error: 'El parámetro "listType" debe ser "favorite" o "watched".' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const { error } = await supabaseClient
    .from('user_movie_lists')
    .insert({
      movie_id: movieId,
      list_type: listType,
      user_id: (await supabaseClient.auth.getUser()).data.user.id,
    });

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, message: `Película ${movieId} añadida a la lista ${listType}.` }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 201, // 201 Created
  });
}

/**
 * Maneja las peticiones DELETE.
 * Elimina una película de una lista específica del usuario.
 * AHORA LEE LOS PARÁMETROS DESDE LA URL (QUERY PARAMS).
 */
async function handleDelete(supabaseClient: SupabaseClient, req: Request) {
  const url = new URL(req.url);
  const movieId = url.searchParams.get('movieId');
  const listType = url.searchParams.get('listType');

  if (!movieId || !listType) {
    return new Response(JSON.stringify({ error: 'Faltan los parámetros de URL "movieId" o "listType".' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const { error } = await supabaseClient
    .from('user_movie_lists')
    .delete()
    .match({
      movie_id: movieId,
      list_type: listType,
    });

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, message: `Película ${movieId} eliminada de la lista ${listType}.` }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}