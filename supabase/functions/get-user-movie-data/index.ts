// functions/get-user-movie-data/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) throw new Error('Falta autorización header.')

    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } }
    );

    // 1. Obtener datos (RLS filtra automáticamente por el usuario del token)
    const { data, error } = await supabaseClient
      .from('user_movie_entries')
      .select('movie_id, on_watchlist, rating');

    if (error) throw error;
    
    // 2. Transformación a Mapa (Optimización O(1) para el frontend)
    // De: [{ movie_id: 123, on_watchlist: true, ... }]
    // A:  { "123": { onWatchlist: true, ... } }
    const userMovieData = (data || []).reduce((acc, entry) => {
        acc[entry.movie_id] = {
            onWatchlist: entry.on_watchlist,
            rating: entry.rating,
        };
        return acc;
    }, {});

    return new Response(JSON.stringify(userMovieData), {
      headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          // CRÍTICO: Evitar caché en datos privados de usuario
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      },
      status: 200,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})