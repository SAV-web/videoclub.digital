// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.js
//  RESPONSABILIDAD: Gestión de vista detallada, navegación y gestos.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { setupCardRatings } from "./rating.js";
import { formatRuntime, createElement, renderCountryFlag, executeViewTransition } from "../utils.js"; 
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
  template: document.getElementById("quick-view-template")?.content,
  prevBtn: document.getElementById("modal-prev-btn"),
  nextBtn: document.getElementById("modal-next-btn"),
});

/**
 * Resetea las transformaciones CSS aplicadas por gestos táctiles.
 */
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

// Estado para la transición Hero (Card -> Modal)
let activeHeroCard = null;

const SWIPE_X_THRESHOLD = 80;
const SWIPE_Y_CLOSE_THRESHOLD = 120;
const MODAL_TRANSITION_MS = 400;

// Contador para evitar race conditions al modificar el view-transition del header
let modalTransitionCount = 0;

// =================================================================
//          1. GESTIÓN DE EVENTOS (Navegación y Cierre)
// =================================================================

/**
 * Cierra el modal si se hace clic fuera del contenido.
 * @param {MouseEvent} event 
 */
function handleOutsideClick(event) {
  const { modal } = getDom();
  // No cerramos si se hace click en una card del grid para permitir navegación directa.
  const isClickInsideCard = event.target.closest(".movie-card");
  
  if (modal.classList.contains("is-visible") && !modal.contains(event.target) && !isClickInsideCard) {
    closeModal();
  }
}

/**
 * Maneja clics en metadatos (Director/Actor) para filtrar.
 * @param {MouseEvent} event 
 */
function handleMetadataClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  const actorLink = event.target.closest('[data-template="actors"] a[data-actor-name]');

  if (directorLink || actorLink) {
    // Permitir comportamiento predeterminado (abrir en nueva pestaña) si se usan teclas modificadoras
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

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

/**
 * Inicia el seguimiento del gesto táctil.
 * @param {TouchEvent} e 
 */
function handleTouchStart(e) {
  const { modal } = getDom();
  touchState.startY = e.touches[0].clientY;
  touchState.startX = e.touches[0].clientX;
  touchState.isDragging = false;
  touchState.isHorizontalSwipe = false;
  
  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS si estaba desactivada
}

/**
 * Procesa el movimiento del dedo (Arrastre vertical o Swipe horizontal).
 * @param {TouchEvent} e 
 */
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

/**
 * Finaliza el gesto y decide la acción (Cerrar, Navegar o Resetear).
 * @param {TouchEvent} e 
 */
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

/**
 * Obtiene la lista de tarjetas visibles en el grid principal.
 * @returns {HTMLElement[]}
 */
function getGridCards() {
  const grid = document.getElementById("grid-container");
  if (!grid) return [];
  return Array.from(grid.querySelectorAll(".movie-card"));
}

/**
 * Navega a la tarjeta anterior o siguiente.
 * @param {number} direction - -1 (Anterior) o 1 (Siguiente).
 */
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

/**
 * Actualiza el estado (habilitado/deshabilitado) de los botones de navegación.
 * @param {number|string} currentId 
 * @param {HTMLElement[]|null} contextCards 
 */
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
const createLink = (text, type) => {
  const param = type === 'director' ? 'dir' : 'actor';
  return createElement("a", { 
    textContent: text, 
    href: `?${param}=${encodeURIComponent(text)}`, 
    dataset: { [type === 'director' ? 'directorName' : 'actorName']: text } 
  });
};

/**
 * Mapea los nodos del modal mediante sus contratos de datos (data-template)
 * para no depender de la estructura jerárquica exacta del DOM.
 * @param {HTMLElement} root 
 */
function getModalNodes(root) {
  const nodes = {};
  root.querySelectorAll('[data-template]').forEach(el => {
    nodes[el.dataset.template] = el;
  });
  nodes.img = root.querySelector("img");
  nodes.iconsContainer = root.querySelector(".card-icons-line");
  nodes.origTitleWrap = root.querySelector(".back-original-title-wrapper");
  return nodes;
}

/**
 * Configura la cabecera del modal (Póster, Título, Info básica).
 * @param {Object} nodes - Diccionario de nodos UI referenciados.
 * @param {Object} movie - Datos de la película.
 */
function setupModalHeader(nodes, movie) {
  // Imagen
  if (nodes.img) {
    nodes.img.src = movie.image_hq || movie.posterUrl || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    nodes.img.alt = `Póster de ${movie.title}`;
  }

  // Título
  if (nodes.title) {
    nodes.title.textContent = movie.title;
    nodes.title.className = ""; // Reset clases
    if (movie.title.length > 45) nodes.title.classList.add("title-xl-long");
    else if (movie.title.length > 25) nodes.title.classList.add("title-long");
  }

  // Director
  if (nodes.director) {
    nodes.director.textContent = "";
    if (movie.parsedDirectors.length > 0) {
      movie.parsedDirectors.forEach((name, i, arr) => {
        nodes.director.appendChild(createLink(name, 'director'));
        if (i < arr.length - 1) nodes.director.append(", ");
      });
    }
  }

  // Año y País
  if (nodes.year) nodes.year.textContent = movie.displayYear;
  renderCountryFlag(
    nodes["country-container"],
    nodes["country-flag"],
    movie.country_code,
    movie.country
  );

  // Iconos Plataforma
  if (nodes.iconsContainer) {
    nodes.iconsContainer.innerHTML = "";
    const codes = movie.studioList;
    
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
        nodes.iconsContainer.appendChild(span);
      }
    });
  }
}

