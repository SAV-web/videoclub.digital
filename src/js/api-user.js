// =================================================================
//          MÓDULO DE API DE USUARIO (v3.1 - Fix Persistencia)
// =================================================================
// v3.1 - Eliminada la comprobación manual de usuario en lectura.
//        Se confía plenamente en RLS (Row Level Security) para evitar
//        condiciones de carrera al recargar la página (F5).
// =================================================================

import { supabase } from "./supabaseClient.js";
import { getUserDataForMovie } from "./state.js";

/**
 * Obtiene los datos del usuario directamente de la tabla.
 * No comprueba sesión explícitamente; si no hay sesión, RLS devuelve [].
 * @returns {Promise<object>} Mapeo movieId -> { onWatchlist, rating }
 */
export async function fetchUserMovieData() {
  // CAMBIO CRÍTICO: Eliminado await supabase.auth.getUser().
  // Esto causaba fallos al recargar página porque la sesión no estaba lista.
  // Lanzamos la petición directa. Si no hay auth header, RLS devuelve vacío.
  const { data, error } = await supabase
    .from('user_movie_entries')
    .select('movie_id, rating, on_watchlist');

  if (error) {
    // Si el error es de conexión o timeout, lo lanzamos.
    // Ignoramos errores de "sesión no encontrada" si ocurrieran (raro con RLS).
    console.error("Error fetching user data:", error);
    throw new Error("No se pudieron cargar tus datos.");
  }

  // Transformamos el array de la DB al formato de objeto (Hash Map)
  // De: [{movie_id: 1, rating: 5, on_watchlist: true}, ...]
  // A:  { 1: { rating: 5, onWatchlist: true }, ... }
  const userMap = {};
  
  if (data) {
    data.forEach(item => {
      userMap[item.movie_id] = {
        rating: item.rating,
        onWatchlist: item.on_watchlist // Mapeo snake_case -> camelCase
      };
    });
  }

  return userMap;
}

/**
 * Guarda los datos directamente en la tabla usando UPSERT.
 * @param {number} movieId
 * @param {object} partialData - Ej: { onWatchlist: true } o { rating: 8 }
 */
export async function setUserMovieDataAPI(movieId, partialData) {
  // Aquí sí necesitamos el ID de usuario explícito para el INSERT.
  // Usamos getSession() que es más rápido y síncrono si ya está cargado.
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session || !session.user) {
    throw new Error("Debes iniciar sesión para guardar datos.");
  }

  const userId = session.user.id;

  // 1. Obtenemos el estado actual COMPLETO de la memoria local
  // Esto es crucial para no borrar el dato que NO estamos tocando (ej. borrar nota al cambiar watchlist)
  const currentState = getUserDataForMovie(movieId) || { rating: null, onWatchlist: false };
  
  const mergedData = { 
    ...currentState, 
    ...partialData 
  };

  // 2. Preparamos el payload (snake_case para la DB)
  const payload = {
    user_id: userId,
    movie_id: movieId,
    rating: mergedData.rating,
    on_watchlist: mergedData.onWatchlist,
    updated_at: new Date().toISOString()
  };

  // 3. Ejecutamos UPSERT
  const { error } = await supabase
    .from('user_movie_entries')
    .upsert(payload, { onConflict: 'user_id, movie_id' });

  if (error) {
    console.error(`Error saving movie ${movieId}:`, error);
    throw new Error("No se pudo guardar tu acción.");
  }
}