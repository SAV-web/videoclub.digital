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
import { STUDIO_DATA } from "../constants.js";
import spriteUrl from "../../sprite.svg";

// --- Referencias DOM Cacheadas ---
const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("movie-card-template")?.content,
  prevBtn: document.getElementById("modal-prev-btn"),
  nextBtn: document.getElementById("modal-next-btn"),
};

// --- Estado de Gestos Táctiles ---
let touchStartY = 0;
let touchStartX = 0;
let currentModalY = 0;
let isDraggingModal = false;
let isHorizontalSwipe = false;

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
 * Permite filtrar por director o actor al hacer clic en su nombre dentro de la modal.
 * Dispara el evento global de reseteo de filtros.
 */
function handleMetadataClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  const actorLink = event.target.closest('[data-template="actors"] a[data-actor-name]');

  if (directorLink || actorLink) {
    event.preventDefault();
    closeModal();
    
    const filterType = directorLink ? "director" : "actor";
    const filterValue = directorLink ? directorLink.dataset.directorName : actorLink.dataset.actorName;

    document.dispatchEvent(
      new CustomEvent("filtersReset", {
        detail: { 
          keepSort: true, 
          newFilter: { type: filterType, value: filterValue } 
        },
      })
    );
  }
}

// --- Lógica de Gestos (Swipe to Dismiss) ---

function handleModalTouchStart(e) {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  
  // Reseteamos estados
  isDraggingModal = false;
  isHorizontalSwipe = false;
  
  // Eliminamos transición para respuesta inmediata si empezamos a arrastrar
  dom.modal.classList.remove("is-dragging"); 
}

function handleModalTouchMove(e) {
  // Si ya decidimos que no es un gesto válido, salimos
  if (!isDraggingModal && !isHorizontalSwipe && e.defaultPrevented) return;

  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchStartY;
  const deltaX = currentX - touchStartX;

  // 1. DETECCIÓN DE INTENCIÓN (Solo la primera vez que movemos)
  if (!isDraggingModal && !isHorizontalSwipe) {
    // Umbral mínimo para evitar ruido
    if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;

    // Si el movimiento es vertical y estamos arriba del todo -> DISMISS
    if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0 && dom.content.scrollTop <= 0) {
      isDraggingModal = true;
      dom.modal.classList.add("is-dragging"); // Quitar transición CSS
    } 
    // Si el movimiento es horizontal -> NAVEGACIÓN
    else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      isHorizontalSwipe = true;
    }
  }

  // 2. EJECUCIÓN DEL GESTO
  if (isDraggingModal) {
    if (e.cancelable) e.preventDefault(); // Evitar scroll
    dom.modal.style.transform = `translate(-50%, ${deltaY}px)`; // Mover modal
    currentModalY = deltaY;
  } else if (isHorizontalSwipe) {
    if (e.cancelable) e.preventDefault(); // Evitar gestos de navegador (atrás/adelante)
  }
}

function handleModalTouchEnd(e) {
  // A. GESTO HORIZONTAL (Navegación)
  if (isHorizontalSwipe) {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const SWIPE_THRESHOLD = 80; // Píxeles para considerar swipe
    
    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      // Izquierda (< 0) -> Siguiente | Derecha (> 0) -> Anterior
      navigateToSibling(deltaX < 0 ? 1 : -1);
    }
    isHorizontalSwipe = false;
    return;
  }

  // B. GESTO VERTICAL (Cierre)
  if (!isDraggingModal) return;
  
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
  isDraggingModal = false;
}

/**
 * Navega a la película anterior (-1) o siguiente (1) en el grid actual.
 */
function navigateToSibling(direction) {
  const currentId = dom.content.dataset.movieId;
  if (!currentId) return;

  // Buscamos la tarjeta actual en el grid para encontrar a sus vecinos
  const currentCard = document.querySelector(`.movie-card[data-movie-id="${currentId}"]`);
  if (!currentCard) return;

  const sibling = direction === 1 ? currentCard.nextElementSibling : currentCard.previousElementSibling;
  
  // Si existe y es una tarjeta (no un esqueleto o mensaje de error), la abrimos
  if (sibling && sibling.classList.contains('movie-card')) {
    openModal(sibling);
  }
}

/**
 * Actualiza el estado (habilitado/deshabilitado) de las flechas de navegación
 * basándose en si existen tarjetas hermanas en el grid.
 */
function updateNavButtons(currentId) {
  const currentCard = document.querySelector(`.movie-card[data-movie-id="${currentId}"]`);
  if (!currentCard) return;

  const prev = currentCard.previousElementSibling;
  const next = currentCard.nextElementSibling;
  
  const hasPrev = prev && prev.classList.contains('movie-card');
  const hasNext = next && next.classList.contains('movie-card');

  if (dom.prevBtn) {
    dom.prevBtn.disabled = !hasPrev;
    dom.prevBtn.style.opacity = hasPrev ? "1" : "0";
    dom.prevBtn.style.pointerEvents = hasPrev ? "auto" : "none";
  }
  if (dom.nextBtn) {
    dom.nextBtn.disabled = !hasNext;
    dom.nextBtn.style.opacity = hasNext ? "1" : "0";
    dom.nextBtn.style.pointerEvents = hasNext ? "auto" : "none";
  }
}

// =================================================================
//          2. LÓGICA DE RENDERIZADO (OPTIMIZADA)
// =================================================================

