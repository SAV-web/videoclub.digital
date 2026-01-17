// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.js
//  RESPONSABILIDAD: Gestión de vista detallada, navegación y gestos.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { setupCardRatings } from "./rating.js";
import { formatRuntime, createElement, renderCountryFlag } from "../utils.js"; 
import { STUDIO_DATA, IGNORED_ACTORS, CSS_CLASSES } from "../constants.js";
import spriteUrl from "../../sprite.svg";

// --- Referencias DOM (Lazy Getter para seguridad) ---
// Lazy DOM getter:
// - evita referencias obsoletas tras re-render
// - coste mínimo (getElementById)
// - preferido a cachear nodos que pueden recrearse
const getDom = () => ({
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("movie-card-template")?.content,
  prevBtn: document.getElementById("modal-prev-btn"),
  nextBtn: document.getElementById("modal-next-btn"),
});

// 4.3. Helper para limpiar transformaciones (DRY)
const resetModalTransform = () => {
  const { modal } = getDom();
  if (modal) modal.style.transform = "";
};

// --- Estado de Gestos Táctiles ---
const touchState = {
  // 4.1. Invariante: Solo uno de isDragging / isHorizontalSwipe puede ser true a la vez.
  startY: 0,
  startX: 0,
  currentY: 0,
  isDragging: false,
  isHorizontalSwipe: false
};

const SWIPE_X_THRESHOLD = 80;
const SWIPE_Y_CLOSE_THRESHOLD = 120;
const MODAL_TRANSITION_MS = 300;

// =================================================================
//          1. GESTIÓN DE EVENTOS (Navegación y Cierre)
// =================================================================

function handleOutsideClick(event) {
  const { modal } = getDom();
  // No cerramos si se hace click en una card del grid para permitir navegación directa.
  const isClickInsideCard = event.target.closest(".movie-card");
  
  if (modal.classList.contains("is-visible") && !modal.contains(event.target) && !isClickInsideCard) {
    closeModal();
  }
}

function handleMetadataClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  const actorLink = event.target.closest('[data-template="actors"] a[data-actor-name]');

  if (directorLink || actorLink) {
    event.preventDefault();
    closeModal();
    
    const filterType = directorLink ? "director" : "actor";
    const filterValue = directorLink ? directorLink.dataset.directorName : actorLink.dataset.actorName;

    // Evento global de integración:
    // - reset de filtros
    // - aplica filtro único (director/actor)
    // - respetado por sidebar + main
    document.dispatchEvent(new CustomEvent("filtersReset", {
      detail: { keepSort: true, newFilter: { type: filterType, value: filterValue } },
    }));
  }
}

// =================================================================
//          2. LÓGICA DE GESTOS (Swipe to Dismiss / Navigate)
// =================================================================

function handleTouchStart(e) {
  const { modal } = getDom();
  touchState.startY = e.touches[0].clientY;
  touchState.startX = e.touches[0].clientX;
  touchState.isDragging = false;
  touchState.isHorizontalSwipe = false;
  
  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS si estaba desactivada
}

function handleTouchMove(e) {
  // Salir rápido si no es un gesto válido o ya está cancelado
  // 4.2. Si otro handler ya capturó el gesto, no interferimos.
  if (!touchState.isDragging && !touchState.isHorizontalSwipe && e.defaultPrevented) return;

  const { modal, content } = getDom();
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchState.startY;
  const deltaX = currentX - touchState.startX;

  // 1. Detección de Intención (Primera vez)
  if (!touchState.isDragging && !touchState.isHorizontalSwipe) {
    if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return; // Umbral de ruido

    const SCROLL_TOLERANCE = 5; // FIX: Tolerancia para scroll inercial (iOS)

    // Gesto Vertical (Cierre): Solo si estamos arriba del todo y arrastramos hacia abajo
    if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0 && content.scrollTop <= SCROLL_TOLERANCE) {
      if (window.innerWidth <= 700) { // Solo móvil
        touchState.isDragging = true;
        modal.classList.add(CSS_CLASSES.IS_DRAGGING); // Desactivar transición para seguir el dedo
      }
    } 
    // Gesto Horizontal (Navegación)
    else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      touchState.isHorizontalSwipe = true;
    }
  }

  // 2. Ejecución
  if (touchState.isDragging) {
    if (e.cancelable) e.preventDefault();
    
    let translateY = deltaY;
    // Bonus: Rubber Banding (Resistencia exponencial al arrastrar hacia arriba/tope)
    if (translateY < 0) {
      translateY = -Math.pow(Math.abs(translateY), 0.75);
    }

    modal.style.transform = `translate(-50%, ${translateY}px)`;
    touchState.currentY = deltaY;
  } else if (touchState.isHorizontalSwipe) {
    if (e.cancelable) e.preventDefault(); // Evitar "Atrás/Adelante" del navegador
  }
}

