// =================================================================
//          MÓDULO DE ACCIONES DE TARJETA
// =================================================================
// v1.1 - Asegura que todas las llamadas a las funciones de estado
//        utilicen el tipo de lista en singular ('favorite', 'watched')
//        para mantener la consistencia.

import {
  addMovieToList,
  removeMovieFromList,
  isMovieInList,
} from "../state.js";
import { addMovieToListAPI, removeMovieFromListAPI } from "../api-user.js";
import { showToast } from "../toast.js";

/**
 * Maneja el clic en un botón de acción (Favorito/Visto) de forma optimista.
 * @param {Event} event - El evento de clic.
 */
async function handleCardActionClick(event) {
  event.preventDefault();
  event.stopPropagation(); // Evita que el clic voltee la tarjeta

  const button = event.currentTarget;
  const card = button.closest(".movie-card");
  const movieId = parseInt(card.dataset.movieId, 10);
  const action = button.dataset.action;

  if (!movieId || !action) return;

  // ✨ CORREGIDO: Se usa el tipo singular consistentemente.
  const listType = action === "toggle-favorite" ? "favorite" : "watched";
  const isActive = button.classList.contains("is-active");

  // 1. ACTUALIZACIÓN OPTIMISTA
  button.classList.toggle("is-active");
  if (isActive) {
    removeMovieFromList(movieId, listType);
    button.setAttribute(
      "aria-label",
      listType === "favorite" ? "Añadir a favoritos" : "Marcar como vista"
    );
  } else {
    addMovieToList(movieId, listType);
    button.setAttribute(
      "aria-label",
      listType === "favorite" ? "Quitar de favoritos" : "Desmarcar como vista"
    );
  }

  try {
    // 2. SINCRONIZACIÓN CON EL BACKEND
    if (isActive) {
      await removeMovieFromListAPI(movieId, listType);
    } else {
      await addMovieToListAPI(movieId, listType);
    }
  } catch (error) {
    // 3. REVERSIÓN EN CASO DE ERROR
    showToast(error.message, "error");
    button.classList.toggle("is-active");
    if (isActive) {
      addMovieToList(movieId, listType);
      button.setAttribute(
        "aria-label",
        listType === "favorite" ? "Quitar de favoritos" : "Desmarcar como vista"
      );
    } else {
      removeMovieFromList(movieId, listType);
      button.setAttribute(
        "aria-label",
        listType === "favorite" ? "Añadir a favoritos" : "Marcar como vista"
      );
    }
  }
}

/**
 * Actualiza el estado visual de los botones de acción en una tarjeta.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta.
 */
export function updateCardActionsUI(cardElement) {
  const movieId = parseInt(cardElement.dataset.movieId, 10);
  if (!movieId) return;

  const favButton = cardElement.querySelector(
    '[data-action="toggle-favorite"]'
  );
  if (favButton) {
    // ✨ CORREGIDO: Pasa el tipo en singular.
    const isFav = isMovieInList(movieId, "favorite");
    favButton.classList.toggle("is-active", isFav);
    favButton.setAttribute(
      "aria-label",
      isFav ? "Quitar de favoritos" : "Añadir a favoritos"
    );
  }

  const watchedButton = cardElement.querySelector(
    '[data-action="toggle-watched"]'
  );
  if (watchedButton) {
    // ✨ CORREGIDO: Pasa el tipo en singular.
    const isWatched = isMovieInList(movieId, "watched");
    watchedButton.classList.toggle("is-active", isWatched);
    watchedButton.setAttribute(
      "aria-label",
      isWatched ? "Desmarcar como vista" : "Marcar como vista"
    );
  }
}

/**
 * Añade los event listeners a los botones de acción de una tarjeta.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta.
 */
export function setupCardActionListeners(cardElement) {
  cardElement.querySelectorAll(".card-action-btn").forEach((button) => {
    button.addEventListener("click", handleCardActionClick);
  });
}
