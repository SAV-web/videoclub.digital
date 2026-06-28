/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.ts
//  RESPONSABILIDAD: Gestión de vista detallada, navegación y gestos.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { setupCardRatings } from "./rating.js";
import { appEvents } from "../state.js";
import { formatRuntime, createElement, renderCountryFlag, executeViewTransition } from "../utils.js"; 
import { STUDIO_DATA, IGNORED_ACTORS, CSS_CLASSES } from "../constants.js";
import spriteUrl from "../../sprite.svg";
import { Movie, MappedMovie } from "../types.js";

interface MovieCardElement extends HTMLElement {
  movieData?: Movie;
}

interface MovieContentElement extends HTMLElement {
  movieData?: Movie;
}

interface ModalDom {
  overlay: HTMLElement | null;
  modal: HTMLElement | null;
  content: MovieContentElement | null;
  template: DocumentFragment | undefined;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
}

export interface ExtendedMovie extends MappedMovie {
  image_hq?: string | null;
  // Propiedades para personas en caso de person-card
  name?: string;
  place_of_birth?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  biography?: string | null;
  countries?: { code: string; name: string };
  isPerson?: boolean;
}

// --- Referencias DOM (Lazy Getter para seguridad) ---
const getDom = (): ModalDom => {
  const templateEl = document.getElementById("quick-view-template") as HTMLTemplateElement | null;
  return {
    overlay: document.getElementById("quick-view-overlay"),
    modal: document.getElementById("quick-view-modal"),
    content: document.getElementById("quick-view-content") as MovieContentElement | null,
    template: templateEl?.content,
    prevBtn: document.getElementById("modal-prev-btn") as HTMLButtonElement | null,
    nextBtn: document.getElementById("modal-next-btn") as HTMLButtonElement | null,
  };
};

/**
 * Resetea las transformaciones CSS aplicadas por gestos táctiles.
 */
const resetModalTransform = (): void => {
  const { modal } = getDom();
  if (modal) modal.style.transform = "";
};

// --- Estado de Gestos Táctiles ---
interface TouchState {
  startY: number;
  startX: number;
  currentY: number;
  startTime: number;
  isDragging: boolean;
  isHorizontalSwipe: boolean;
}

const touchState: TouchState = {
  startY: 0,
  startX: 0,
  currentY: 0,
  startTime: 0,
  isDragging: false,
  isHorizontalSwipe: false
};

// Estado para la transición Hero (Card -> Modal)
let activeHeroCard: HTMLElement | null = null;

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
 */
function handleOutsideClick(event: MouseEvent): void {
  const { modal } = getDom();
  if (!modal) return;

  const target = event.target as HTMLElement;
  // No cerramos si se hace click en una card del grid para permitir navegación directa.
  const isClickInsideCard = target.closest(".movie-card");
  
  if (modal.classList.contains("is-visible") && !modal.contains(target) && !isClickInsideCard) {
    closeModal();
  }
}

/**
 * Maneja clics en metadatos (Director/Actor) para filtrar.
 */
function handleMetadataClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const directorLink = target.closest<HTMLElement>(".front-director-info a[data-director-name]");
  const actorLink = target.closest<HTMLElement>('[data-template="actors"] a[data-actor-name]');
  const yearLink = target.closest<HTMLElement>("a[data-year-value]");

  if (directorLink || actorLink || yearLink) {
    // Permitir comportamiento predeterminado (abrir en nueva pestaña) si se usan teclas modificadoras
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    closeModal();
    
    let filterType: "director" | "actor" | "year";
    let filterValue: string | undefined;

    if (directorLink) { 
      filterType = "director"; 
      filterValue = directorLink.dataset.directorName; 
    } else if (actorLink) { 
      filterType = "actor"; 
      filterValue = actorLink.dataset.actorName; 
    } else { 
      filterType = "year"; 
      filterValue = yearLink?.dataset.yearValue; 
    }

    // Evento global de integración
    appEvents.emit("filtersReset", {
      keepSort: true, 
      newFilter: { type: filterType, value: filterValue }
    });
  }
}

// =================================================================
//          2. LÓGICA DE GESTOS (Swipe to Dismiss / Navigate)
// =================================================================

