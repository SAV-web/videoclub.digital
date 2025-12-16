// =================================================================
//          COMPONENTE: Rating Stars (v3.1 - Invisible Touch)
// =================================================================
// FICHERO: src/js/components/rating.js
// - Las estrellas vacías "hideUnfilled" tienen opacity: 0
//   en lugar de visibility: hidden.
// - Esto permite que sigan siendo interactivas (clicables) aunque
//   el usuario no las vea, permitiendo votar 4 estrellas en una peli de 2.
// =================================================================

import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast } from "../ui.js";

export const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];

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
      // opacity 0 (invisible, color de fondo) en lugar de hidden
      // Funcionalmente: El elemento existe y recibe clics
      star.style.opacity = "0"; 
      star.style.visibility = "visible"; // Aseguramos que capture eventos
    } else {
      star.style.opacity = "1";
      star.style.visibility = "visible";
      // Recorte de la estrella (llenado parcial)
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

// Efectos visuales de hover (handleRatingClick se eliminó pq usamos delegación en main.js/card.js)

function handleRatingMouseMove(event) {
  const starContainer = event.currentTarget.closest(".star-rating-container");
  if (!starContainer) return;
  // Al pasar el ratón, mostramos temporalmente la nota que tendrías
  const hoverLevel = parseInt(event.currentTarget.dataset.ratingLevel, 10);
  // Renderizamos estrellas de usuario (incluso vacías) para feedback visual inmediato
  renderUserStars(starContainer, hoverLevel, false);
}

function handleRatingMouseLeave(event) {
  const interactiveContainer = event.currentTarget.closest("[data-movie-id]");
  if (interactiveContainer) {
    // Al salir,  la tarjeta se repinta con su estado real
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
      // Efecto visual al pasar el ratón (Desktop)
      star.addEventListener("mouseenter", handleRatingMouseMove);
    });
    // Restaurar estado al salir
    starContainer.addEventListener("mouseleave", handleRatingMouseLeave);
  }
}