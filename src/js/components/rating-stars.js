// =================================================================
//          COMPONENTE: Rating Stars (v3.0 - Fix Delegación)
// =================================================================
// v3.0 - Corrección Crítica: Eliminados listeners de clic individuales.
//        Se confía 100% en la delegación de eventos de main.js para evitar
//        dobles escrituras que corrompían los datos al guardar.
//        Refactorizado handleRatingClick para usar .closest() robusto.
// =================================================================

import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast } from "../ui.js";

const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];

// --- LÓGICA DE CÁLCULO ---
export function calculateUserStars(rating) {
  if (rating === null || rating === undefined) return 0;
  if (rating >= 9) return 4;
  if (rating >= 7) return 3;
  if (rating >= 5) return 2;
  if (rating >= 1) return 1;
  return 0;
}

export function calculateAverageStars(averageRating) {
  if (averageRating <= 5.5) return 0;
  if (averageRating >= 9) return 4;
  return ((averageRating - 5.5) / (9 - 5.5)) * 4;
}

// =================================================================
//          LÓGICA DE RENDERIZADO
// =================================================================

function renderStars(starContainer, filledStars, { hideUnfilled = false, snapToInteger = false } = {}) {
  const stars = starContainer.querySelectorAll(".star-icon");
  const effectiveFilledStars = snapToInteger ? Math.round(filledStars) : filledStars;

  stars.forEach((star, index) => {
    const fillValue = Math.max(0, Math.min(1, effectiveFilledStars - index));
    const filledPath = star.querySelector(".star-icon-path--filled");

    if (hideUnfilled && fillValue === 0) {
      star.style.visibility = "hidden";
    } else {
      star.style.visibility = "visible";
      const clipPercentage = 100 - fillValue * 100;
      filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
    }
  });
}

export function renderAverageStars(starContainer, filledStars) {
  renderStars(starContainer, filledStars, { hideUnfilled: true, snapToInteger: false });
}

export function renderUserStars(starContainer, filledLevel, hideHollowStars = false) {
  renderStars(starContainer, filledLevel, { hideUnfilled: hideHollowStars, snapToInteger: true });
}

// =================================================================
//          MANEJADORES DE EVENTOS
// =================================================================

async function handleRatingClick(event) {
  event.preventDefault();
  event.stopPropagation();

  // FIX: Usamos target.closest para soportar delegación correctamente.
  // event.currentTarget fallaba cuando el listener estaba en el grid container.
  const clickedElement = event.target.closest(".star-icon[data-rating-level]");
  const interactiveContainer = event.target.closest("[data-movie-id]");
  
  if (!interactiveContainer || !clickedElement) return;

  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  const starIndex = parseInt(clickedElement.dataset.ratingLevel, 10) - 1;

  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
  const currentStars = calculateUserStars(currentUserData.rating);
  const numStarsClicked = starIndex + 1;

  // Lógica de toggle: si pulsas la que ya tienes, se borra (salvo nivel 1 que va a suspenso en lógica de card.js)
  // Nota: La lógica de alternancia con "Suspenso" se gestiona parcialmente aquí al devolver null,
  // y card.js decide qué mostrar.
  let newRating = numStarsClicked === currentStars ? null : LEVEL_TO_RATING_MAP[starIndex];

  const newUserData = { rating: newRating };
  const previousUserData = JSON.parse(interactiveContainer.dataset.previousUserData || "{}");

  // UI Optimista
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer);

  try {
    await setUserMovieDataAPI(movieId, newUserData);
  } catch (error) {
    showToast(error.message, "error");
    // Rollback
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
  }
}

function handleRatingMouseMove(event) {
  const starContainer = event.currentTarget.closest(".star-rating-container");
  // Aquí sí usamos currentTarget porque el listener está directo en la estrella (mousemove)
  const hoverLevel = parseInt(event.currentTarget.dataset.ratingLevel, 10);
  renderUserStars(starContainer, hoverLevel);
}

function handleRatingMouseLeave(event) {
  const interactiveContainer = event.currentTarget.closest("[data-movie-id]");
  if (interactiveContainer) {
    const updateEvent = new CustomEvent("card:requestUpdate", {
      bubbles: true,
      composed: true,
      detail: { cardElement: interactiveContainer },
    });
    interactiveContainer.dispatchEvent(updateEvent);
  }
}

export function setupRatingListeners(starContainer, isInteractive) {
  const stars = starContainer.querySelectorAll(".star-icon[data-rating-level]");
  
  if (isInteractive) {
    stars.forEach((star) => {
      // FIX CRÍTICO: Eliminado star.addEventListener("click", handleRatingClick);
      // El clic ya se gestiona globalmente en main.js -> handleCardClick.
      // Mantenerlo aquí causaba dobles peticiones y corrupción de datos.
      
      // Mantenemos mousemove para el efecto visual de "hover" sobre las estrellas
      star.addEventListener("mousemove", handleRatingMouseMove);
    });
    
    // Mantenemos mouseleave para restaurar el estado al salir
    starContainer.addEventListener("mouseleave", handleRatingMouseLeave);
  }
}