/**
 * Configura los detalles extendidos del modal (Sinopsis, Reparto, etc.).
 * @param {Object} nodes - Diccionario de nodos UI referenciados.
 * @param {Object} movie - Datos de la película.
 */
function setupModalDetails(nodes, movie) {
  // Título Original
  if (nodes.origTitleWrap && nodes["original-title"]) {
    const actualOriginalTitle = movie.displayOriginalTitle;
    nodes["original-title"].textContent = actualOriginalTitle;
    nodes["original-title"].className = ""; // Reset
    if (actualOriginalTitle.length > 40) nodes["original-title"].classList.add("title-xl-long");
    else if (actualOriginalTitle.length > 30) nodes["original-title"].classList.add("title-long");
    else if (actualOriginalTitle.length > 20) nodes["original-title"].classList.add("title-medium");
    nodes.origTitleWrap.hidden = false; // Siempre visible
  }

  // Duración y Episodios
  if (nodes.duration) nodes.duration.textContent = formatRuntime(movie.minutes, movie.isSeries);
  
  if (nodes.episodes) {
    nodes.episodes.textContent = movie.displayEpisodes;
    nodes.episodes.hidden = !movie.displayEpisodes;
  }

  // Links Externos
  const setupLink = (key, url) => {
    const el = nodes[`${key}-link`];
    if (!el) return;
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
  if (nodes.genre) nodes.genre.textContent = movie.genres || "N/A";
  if (nodes.synopsis) nodes.synopsis.textContent = movie.synopsis || "N/A";
  
  if (nodes["critic-container"] && nodes.critic) {
    if (movie.hasCritic) {
      nodes.critic.textContent = movie.critic;
      nodes["critic-container"].hidden = false;
    } else { 
      nodes["critic-container"].hidden = true; 
    }
  }

  // Actores
  if (nodes.actors) {
    nodes.actors.textContent = "";
    if (movie.parsedActors.length > 0) {
      movie.parsedActors.forEach((name, i, arr) => {
        if (IGNORED_ACTORS.includes(name.toLowerCase())) {
          nodes.actors.append(name);
        } else {
          nodes.actors.appendChild(createLink(name, 'actor'));
        }
        if (i < arr.length - 1) nodes.actors.append(", ");
      });
    } else {
      nodes.actors.textContent = "N/A";
    }
  }
}

/**
 * Puebla el contenido del modal clonando la plantilla y asignando datos.
 * @param {HTMLElement} cardElement - Tarjeta original del grid.
 * @param {HTMLElement[]|null} contextCards - Contexto de navegación.
 */
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

  // FIX CRÍTICO: Asignar ID y datos a la tarjeta clonada.
  // Esto permite que 'updateCardUI' (llamado por rating.js al salir del hover) encuentre la tarjeta y sus datos.
  cardClone.dataset.movieId = movie.id;
  cardClone.movieData = movie;

  // Reset UI
  if (!modal.classList.contains("is-visible")) modal.classList.remove("hide-arrows");
  
  // Binding de Datos
  // Almacenamos movieData en el nodo para navegación entre fichas.
  content.movieData = movie;
  content.dataset.movieId = movie.id;

  // Obtener referencias planas usando el helper
  const nodes = getModalNodes(cardClone);

  // --- CAPA 1: CRÍTICA (Síncrona) ---
  // Elementos visuales principales para la primera impresión (Póster, Título, Año)
  setupModalHeader(nodes, movie);

  // Montaje
  content.textContent = "";
  content.appendChild(clone);

  // Inicializar interactividad básica
  updateCardUI(content);
  initializeCard(content);
  updateNavButtons(movie.id, contextCards);

  // --- CAPA 2: DETALLES (Asíncrona / Diferida) ---
  // Texto denso, listas y elementos secundarios.
  // Se difiere para permitir que el navegador priorice la animación de apertura (Paint).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Guard clause: Asegurar que seguimos en la misma película
      if (content.dataset.movieId !== String(movie.id)) return;
      
      setupModalDetails(nodes, movie);
      setupCardRatings(cardClone, movie); // Reutilizado de rating.js buscando en toda la tarjeta
    });
  });
}