function handleTouchEnd(e) {
  const { modal } = getDom();

  // A. Navegación Horizontal
  if (touchState.isHorizontalSwipe) {
    const deltaX = e.changedTouches[0].clientX - touchState.startX;
    if (Math.abs(deltaX) > SWIPE_X_THRESHOLD) { // Umbral de swipe
      navigateToSibling(deltaX < 0 ? 1 : -1);
    }
    touchState.isHorizontalSwipe = false;
    return;
  }

  // B. Cierre Vertical
  if (!touchState.isDragging) return;
  
  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS

  if (touchState.currentY > SWIPE_Y_CLOSE_THRESHOLD) { // Umbral de cierre
    closeModal();
  } else {
    resetModalTransform(); // Rebote elástico
  }
  
  touchState.currentY = 0;
  touchState.isDragging = false;
}

// =================================================================
//          3. NAVEGACIÓN ENTRE FICHAS
// =================================================================

// Helper para obtener la lista limpia de tarjetas del grid (ignorando la del modal)
function getGridCards() {
  const grid = document.getElementById("grid-container");
  if (!grid) return [];
  return Array.from(grid.querySelectorAll(".movie-card"));
}

function navigateToSibling(direction) {
  const { content } = getDom();
  const currentId = content.dataset.movieId;
  if (!currentId) return;

  const cards = getGridCards();
  const currentIndex = cards.findIndex(c => c.dataset.movieId === currentId);

  if (currentIndex === -1) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < cards.length) {
    openModal(cards[nextIndex], cards); // Optimización: Pasamos la lista para evitar re-query
  }
}

function updateNavButtons(currentId, contextCards = null) {
  const { prevBtn, nextBtn } = getDom();
  const strId = String(currentId); // Asegurar tipo para comparación
  
  const cards = contextCards || getGridCards(); // Reutilizar o consultar
  const currentIndex = cards.findIndex(c => c.dataset.movieId === strId);

  if (currentIndex === -1) return;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < cards.length - 1;

  if (prevBtn) {
    prevBtn.disabled = !hasPrev;
  }
  if (nextBtn) {
    nextBtn.disabled = !hasNext;
  }
}

// =================================================================
//          4. RENDERIZADO (POBLADO DE DATOS)
// =================================================================

// Helpers de Renderizado
const createLink = (text, type) => createElement("a", { 
  textContent: text, href: "#", dataset: { [type === 'director' ? 'directorName' : 'actorName']: text } 
});