/**
 * Inicia el seguimiento del gesto táctil.
 */
function handleTouchStart(e: TouchEvent): void {
  const { modal } = getDom();
  if (!modal) return;

  touchState.startY = e.touches[0].clientY;
  touchState.startX = e.touches[0].clientX;
  touchState.isDragging = false;
  touchState.isHorizontalSwipe = false;
  touchState.startTime = Date.now();
  
  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS si estaba desactivada
}

/**
 * Procesa el movimiento del dedo (Arrastre vertical o Swipe horizontal).
 */
function handleTouchMove(e: TouchEvent): void {
  // Salir rápido si no es un gesto válido o ya está cancelado
  if (!touchState.isDragging && !touchState.isHorizontalSwipe && e.defaultPrevented) return;

  const { modal, content } = getDom();
  if (!modal || !content) return;

  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchState.startY;
  const deltaX = currentX - touchState.startX;

  // 1. Detección de Intención (Primera vez)
  if (!touchState.isDragging && !touchState.isHorizontalSwipe) {
    if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return; // Umbral de ruido

    const SCROLL_TOLERANCE = 5; // Tolerancia para scroll inercial (iOS)

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
    // Rubber Banding (Resistencia exponencial al arrastrar hacia arriba/tope)
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
 */
function handleTouchEnd(e: TouchEvent): void {
  const { modal } = getDom();
  if (!modal) return;

  const duration = Date.now() - touchState.startTime;

  // A. Navegación Horizontal
  if (touchState.isHorizontalSwipe) {
    const deltaX = e.changedTouches[0].clientX - touchState.startX;
    const velocityX = Math.abs(deltaX) / (duration || 1);
    if (Math.abs(deltaX) > SWIPE_X_THRESHOLD || velocityX > 0.4) { // Distancia O "Flick" rápido
      navigateToSibling(deltaX < 0 ? 1 : -1);
    }
    touchState.isHorizontalSwipe = false;
    return;
  }

  // B. Cierre Vertical
  if (!touchState.isDragging) return;
  
  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS

  const velocityY = touchState.currentY / (duration || 1);
  if (touchState.currentY > SWIPE_Y_CLOSE_THRESHOLD || velocityY > 0.5) { // Distancia O Inercia hacia abajo
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
 */
function getGridCards(): HTMLElement[] {
  const grid = document.getElementById("grid-container");
  if (!grid) return [];
  return Array.from(grid.querySelectorAll<HTMLElement>(".movie-card[data-movie-id]"));
}

/**
 * Navega a la tarjeta anterior o siguiente.
 * @param {number} direction - -1 (Anterior) o 1 (Siguiente).
 */
function navigateToSibling(direction: number): void {
  const { content } = getDom();
  if (!content) return;

  const currentId = content.dataset.movieId;
  if (!currentId) return;

  const cards = getGridCards();
  const currentIndex = cards.findIndex(c => c.dataset.movieId === currentId);

  if (currentIndex === -1) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < cards.length) {
    openModal(cards[nextIndex], cards); // Reutilizar la lista de tarjetas para optimizar
  }
}

/**
 * Actualiza el estado (habilitado/deshabilitado) de los botones de navegación.
 */
function updateNavButtons(currentId: number | string, contextCards: HTMLElement[] | null = null): void {
  const { prevBtn, nextBtn } = getDom();
  const strId = String(currentId);
  
  const cards = contextCards || getGridCards();
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

const createLink = (text: string, type: 'director' | 'actor'): HTMLAnchorElement => {
  const param = type === 'director' ? 'dir' : 'actor';
  return createElement("a", { 
    textContent: text, 
    href: `?${param}=${encodeURIComponent(text)}`, 
    dataset: { [type === 'director' ? 'directorName' : 'actorName']: text } 
  }) as HTMLAnchorElement;
};

interface ModalNodes {
  [key: string]: HTMLElement | null | undefined;
  img?: HTMLImageElement | null;
  iconsContainer?: HTMLElement | null;
  origTitleWrap?: HTMLElement | null;
}

/**
 * Mapea los nodos del modal mediante sus contratos de datos (data-template).
 */
function getModalNodes(root: HTMLElement): ModalNodes {
  const nodes: ModalNodes = {};
  root.querySelectorAll<HTMLElement>('[data-template]').forEach(el => {
    const key = el.dataset.template;
    if (key) {
      nodes[key] = el;
    }
  });
  nodes.img = root.querySelector("img");
  nodes.iconsContainer = root.querySelector(".card-icons-line");
  nodes.origTitleWrap = root.querySelector(".back-original-title-wrapper");
  return nodes;
}

/**
 * Configura la cabecera del modal (Póster, Título, Info básica).
 */
function setupModalHeader(nodes: ModalNodes, movie: ExtendedMovie): void {
  // Imagen (Efecto LQIP suave)
  if (nodes.img) {
    const hqUrl = movie.image_hq || movie.posterUrl;
    nodes.img.alt = `Póster de ${movie.title}`;

    if (movie.thumbhash_st && hqUrl) {
      nodes.img.classList.remove(CSS_CLASSES.LOADED);
      nodes.img.classList.add(CSS_CLASSES.LAZY_LQIP);
      nodes.img.src = movie.thumbhash_st;

      setTimeout(() => {
        const tempImg = new Image();
        tempImg.onload = () => {
          if (nodes.img) {
            nodes.img.src = hqUrl;
            requestAnimationFrame(() => {
              nodes.img?.classList.add(CSS_CLASSES.LOADED);
            });
          }
        };
        tempImg.src = hqUrl;
      }, 150);
    } else {
      nodes.img.src = hqUrl || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      nodes.img.classList.remove(CSS_CLASSES.LAZY_LQIP);
    }
  }

  // Título
  if (nodes.title && movie.title) {
    nodes.title.textContent = movie.title;
    nodes.title.className = ""; // Reset clases
    const tLen = movie.title.length;
    if (tLen > 70) nodes.title.classList.add("title-xxxl-long");
    else if (tLen > 50) nodes.title.classList.add("title-xxl-long");
    else if (tLen > 35) nodes.title.classList.add("title-xl-long");
    else if (tLen > 25) nodes.title.classList.add("title-long");
    else if (tLen > 15) nodes.title.classList.add("title-medium");
  }

  // Director
  if (nodes.director) {
    nodes.director.textContent = "";
    if (movie.parsedDirectors && movie.parsedDirectors.length > 0) {
      movie.parsedDirectors.forEach((name, i, arr) => {
        nodes.director?.appendChild(createLink(name, 'director'));
        if (i < arr.length - 1) nodes.director?.append(", ");
      });
    }
  }

  // Año y País
  if (nodes.year) {
    nodes.year.textContent = "";
    if (movie.year) {
      const yearLink = createElement("a", {
        textContent: String(movie.year),
        href: `?year=${movie.year}`,
        className: "year-link",
        dataset: { yearValue: `${movie.year}` }
      });
      nodes.year.appendChild(yearLink);
      if (movie.displayYear && movie.displayYear.length > String(movie.year).length) {
        const suffix = movie.displayYear.substring(String(movie.year).length);
        nodes.year.appendChild(document.createTextNode(suffix));
      }
    } else if (movie.displayYear) {
      nodes.year.textContent = movie.displayYear;
    }
  }
  
  renderCountryFlag(
    nodes["country-container"] || null,
    nodes["country-flag"] || null,
    movie.country_code || null,
    movie.country || null
  );

  // Iconos Plataforma
  if (nodes.iconsContainer && movie.studioList) {
    nodes.iconsContainer.innerHTML = "";
    const codes = movie.studioList;
    
    codes.forEach(code => {
      const conf = STUDIO_DATA[code as keyof typeof STUDIO_DATA];
      if (conf) {
        const span = createElement('span', { className: `platform-icon ${conf.class || ''}`, title: conf.title });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", conf.w || "24"); svg.setAttribute("height", conf.h || "24");
        svg.setAttribute("fill", "currentColor"); svg.setAttribute("viewBox", conf.vb || "0 0 24 24");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `${spriteUrl}#${conf.id}`);
        svg.appendChild(use); span.appendChild(svg);
        nodes.iconsContainer?.appendChild(span);
      }
    });
  }
}

/**
 * Configura los detalles extendidos del modal (Sinopsis, Reparto, etc.).
 */
function setupModalDetails(nodes: ModalNodes, movie: ExtendedMovie): void {
  // Título Original
  if (nodes.origTitleWrap && nodes["original-title"] && movie.displayOriginalTitle) {
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
    nodes.episodes.textContent = movie.displayEpisodes || "";
    nodes.episodes.hidden = !movie.displayEpisodes;
  }

  // Links Externos
  const setupLink = (key: string, url: string | null | undefined) => {
    const el = nodes[`${key}-link`] as HTMLAnchorElement | null | undefined;
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
  
  // Actores
  if (nodes.actors) {
    nodes.actors.textContent = "";
    if (movie.parsedActors && movie.parsedActors.length > 0) {
      const frag = document.createDocumentFragment();
      movie.parsedActors.forEach((name, i, arr) => {
        if (IGNORED_ACTORS.includes(name.toLowerCase())) {
          frag.append(name);
        } else {
          frag.appendChild(createLink(name, 'actor'));
        }
        if (i < arr.length - 1) frag.append(", ");
      });
      nodes.actors.appendChild(frag);
    } else {
      nodes.actors.textContent = "N/A";
    }
  }
}

/**
 * Puebla el contenido del modal clonando la plantilla y asignando datos.
 */
function populateModal(cardElement: MovieCardElement, contextCards: HTMLElement[] | null = null): void {
  const { template, content, modal } = getDom();
  if (!template || !content || !modal) return;
  
  // Extraemos URL HQ si ya se cargó en la card para evitar parpadeo
  const cardImg = cardElement.querySelector("img");
  const image_hq = cardImg ? (cardImg.dataset.src || cardImg.src) : null;

  // Clon superficial para evitar mutaciones cruzadas con la card del grid.
  const movie = { ...cardElement.movieData, image_hq } as ExtendedMovie;
  const isPerson = cardElement.classList.contains('person-card') || movie.isPerson;

  // Si es persona, usamos person-card-template en lugar de quick-view-template
  const personTemplate = document.getElementById("person-card-template") as HTMLTemplateElement | null;
  const currentTemplate = isPerson 
    ? personTemplate?.content 
    : template;
    
  if (!currentTemplate) return;

  const clone = currentTemplate.cloneNode(true) as DocumentFragment;
  const cardClone = clone.querySelector('.movie-card') as MovieCardElement | null;
  if (!cardClone) return;

  cardClone.classList.add('is-quick-view');

  const modalId = isPerson ? `person-${movie.id}` : String(movie.id);

  // Asignar ID y datos a la tarjeta clonada.
  cardClone.dataset.movieId = modalId;
  cardClone.movieData = movie;

  // Reset UI
  if (!modal.classList.contains("is-visible")) modal.classList.remove("hide-arrows");
  
  // Binding de Datos
  content.movieData = movie;
  content.dataset.movieId = modalId;

  // Obtener referencias planas usando el helper
  const nodes = getModalNodes(cardClone);

  if (isPerson) {
    // --- CAPA PERSONA (Síncrona) ---
    // Foto de perfil
    const img = cardClone.querySelector("img");
    if (img && image_hq) {
      img.classList.remove(CSS_CLASSES.LOADED);
      img.classList.add(CSS_CLASSES.LAZY_LQIP);
      img.src = image_hq;
      
      setTimeout(() => {
        const tempImg = new Image();
        tempImg.onload = () => {
          requestAnimationFrame(() => {
            img.classList.add(CSS_CLASSES.LOADED);
          });
        };
        tempImg.src = image_hq;
      }, 50);
    }
    
    // Título/Nombre
    const titleEl = cardClone.querySelector('[data-template="title"]');
    if (titleEl && movie.name) {
      titleEl.textContent = movie.name;
    }
    
    // Lugar de nacimiento
    const birthplaceEl = cardClone.querySelector('[data-template="birthplace"]');
    if (birthplaceEl) {
      birthplaceEl.textContent = movie.place_of_birth || "";
    }
    
    // Edad y fechas
    const ageEl = cardClone.querySelector('[data-template="age"]');
    const datesEl = cardClone.querySelector('[data-template="dates"]');
    
    const getYear = (dateStr: string | null | undefined) => dateStr ? dateStr.split('-')[0] : '';
    const bYear = getYear(movie.birthday);
    const dYear = getYear(movie.deathday);
    
    let ageStr = "";
    if (movie.birthday) {
      const bDate = new Date(movie.birthday);
      const eDate = movie.deathday ? new Date(movie.deathday) : new Date();
      let age = eDate.getFullYear() - bDate.getFullYear();
      const m = eDate.getMonth() - bDate.getMonth();
      if (m < 0 || (m === 0 && eDate.getDate() < bDate.getDate())) age--;
      ageStr = movie.deathday ? `(${age} ✝)` : `(${age})`;
    }
    
    if (ageEl) ageEl.textContent = ageStr;
    if (datesEl) datesEl.textContent = bYear ? (dYear ? `${bYear}-${dYear}` : `${bYear}-`) : "";
    
    // Bandera del País
    const countryCode = movie.countries?.code || movie.country_code || null;
    const countryName = movie.countries?.name || movie.country || null;
    renderCountryFlag(
      cardClone.querySelector('[data-template="country-container"]'),
      cardClone.querySelector('[data-template="country-flag"]'),
      countryCode,
      countryName
    );

    // Biografía
    const biographyEl = cardClone.querySelector('[data-template="biography"]');
    if (biographyEl) {
      biographyEl.textContent = movie.biography || "Biografía no disponible en el catálogo.";
    }

    // Montaje
    content.textContent = "";
    content.appendChild(clone);
    updateNavButtons(modalId, contextCards);
  } else {
    // --- CAPA PELÍCULA ---
    // --- CAPA 1: CABECERA (Síncrona) ---
    setupModalHeader(nodes, movie);

    // Montaje
    content.textContent = "";
    content.appendChild(clone);

    // Inicializar interactividad básica
    updateCardUI(content);
    initializeCard(content);
    updateNavButtons(modalId, contextCards);

    // --- CAPA 2: DETALLES (Asíncrona / Diferida) ---
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (content.dataset.movieId !== String(movie.id)) return;
        
        setupModalDetails(nodes, movie);
        setupCardRatings(cardClone, movie);
      });
    });
  }
}

