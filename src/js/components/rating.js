// =================================================================
//          COMPONENTE: Rating Stars (UI Logic)
// =================================================================
// FICHERO: src/js/components/rating.js
// RESPONSABILIDAD: 
// - Calcular visualización de estrellas (Media vs Usuario).
// - Gestionar efectos visuales (Hover) sin lógica de negocio.
// - Renderizar el estado visual de las estrellas (relleno/clip).
// =================================================================

// Mapeo de niveles visuales (1-4 estrellas) a valores de base de datos (1-10)
export const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];

// =================================================================
//          1. LÓGICA DE CÁLCULO (Funciones Puras)
// =================================================================

/**
 * Convierte nota de usuario (1-10) a nivel de estrellas (0-4).
 * @param {number|null} rating 
 * @returns {number} 0 a 4
 */
export function calculateUserStars(rating) {
  if (!rating) return 0;
  if (rating >= 9) return 4;
  if (rating >= 7) return 3;
  if (rating >= 5) return 2;
  if (rating >= 1) return 1;
  return 0;
}

/**
 * Convierte nota media (0-10) a valor continuo para clip-path (0.0 - 4.0).
 * @param {number} averageRating 
 * @returns {number}
 */
export function calculateAverageStars(averageRating) {
  if (averageRating <= 5.5) return 0;
  if (averageRating >= 9) return 4;
  // Interpolación lineal entre 5.5 y 9
  return ((averageRating - 5.5) / 3.5) * 4;
}

// =================================================================
//          2. LÓGICA DE RENDERIZADO (DOM)
// =================================================================

/**
 * Renderiza el estado visual de las estrellas.
 * @param {HTMLElement} starContainer - Contenedor de las estrellas.
 * @param {number} filledAmount - Cantidad de estrellas a llenar (ej: 2.5).
 * @param {Object} options - Configuración.
 */
function renderStars(starContainer, filledAmount, { hideUnfilled = false, snapToInteger = false } = {}) {
  // Optimizacion: Usamos children si la estructura es plana para evitar querySelectorAll repetitivo
  // Si la estructura HTML cambia, volver a querySelectorAll(".star-icon")
  const stars = starContainer.querySelectorAll(".star-icon"); 
  
  const effectiveFill = snapToInteger ? Math.round(filledAmount) : filledAmount;

  // Bucle imperativo para máximo rendimiento en animaciones
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    // Calcular cuánto se llena esta estrella específica (0 a 1)
    const fillValue = Math.max(0, Math.min(1, effectiveFill - i));
    
    // Búsqueda del path de relleno (scopeado al elemento actual)
    const filledPath = star.querySelector(".star-icon-path--filled");

    if (hideUnfilled && fillValue === 0) {
      // ESTADO: Estrella vacía en modo "solo lectura" (Media)
      // Usamos opacity: 0 para mantener el layout y eventos, pero hacerla invisible
      star.style.opacity = "0";
      star.style.visibility = "visible"; // Importante para que no colapse si se usa visibility en CSS
    } else {
      // ESTADO: Estrella visible (parcial o total)
      star.style.opacity = "1";
      star.style.visibility = "visible";
      
      // Técnica de recorte para estrellas parciales
      const clipPercentage = (1 - fillValue) * 100;
      // Optimización: Solo tocar el DOM si el estilo cambia (el navegador suele optimizar esto, pero es buena práctica)
      filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
    }
  }
}

export const renderAverageStars = (container, value) => 
  renderStars(container, value, { hideUnfilled: true, snapToInteger: false });

export const renderUserStars = (container, value, hideHollow = false) => 
  renderStars(container, value, { hideUnfilled: hideHollow, snapToInteger: true });

// =================================================================
//          3. INTERACCIÓN (Eventos)
// =================================================================

/**
 * Maneja el hover sobre las estrellas (Feedback visual inmediato).
 */
function handleRatingMouseMove(event) {
  // Usamos currentTarget para asegurar que tenemos el elemento con el listener
  const starIcon = event.currentTarget; 
  const starContainer = starIcon.parentElement; // Asumimos estructura directa
  
  if (!starContainer) return;

  const hoverLevel = parseInt(starIcon.dataset.ratingLevel, 10);
  
  // Renderizamos estado "potencial" (lo que pasaría si haces click)
  // hideHollowStars = false para que el usuario vea las estrellas vacías que va a rellenar
  renderUserStars(starContainer, hoverLevel, false);
}

/**
 * Restaura el estado original al salir del contenedor.
 */
function handleRatingMouseLeave(event) {
  // Disparamos evento para que 'card.js' refresque la UI con el estado real (store)
  // Esto desacopla rating.js del estado global.
  const updateEvent = new CustomEvent("card:requestUpdate", {
    bubbles: true,
    composed: true,
    detail: { cardElement: event.currentTarget.closest(".movie-card") },
  });
  
  // El evento debe dispararse desde un elemento que esté en el DOM
  event.target.dispatchEvent(updateEvent);
}

export function setupRatingListeners(starContainer, isInteractive) {
  if (!isInteractive) return;

  // Delegación de eventos podría ser mejor si hay muchas estrellas, 
  // pero para 4 elementos, listeners directos son aceptables y más precisos para mouseenter.
  const stars = starContainer.querySelectorAll(".star-icon");
  
  stars.forEach((star) => {
    star.addEventListener("mouseenter", handleRatingMouseMove, { passive: true });
  });

  // Listener en el contenedor para detectar cuando salimos del área de votación
  starContainer.addEventListener("mouseleave", handleRatingMouseLeave, { passive: true });
}