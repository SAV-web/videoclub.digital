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

  const clickedElement = event.target.closest(".star-icon[data-rating-level], .low-rating-circle");
  const interactiveContainer = event.target.closest("[data-movie-id]");
  
  if (!interactiveContainer || !clickedElement) return;

  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  
  // Determinar nivel actual y calcular nuevo rating
  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
  const currentStars = calculateUserStars(currentUserData.rating);
  let starIndex = -1; // -1 indica que viene del círculo de suspenso

  if (clickedElement.classList.contains("star-icon")) {
    starIndex = parseInt(clickedElement.dataset.ratingLevel, 10) - 1;
  } else {
    // Si clicamos el círculo y no tenemos nota, asumimos que queremos subir a estrella 1
    // Si ya tenemos nota (suspenso), asumimos que queremos subir a estrella 1 (Rating 3)
    // La lógica de cálculo de abajo maneja los toggles.
  }

  // Lógica de Rating (Mapeo a tu sistema 1-10)
  // Niveles visuales: 1, 2, 3, 4 -> Ratings: 3, 5, 7, 9
  const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];
  let newRating;

  if (starIndex === -1) { 
    // Clic en Círculo Suspenso
    if (currentUserData.rating === null) newRating = 2; // Nada -> Suspenso
    else if (currentUserData.rating === 2) newRating = 3; // Suspenso -> Aprobado (Estrella 1)
    else newRating = null; // Quitar
  } else {
    // Clic en Estrella
    const numStarsClicked = starIndex + 1;
    // Si pulsamos la estrella 1 y estaba vacía (venimos de suspenso) -> Rating 2
    if (numStarsClicked === 1 && currentStars === 0) {
        newRating = 2; 
    } else {
        // Toggle normal
        newRating = numStarsClicked === currentStars ? null : LEVEL_TO_RATING_MAP[starIndex];
    }
  }

  // --- UI OPTIMISTA (Actualizamos el DOM inmediatamente) ---
  const newUserData = { rating: newRating };
  const previousUserData = JSON.parse(interactiveContainer.dataset.previousUserData || "{}");
  
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer); // <--- AQUÍ SE PRODUCE EL INTERCAMBIO DE DOM

  // --- ANIMACIÓN POST-ACTUALIZACIÓN (EL FIX) ---
  // Ahora que updateCardUI ha ejecutado, buscamos qué elemento está visible en la posición 1
  let elementToAnimate = clickedElement;
  const style = window.getComputedStyle(clickedElement);

  // Si el elemento clicado ahora está oculto (display: none), buscamos su relevo
  if (style.display === 'none') {
      if (clickedElement.classList.contains('low-rating-circle')) {
          // Si desapareció el círculo, es porque aparecieron las estrellas -> Animamos la 1ª
          elementToAnimate = interactiveContainer.querySelector('.star-icon[data-rating-level="1"]');
      } else {
          // Si desapareció la estrella, es porque apareció el círculo -> Animamos el círculo
          elementToAnimate = interactiveContainer.querySelector('.low-rating-circle');
      }
  }

  if (elementToAnimate) {
      elementToAnimate.classList.remove("animate-pop");
      void elementToAnimate.offsetWidth; // Force Reflow
      elementToAnimate.classList.add("animate-pop");
      setTimeout(() => elementToAnimate.classList.remove("animate-pop"), 350);
  }
  // --------------------------------------------------------

  try {
    await setUserMovieDataAPI(movieId, newUserData);
    triggerHapticFeedback("success"); // Feedback táctil sincronizado con el Pop
  } catch (error) {
    showToast(error.message, "error");
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