// =================================================================
//          5. API PÚBLICA
// =================================================================

/**
 * Cierra el modal con animación y limpieza.
 */
export function closeModal() {
  const { modal, overlay } = getDom();
  if (!modal.classList.contains("is-visible")) return;
  
  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  const performClose = () => {
    modal.classList.remove("is-visible");
    overlay.classList.remove("is-visible");
    document.body.classList.remove(CSS_CLASSES.MODAL_OPEN);
    
    // Limpieza
    setTimeout(resetModalTransform, MODAL_TRANSITION_MS);
    closeAccessibleModal(modal, overlay);
  };

  // View Transition (Hero Reverso: Modal -> Card). El helper maneja el fallback y el a11y.
  if (activeHeroCard) {
    modal.style.viewTransitionName = "hero-expansion";
    activeHeroCard.style.viewTransitionName = "hero-expansion";

    const transition = executeViewTransition(() => {
      modal.style.viewTransitionName = ""; 
      performClose();
    });

    transition.finished.finally(() => {
      if (activeHeroCard) activeHeroCard.style.viewTransitionName = "";
      activeHeroCard = null;
      
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header) header.style.viewTransitionName = "";
    });
  } else {
    executeViewTransition(performClose).finished.finally(() => {
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header) header.style.viewTransitionName = "";
    });
  }

  document.removeEventListener("click", handleOutsideClick);
}

/**
 * Abre el modal para una tarjeta específica.
 * @param {HTMLElement} cardElement 
 * @param {HTMLElement[]|null} contextCards 
 */
export function openModal(cardElement, contextCards = null) {
  if (!cardElement) return;
  const { modal, overlay, content } = getDom();
  
  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  // Guardar referencia para el cierre
  activeHeroCard = cardElement;

  unflipAllCards();
  populateModal(cardElement, contextCards);
  
  const performOpen = () => {
    document.body.classList.add(CSS_CLASSES.MODAL_OPEN);
    requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      overlay.classList.add("is-visible");
      openAccessibleModal(modal, overlay, false);
      if (content) content.scrollTop = 0;
      setTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
    });
  };

  cardElement.style.viewTransitionName = "hero-expansion";
  
  const transition = executeViewTransition(() => {
    performOpen();
    modal.style.viewTransitionName = "hero-expansion"; 
    cardElement.style.viewTransitionName = ""; 
  });

  transition.finished.finally(() => {
    modalTransitionCount--;
    if (modalTransitionCount === 0 && header) header.style.viewTransitionName = "";
  });
}

/**
 * Inicializa los listeners globales del modal (Teclado, Gestos).
 */
export function initQuickView() {
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) return;

  // Delegación de eventos en contenido
  if (content) {
    content.addEventListener("click", (e) => {
      handleMetadataClick(e);
      // Toggle flechas al tocar póster (Móvil/Tablet/Desktop)
      if (e.target.closest(".poster-container")) {
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