// =================================================================
//          5. API PÚBLICA
// =================================================================

/**
 * Cierra el modal con animación y limpieza.
 */
export function closeModal(): void {
  const { modal, overlay } = getDom();
  if (!modal || !overlay || !modal.classList.contains("is-visible")) return;
  
  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector<HTMLElement>(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  const performClose = (): void => {
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
 */
export function openModal(cardElement: MovieCardElement, contextCards: HTMLElement[] | null = null): void {
  if (!cardElement) return;
  const { modal, overlay, content } = getDom();
  if (!modal || !overlay) return;
  
  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector<HTMLElement>(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  // Guardar referencia para el cierre
  activeHeroCard = cardElement;

  unflipAllCards();
  populateModal(cardElement, contextCards);
  
  const performOpen = (): void => {
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
export function initQuickView(): void {
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) return;

  // Delegación de eventos en contenido
  if (content) {
    content.addEventListener("click", (e: MouseEvent) => {
      handleMetadataClick(e);
      const target = e.target as HTMLElement;
      // Toggle flechas al tocar póster (Móvil/Tablet/Desktop)
      if (target.closest(".poster-container")) {
        modal.classList.toggle("hide-arrows");
      }
    });
  }

  // Teclado
  // Listener global único; initQuickView solo debe llamarse una vez.
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!modal.classList.contains("is-visible")) return;
    if (e.key === "Escape") {
      e.stopPropagation(); // Detener para que no cierre el sidebar u otros elementos
      closeModal();
    }
    else if (e.key === "ArrowLeft") navigateToSibling(-1);
    else if (e.key === "ArrowRight") navigateToSibling(1);
  }, { capture: true }); // IMPORTANTE: Capturar antes que document (main.js)

  // Botones
  prevBtn?.addEventListener("click", (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(-1); });
  nextBtn?.addEventListener("click", (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(1); });

  // Gestos
  if (navigator.maxTouchPoints > 0) {
    modal.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    modal.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false });
    modal.addEventListener("touchend", handleTouchEnd as EventListener, { passive: true });
    modal.addEventListener("touchcancel", handleTouchEnd as EventListener, { passive: true });
  }
}
