// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO:  src/js/components/modal.js
//  RESPONSABILIDAD:
//  - Gestionar apertura/cierre de la vista detallada.
//  - Poblar datos dinámicamente (optimizando DOM).
//  - Lógica "Bottom Sheet" con gestos táctiles para móvil.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards, setupCardRatings } from "./card.js";
import { formatRuntime, createElement, renderCountryFlag } from "../utils.js"; 
import { PLATFORM_DATA } from "../constants.js";
import spriteUrl from "../../sprite.svg";

// --- Referencias DOM Cacheadas ---
const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("quick-view-template")?.content,
};

// --- Estado de Gestos Táctiles ---
let touchStartY = 0;
let currentModalY = 0;
let isDraggingModal = false;

// =================================================================
//          1. MANEJADORES DE EVENTOS
// =================================================================

/**
 * Cierra la modal si se hace clic fuera del contenido (en el overlay).
 * Ignora clics que provengan de tarjetas para evitar conflictos de apertura.
 */
function handleOutsideClick(event) {
  const isClickInsideCard = event.target.closest(".movie-card");
  if (
    dom.modal.classList.contains("is-visible") &&
    !dom.modal.contains(event.target) &&
    !isClickInsideCard
  ) {
    closeModal();
  }
}

/**
 * Permite filtrar por director al hacer clic en su nombre dentro de la modal.
 * Dispara el evento global de reseteo de filtros.
 */
function handleDirectorClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  if (!directorLink) return;
  
  event.preventDefault();
  closeModal();
  
  document.dispatchEvent(
    new CustomEvent("filtersReset", {
      detail: { 
        keepSort: true, 
        newFilter: { type: "director", value: directorLink.dataset.directorName } 
      },
    })
  );
}

// --- Lógica de Gestos (Swipe to Dismiss) ---

function handleModalTouchStart(e) {
  // UX CRÍTICA: Solo permitimos arrastrar si el usuario está al principio del contenido.
  // Si ha hecho scroll para leer la sinopsis, el gesto no debe activarse.
  if (dom.content.scrollTop > 0) return;

  touchStartY = e.touches[0].clientY;
  isDraggingModal = true;
  // Añadimos clase para eliminar la transición CSS y que el movimiento sea instantáneo (1:1 con el dedo)
  dom.modal.classList.add("is-dragging");
}

function handleModalTouchMove(e) {
  if (!isDraggingModal) return;

  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStartY;

  // Solo permitimos arrastrar hacia ABAJO (delta positivo)
  if (deltaY > 0) {
    // Importante: Prevenir scroll del body o rebote elástico del navegador
    if (e.cancelable) e.preventDefault();
    
    // Movemos la modal visualmente
    dom.modal.style.transform = `translate(-50%, ${deltaY}px)`;
    currentModalY = deltaY;
  }
}

function handleModalTouchEnd(e) {
  if (!isDraggingModal) return;
  isDraggingModal = false;
  dom.modal.classList.remove("is-dragging"); // Reactivamos transiciones CSS para el rebote o cierre suave

  // UMBRAL DE CIERRE: 120px
  if (currentModalY > 120) {
    closeModal();
  } else {
    // Rebote elástico a la posición original.
    // Al quitar el estilo inline, el CSS toma el control y anima el retorno.
    dom.modal.style.transform = ""; 
  }
  currentModalY = 0;
}

// =================================================================
//          2. LÓGICA DE RENDERIZADO (OPTIMIZADA)
// =================================================================