function setupModalHeader(front, movie) {
  // Imagen
  const frontImg = front.querySelector("img");
  if (frontImg) {
    // Usar imagen HQ (dataset.src) si está disponible
    // FIX: movie.image es solo el ID. Usamos image_hq (URL real) o placeholder.
    frontImg.src = movie.image_hq || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    frontImg.alt = `Póster de ${movie.title}`;
  }

  // Título
  const titleEl = front.querySelector('[data-template="title"]');
  titleEl.textContent = movie.title;
  titleEl.id = "quick-view-title"; // Conectar con aria-labelledby del contenedor
  titleEl.className = ""; // Reset clases
  if (movie.title.length > 45) titleEl.classList.add("title-xl-long");
  else if (movie.title.length > 25) titleEl.classList.add("title-long");

  // Director
  const dirContainer = front.querySelector('[data-template="director"]');
  dirContainer.textContent = "";
  if (movie.directors) {
    movie.directors.split(", ").forEach((name, i, arr) => {
      dirContainer.appendChild(createLink(name.trim(), 'director'));
      if (i < arr.length - 1) dirContainer.append(", ");
    });
  }

  // Año y País
  const isSeries = movie.type?.toUpperCase().startsWith("S.");
  let yearText = movie.year || "";
  if (isSeries && movie.year_end) {
    yearText += movie.year_end === "M" ? " (M)" : (movie.year_end === "-" ? "-" : `-${movie.year_end.toString().slice(-2)}`);
  }
  front.querySelector('[data-template="year"]').textContent = yearText;
  renderCountryFlag(
    front.querySelector('[data-template="country-container"]'),
    front.querySelector('[data-template="country-flag"]'),
    movie.country_code,
    movie.country
  );

  // Iconos Plataforma
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = "";
    const codes = [...(movie.studios_list?.split(",") || []), ...(movie.selections_list?.split(",") || [])];
    
    codes.forEach(code => {
      const conf = STUDIO_DATA[code];
      if (conf) {
        const span = createElement('span', { className: `platform-icon ${conf.class || ''}`, title: conf.title });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", conf.w || "24"); svg.setAttribute("height", conf.h || "24");
        svg.setAttribute("fill", "currentColor"); svg.setAttribute("viewBox", conf.vb || "0 0 24 24");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `${spriteUrl}#${conf.id}`);
        svg.appendChild(use); span.appendChild(svg);
        iconsContainer.appendChild(span);
      }
    });
  }
}

function setupModalDetails(back, movie) {
  // Título Original
  const origTitle = back.querySelector('.back-original-title-wrapper');
  const hasOrig = movie.original_title && movie.original_title.trim() && 
                  movie.original_title.toLowerCase() !== movie.title.toLowerCase();
  
  if (hasOrig) {
    const span = origTitle.querySelector('span');
    span.textContent = movie.original_title;
    span.className = ""; // Reset
    if (movie.original_title.length > 40) span.classList.add("title-xl-long");
    else if (movie.original_title.length > 20) span.classList.add("title-long");
    origTitle.hidden = false;
  } else { origTitle.hidden = true; }

  // Duración y Episodios
  const isSeries = movie.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movie.minutes, isSeries);
  
  const epEl = back.querySelector('[data-template="episodes"]');
  const epText = isSeries && movie.episodes ? `${movie.episodes} x` : "";
  epEl.textContent = epText;
  epEl.hidden = !epText;

  // Links Externos
  const setupLink = (key, url) => {
    const el = back.querySelector(`[data-template="${key}-link"]`);
    if (url) {
      el.href = url; el.classList.remove('disabled'); el.setAttribute("aria-label", `Ver en ${key}`);
    } else {
      el.removeAttribute('href'); el.classList.add('disabled'); el.removeAttribute("aria-label");
    }
    el.hidden = false; // Siempre visible (habilitado o deshabilitado)
  };
  setupLink('justwatch', movie.justwatch);
  setupLink('wikipedia', movie.wikipedia);

  // Textos Largos
  back.querySelector('[data-template="genre"]').textContent = movie.genres || "N/A";
  back.querySelector('[data-template="synopsis"]').textContent = movie.synopsis || "N/A";
  
  const critic = back.querySelector('[data-template="critic-container"]');
  if (movie.critic?.trim()) {
    critic.querySelector('[data-template="critic"]').textContent = movie.critic;
    critic.hidden = false;
  } else { critic.hidden = true; }

  // Actores
  const actorsCont = back.querySelector('[data-template="actors"]');
  actorsCont.textContent = "";
  if (movie.actors) {
    movie.actors.split(",").forEach((name, i, arr) => {
      const actorName = name.trim();
      // Regla duplicada con card.js: actores ignorados no son clicables.
      if (IGNORED_ACTORS.includes(actorName.toLowerCase())) {
        actorsCont.append(actorName);
      } else {
        actorsCont.appendChild(createLink(actorName, 'actor'));
      }
      if (i < arr.length - 1) actorsCont.append(", ");
    });
  } else {
    actorsCont.textContent = "N/A";
  }
}

