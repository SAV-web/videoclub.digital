// functions/set-user-movie-data/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) throw new Error('Falta token de autorización.');

    // Cliente con contexto de usuario
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } }
    );

    // 1. Obtener ID de usuario real desde el token (seguridad)
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Token inválido o expirado.');

    // 2. Parsear Body
    const { movieId, onWatchlist, rating } = await req.json();

    if (!movieId) throw new Error('Falta el parámetro movieId.');

    // 3. Construir objeto UPSERT
    const entryData: any = {
        user_id: user.id,
        movie_id: movieId,
        updated_at: new Date().toISOString() // Forzamos update de timestamp
    };

    // Solo añadimos propiedades si están definidas (soporte a actualizaciones parciales)
    if (onWatchlist !== undefined) {
        entryData.on_watchlist = onWatchlist;
    }
    
    if (rating !== undefined) {
        // Lógica de negocio: Si rating es 0, null o false, lo guardamos como NULL (borrar voto)
        // Si es número, validamos rango 1-10 (aunque la BD tiene constraint, ahorramos el viaje)
        if (!rating) {
             entryData.rating = null;
        } else {
             const numRating = Number(rating);
             if (numRating < 1 || numRating > 10) throw new Error('Rating debe ser entre 1 y 10');
             entryData.rating = numRating;
        }
    }

    // 4. Ejecutar UPSERT
    // On Conflict: si ya existe la pareja user_id + movie_id, actualiza.
    const { error: dbError } = await supabaseClient
      .from('user_movie_entries')
      .upsert(entryData, { onConflict: 'user_id, movie_id' });

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('Error set-user-movie-data:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})