function populateModal(cardElement) {
  if (!dom.template) return;
  
  const movieData = cardElement.movieData;
  const clone = dom.template.cloneNode(true);

  // Vinculamos datos al contenedor para que las actualizaciones de UI funcionen
  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  // Referencias locales para búsqueda acotada (Scoped Lookup - Mejora 2.A)
  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  // --- A. COLUMNA IZQUIERDA (FRONT) ---
  
  // 1. Imagen (Copia directa para evitar recarga de red)
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
  // 2. Título (Con lógica de tamaño de fuente)
  const titleEl = front.querySelector("#quick-view-title");
  titleEl.textContent = movieData.title;
  titleEl.classList.remove("title-long", "title-xl-long");
  
  const titleLen = movieData.title.length;
  if (titleLen > 40) titleEl.classList.add("title-xl-long");
  else if (titleLen > 20) titleEl.classList.add("title-long");

  // 3. Metadatos básicos
  front.querySelector('[data-template="director"]').textContent = movieData.directors || "";
  front.querySelector('[data-template="year"]').textContent = movieData.year || "";
  
  renderCountryFlag(
    front.querySelector('[data-template="country-container"]'),
    front.querySelector('[data-template="country-flag"]'),
    movieData.country_code,
    movieData.country
  );

  // 4. Iconos de Plataforma
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = "";
    if (movieData.collections_list) {
      const fragment = document.createDocumentFragment();
      movieData.collections_list.split(",").forEach(code => {
        const config = PLATFORM_DATA[code];
        if (config) {
          fragment.appendChild(createElement('span', {
            className: config.class ? `platform-icon ${config.class}` : `platform-icon`,
            title: config.title,
            innerHTML: `<svg width="${config.w}" height="${config.h}" fill="currentColor" viewBox="${config.vb}"><use href="${spriteUrl}#${config.id}"></use></svg>`
          }));
        }
      });
      iconsContainer.appendChild(fragment);
    }
  }
  
  // --- B. COLUMNA DERECHA (BACK/DETALLES) ---

  // 1. Título Original
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  if (movieData.original_title && movieData.original_title.trim() !== '') {
    const span = originalTitleWrapper.querySelector('span');
    span.textContent = movieData.original_title;
    
    span.classList.remove("title-long", "title-xl-long");
    const len = movieData.original_title.length;
    if (len > 40) span.classList.add("title-xl-long");
    else if (len > 20) span.classList.add("title-long");
    
    originalTitleWrapper.style.display = 'flex';
  } else {
    originalTitleWrapper.style.display = 'none';
  }

  // 2. Duración y Episodios
  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movieData.minutes, isSeries);

  const episodesEl = back.querySelector('[data-template="episodes"]');
  const epText = isSeries && movieData.episodes ? `${movieData.episodes} x` : "";
  episodesEl.textContent = epText;
  episodesEl.style.display = epText ? "inline" : "none";

  // 3. Wikipedia
  const wikipediaLink = back.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikipediaLink.href = movieData.wikipedia;
    wikipediaLink.style.display = 'flex';
  } else {
    wikipediaLink.style.display = 'none';
  }

  // 4. Ratings (Reutilización de lógica centralizada)
  setupCardRatings(back, movieData);

  // 5. Textos Largos
  back.querySelector('[data-template="genre"]').textContent = movieData.genres || "No disponible";
  back.querySelector('[data-template="actors"]').textContent = movieData.actors || "No disponible";
  back.querySelector('[data-template="synopsis"]').textContent = movieData.synopsis || "No disponible";
  
  const criticContainer = back.querySelector('[data-template="critic-container"]');
  if (movieData.critic?.trim()) {
    criticContainer.querySelector('[data-template="critic"]').textContent = movieData.critic;
    criticContainer.style.display = 'block';
  } else {
    criticContainer.style.display = 'none';
  }
  
  // --- C. MONTAJE FINAL ---
  dom.content.textContent = "";
  dom.content.appendChild(clone);

  // Inicializamos interactividad interna (estrellas, watchlist)
  updateCardUI(dom.content);
  initializeCard(dom.content);
  
  // Listener para cerrar al navegar por director
  dom.content.addEventListener("click", handleDirectorClick);
}

// =================================================================
//          3. API PÚBLICA (Control de Modal)
// =================================================================

export function closeModal() {
  if (!dom.modal.classList.contains("is-visible")) return;
  
  // Animación de salida (CSS)
  dom.modal.classList.remove("is-visible");
  dom.overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  
  // LIMPIEZA POST-ANIMACIÓN:
  // Es vital limpiar el transform inline por si el usuario cerró arrastrando a medias.
  // Usamos setTimeout coincidiendo con la duración de la transición CSS (300ms).
  setTimeout(() => {
      dom.modal.style.transform = ""; 
  }, 300);

  // Accesibilidad y limpieza de listeners
  closeAccessibleModal(dom.modal, dom.overlay);
  document.removeEventListener("click", handleOutsideClick);
}

export function openModal(cardElement) {
  if (!cardElement) return;
  
  // 1. Preparar UI
  unflipAllCards();
  
  // 2. Poblar datos
  populateModal(cardElement);
  document.body.classList.add("modal-open");
  
  // 3. Mostrar con animación
  requestAnimationFrame(() => {
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    
    // 4. Activar trampas de foco (Esto es lo que causa el scroll indeseado)
    openAccessibleModal(dom.modal, dom.overlay);
    
    // 🔥 FIX CRÍTICO: Forzar scroll al inicio (Top)
    // Usamos un setTimeout para ejecutar esto DESPUÉS de que el navegador 
    // haya intentado hacer scroll hacia el botón enfocado (Watchlist).
    // Esto "gana" la pelea contra el comportamiento nativo del navegador.
    setTimeout(() => {
      if (dom.content) dom.content.scrollTop = 0;
    }, 10); // 10ms es suficiente para ocurrir en el siguiente ciclo de pintado

    setTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
  });
}

export function initQuickView() {
  if (!dom.modal) {
    console.error("Elemento modal no encontrado en el DOM.");
    return;
  }

  // Listener Teclado (Esc)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  // Listeners Táctiles (Optimización: Solo en pantallas pequeñas)
  // Aunque CSS media query maneja el estilo, JS necesita saber si activar la lógica.
  if (window.matchMedia("(max-width: 768px)").matches) {
    // Usamos dom.modal como superficie táctil (incluye la barra de título/imagen)
    dom.modal.addEventListener("touchstart", handleModalTouchStart, { passive: true });
    dom.modal.addEventListener("touchmove", handleModalTouchMove, { passive: false }); // false para poder prevenir scroll
    dom.modal.addEventListener("touchend", handleModalTouchEnd, { passive: true });
  }
}