function populateModal(cardElement) {
  if (!dom.template) return;
  
  const movieData = cardElement.movieData;
  const clone = dom.template.cloneNode(true);
  
  // Añadimos clase modificadora para que el CSS sepa que es una modal
  const cardClone = clone.querySelector('.movie-card');
  cardClone.classList.add('is-quick-view');

  // Vinculamos datos al contenedor para que las actualizaciones de UI funcionen
  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  // Referencias locales para búsqueda acotada (Scoped Lookup - Mejora 2.A)
  const front = clone.querySelector(".flip-card-front");
  const back = clone.querySelector(".flip-card-back");

  // --- A. COLUMNA IZQUIERDA (FRONT) ---
  
  // 1. Imagen (Copia directa para evitar recarga de red)
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    // FIX: Usar dataset.src (HQ) si está disponible.
    // Esto evita copiar el LQIP borroso si la tarjeta original aún no se ha cargado en el grid.
    frontImg.src = cardImg.dataset.src || cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
  // 2. Título (Con lógica de tamaño de fuente)
  const titleEl = front.querySelector('[data-template="title"]');
  titleEl.textContent = movieData.title;
  titleEl.classList.remove("title-long", "title-xl-long");
  
  const titleLen = movieData.title.length;
  if (titleLen > 45) titleEl.classList.add("title-xl-long");
  else if (titleLen > 25) titleEl.classList.add("title-long");

  // 3. Metadatos básicos
  const directorContainer = front.querySelector('[data-template="director"]');
  directorContainer.textContent = "";
  if (movieData.directors) {
    movieData.directors.split(", ").forEach((name, index, arr) => {
      const link = createElement("a", { textContent: name.trim(), href: "#", dataset: { directorName: name.trim() } });
      directorContainer.appendChild(link);
      if (index < arr.length - 1) directorContainer.appendChild(document.createTextNode(", "));
    });
  }

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
    
    const codes = [
      ...(movieData.studios_list ? movieData.studios_list.split(",") : []),
      ...(movieData.selections_list ? movieData.selections_list.split(",") : [])
    ];

    if (codes.length > 0) {
      const fragment = document.createDocumentFragment();
      codes.forEach(code => {
        const config = STUDIO_DATA[code];
        if (config) {
          fragment.appendChild(createElement('span', {
            className: config.class ? `platform-icon ${config.class}` : `platform-icon`,
            title: config.title,
            innerHTML: `<svg width="${config.w || 24}" height="${config.h || 24}" fill="currentColor" viewBox="${config.vb || '0 0 24 24'}"><use href="${spriteUrl}#${config.id}"></use></svg>`
          }));
        }
      });
      iconsContainer.appendChild(fragment);
    }
  }
  
  // --- B. COLUMNA DERECHA (BACK/DETALLES) ---

  // 1. Título Original
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  const showOriginalTitle = movieData.original_title &&
                            movieData.original_title.trim() !== "" &&
                            movieData.original_title.trim().toLowerCase() !== movieData.title.trim().toLowerCase();

  if (showOriginalTitle) {
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
  const formattedEpisodes = movieData.episodes ? movieData.episodes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  const epText = isSeries && movieData.episodes ? `${formattedEpisodes} x` : "";
  episodesEl.textContent = epText;
  episodesEl.style.display = epText ? "inline" : "none";

  // 3. JustWatch
  const jwLink = back.querySelector('[data-template="justwatch-link"]');
  if (movieData.justwatch) {
    jwLink.href = movieData.justwatch;
    jwLink.classList.remove('disabled');
  } else {
    jwLink.removeAttribute('href');
    jwLink.classList.add('disabled');
  }
  jwLink.style.display = 'flex';

  // 3. Wikipedia
  const wikipediaLink = back.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikipediaLink.href = movieData.wikipedia;
    wikipediaLink.classList.remove('disabled');
  } else {
    wikipediaLink.removeAttribute('href');
    wikipediaLink.classList.add('disabled');
  }
  wikipediaLink.style.display = 'flex';

  // 4. Ratings (Reutilización de lógica centralizada)
  setupCardRatings(back, movieData);

  // 5. Textos Largos
  back.querySelector('[data-template="genre"]').textContent = movieData.genres || "No disponible";
  
  const actorsContainer = back.querySelector('[data-template="actors"]');
  actorsContainer.textContent = "";
  if (movieData.actors) {
    movieData.actors.split(",").forEach((name, index, arr) => {
      const link = createElement("a", { textContent: name.trim(), href: "#", dataset: { actorName: name.trim() } });
      actorsContainer.appendChild(link);
      if (index < arr.length - 1) actorsContainer.appendChild(document.createTextNode(", "));
    });
  } else {
    actorsContainer.textContent = "No disponible";
  }

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
  
  // Actualizamos estado de las flechas
  updateNavButtons(movieData.id);
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
    openAccessibleModal(dom.modal, dom.overlay, true); // true = No enfocar el primer elemento (Director)
    
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

  // Listener para cerrar al navegar por director o actor (Delegación de eventos)
  if (dom.content) dom.content.addEventListener("click", handleMetadataClick);

  // Listener Teclado (Esc + Navegación)
  window.addEventListener("keydown", (e) => {
    if (!dom.modal.classList.contains("is-visible")) return;

    if (e.key === "Escape") {
      closeModal();
    } else if (e.key === "ArrowLeft") {
      navigateToSibling(-1);
    } else if (e.key === "ArrowRight") {
      navigateToSibling(1);
    }
  });

  // Listeners para flechas de navegación (Desktop)
  if (dom.prevBtn) dom.prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateToSibling(-1);
  });
  if (dom.nextBtn) dom.nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateToSibling(1);
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