function populateModal(cardElement, contextCards = null) {
  const { template, content, modal } = getDom();
  if (!template) return;
  
  // Extraemos URL HQ si ya se cargó en la card para evitar parpadeo
  const cardImg = cardElement.querySelector("img");
  const image_hq = cardImg ? (cardImg.dataset.src || cardImg.src) : null;

  // Clon superficial para evitar mutaciones cruzadas con la card del grid.
  const movie = { ...cardElement.movieData, image_hq };

  const clone = template.cloneNode(true);
  const cardClone = clone.querySelector('.movie-card');
  cardClone.classList.add('is-quick-view');

  // Reset UI
  if (!modal.classList.contains("is-visible")) modal.classList.remove("hide-arrows");
  
  // Binding de Datos
  // Almacenamos movieData en el nodo para navegación entre fichas.
  content.movieData = movie;
  content.dataset.movieId = movie.id;

  const front = clone.querySelector(".flip-card-front");
  const back = clone.querySelector(".flip-card-back");

  setupModalHeader(front, movie);
  setupModalDetails(back, movie);
  setupCardRatings(back, movie); // Reutilizado de card.js

  // Montaje
  content.textContent = "";
  content.appendChild(clone);

  // Inicializar interactividad
  updateCardUI(content);
  initializeCard(content);
  updateNavButtons(movie.id, contextCards);
}

// =================================================================
//          5. API PÚBLICA
// =================================================================

export function closeModal() {
  const { modal, overlay } = getDom();
  if (!modal.classList.contains("is-visible")) return;
  
  modal.classList.remove("is-visible");
  overlay.classList.remove("is-visible");
  document.body.classList.remove(CSS_CLASSES.MODAL_OPEN);
  
  // Limpieza
  setTimeout(resetModalTransform, MODAL_TRANSITION_MS);
  closeAccessibleModal(modal, overlay);
  document.removeEventListener("click", handleOutsideClick);
}

export function openModal(cardElement, contextCards = null) {
  if (!cardElement) return;
  const { modal, overlay, content } = getDom();
  
  unflipAllCards();
  populateModal(cardElement, contextCards);
  document.body.classList.add(CSS_CLASSES.MODAL_OPEN);
  
  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    overlay.classList.add("is-visible");
    openAccessibleModal(modal, overlay, false); // false = No enfocar contenido automáticamente
    if (content) content.scrollTop = 0;
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
  });
}

export function initQuickView() {
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) return;

  // Delegación de eventos en contenido
  if (content) {
    content.addEventListener("click", (e) => {
      handleMetadataClick(e);
      // Toggle flechas en móvil al tocar póster
      if (window.innerWidth <= 700 && e.target.closest(".poster-container")) {
        modal.classList.toggle("hide-arrows");
      }
    });
  }

  // Teclado
  // Listener global único; initQuickView solo debe llamarse una vez.
  window.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("is-visible")) return;
    if (e.key === "Escape") {
      e.stopPropagation(); // Detener para que no cierre el sidebar u otros elementos
      closeModal();
    }
    else if (e.key === "ArrowLeft") navigateToSibling(-1);
    else if (e.key === "ArrowRight") navigateToSibling(1);
  }, { capture: true }); // IMPORTANTE: Capturar antes que document (main.js)

  // Botones
  prevBtn?.addEventListener("click", (e) => { e.stopPropagation(); navigateToSibling(-1); });
  nextBtn?.addEventListener("click", (e) => { e.stopPropagation(); navigateToSibling(1); });

  // Gestos
  if (navigator.maxTouchPoints > 0) {
    modal.addEventListener("touchstart", handleTouchStart, { passive: true });
    modal.addEventListener("touchmove", handleTouchMove, { passive: false });
    modal.addEventListener("touchend", handleTouchEnd, { passive: true });
    modal.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  }
}