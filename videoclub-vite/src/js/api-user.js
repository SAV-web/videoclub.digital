// =================================================================
//          MÓDULO DE API DE USUARIO (v2 - Consolidado)
// =================================================================
// v2.0 - Adaptado a la nueva arquitectura de backend.
//        - 'fetchUserMovieData' llama a 'get-user-movie-data' para leer.
//        - 'setUserMovieDataAPI' llama a 'set-user-movie-data' para escribir.
//        - Se elimina la lógica antigua de 'add' y 'remove'.
// =================================================================

import { supabase } from "./supabaseClient.js";

/**
 * Obtiene todos los datos de películas del usuario (watchlist y ratings).
 * Llama a la Edge Function 'get-user-movie-data'.
 * @returns {Promise<object>} Un objeto que mapea movieId -> { onWatchlist, rating }
 */
export async function fetchUserMovieData() {
  const { data, error } = await supabase.functions.invoke(
    "get-user-movie-data",
    {
      method: "GET",
    }
  );

  if (error) {
    console.error(
      "Error al obtener los datos de películas del usuario:",
      error
    );
    throw new Error("No se pudieron cargar tus datos personales.");
  }
  return data;
}

/**
 * Actualiza los datos de una película para un usuario (watchlist y/o rating).
 * Llama a la Edge Function 'set-user-movie-data'.
 * @param {number} movieId - El ID de la película.
 * @param {object} data - Objeto con los campos a actualizar. Ej: { onWatchlist: true }, { rating: 8 }
 */
export async function setUserMovieDataAPI(movieId, data) {
  const { onWatchlist, rating } = data;

  // Construimos el cuerpo de la petición solo con los datos definidos.
  const body = { movieId };
  if (onWatchlist !== undefined) {
    body.onWatchlist = onWatchlist;
  }
  if (rating !== undefined) {
    body.rating = rating;
  }

  const { error } = await supabase.functions.invoke("set-user-movie-data", {
    method: "POST",
    body: body,
  });

  if (error) {
    console.error(
      `Error al actualizar datos para la película ${movieId}:`,
      error
    );
    throw new Error("No se pudo guardar tu acción. Inténtalo de nuevo.");
  }
}
