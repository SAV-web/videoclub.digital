/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.ts
//  RESPONSABILIDAD: Gestión de vista detallada, navegación y gestos.
// =================================================================

import "../../css/components/modal.css";
import { openAccessibleModal, closeAccessibleModal, setIsClosingModalViaHistory } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards, toggleWatchlist } from "./card.js";

import { setupCardRatings, handleRatingClick, setupRatingListeners } from "./rating.js";
import { appEvents, getState, getCurrentPage, getTotalMovies, updateUserDataForMovie } from "../state.js";

import { fetchUserMovieDataForIds } from "../api.js";
import { formatRuntime, createElement, renderCountryFlag, executeViewTransition, mapMoviePayload, computePersonAgeInfo, applyLengthBasedClass } from "../utils.js";
import { preserveHyphenatedWords } from "../../shared/formatters.js";


import { STUDIO_DATA, IGNORED_ACTORS, CSS_CLASSES, CONFIG } from "../constants.js";
import spriteUrl from "../../sprite.svg";
import { Movie, MappedMovie, MovieCardElement } from "../types.js";

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
  titulo_bio?: string | null;
  countries?: { code: string; name: string };
  isPerson?: boolean;
}

// --- Referencias DOM (Caché con Lazy Getter para máxima eficiencia) ---
let cachedModalDom: ModalDom | null = null;
const getDom = (): ModalDom => {
  if (cachedModalDom?.modal && cachedModalDom?.content) return cachedModalDom;
  const templateEl = document.getElementById("quick-view-template") as HTMLTemplateElement | null;
  return (cachedModalDom = {
    overlay: document.getElementById("quick-view-overlay"),
    modal: document.getElementById("quick-view-modal"),
    content: document.getElementById("quick-view-content") as MovieContentElement | null,
    template: templateEl?.content,
    prevBtn: document.getElementById("modal-prev-btn") as HTMLButtonElement | null,
    nextBtn: document.getElementById("modal-next-btn") as HTMLButtonElement | null,
  });
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
let modalLifecycleGen = 0;
let modalTimeouts: Array<ReturnType<typeof setTimeout>> = [];
let modalAnimationFrames: Array<number> = [];

const scheduleModalTimeout = (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
  const gen = modalLifecycleGen;
  const tid = setTimeout(() => {
    modalTimeouts = modalTimeouts.filter(t => t !== tid);
    if (gen !== modalLifecycleGen) return;
    fn();
  }, delay);
  modalTimeouts.push(tid);
  return tid;
};

const scheduleModalRAF = (fn: () => void): number => {
  const gen = modalLifecycleGen;
  const rafId = requestAnimationFrame(() => {
    modalAnimationFrames = modalAnimationFrames.filter(id => id !== rafId);
    if (gen !== modalLifecycleGen) return;
    fn();
  });
  modalAnimationFrames.push(rafId);
  return rafId;
};



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
 * Maneja clics en metadatos (Director/Actor/Género/Año) para filtrar.
 */
function handleMetadataClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const directorLink = target.closest<HTMLElement>(".front-director-info a[data-director-name]");
  const actorLink = target.closest<HTMLElement>('[data-template="actors"] a[data-actor-name]');
  const genreLink = target.closest<HTMLElement>('[data-template="genre"] a[data-genre-name]');
  const yearLink = target.closest<HTMLElement>("a[data-year-value]");

  if (directorLink || actorLink || genreLink || yearLink) {
    // Permitir comportamiento predeterminado (abrir en nueva pestaña) si se usan teclas modificadoras
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    closeModal();

    if (genreLink && genreLink.dataset.genreName) {
      appEvents.emit("filter:apply", { type: "genre", value: genreLink.dataset.genreName });
      return;
    }

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
  const { content, modal } = getDom();
  if (!content) return;

  const currentId = content.dataset.movieId;
  if (!currentId) return;

  const cards = getGridCards();
  const currentIndex = cards.findIndex(c => c.dataset.movieId === currentId);

  if (currentIndex === -1) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < cards.length) {
    openModal(cards[nextIndex], cards); // Reutilizar la lista de tarjetas para optimizar
  } else {
    // Si sale de los límites, intentamos cambiar de página
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const pageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const totalPages = Math.ceil(getTotalMovies() / pageSize);
    const currentPage = getCurrentPage();

    if (direction === 1 && currentPage < totalPages) {
      modal?.classList.add("modal-is-loading");
      appEvents.emit("page:requestChange", { direction: 1, target: "first" });
    } else if (direction === -1 && currentPage > 1) {
      modal?.classList.add("modal-is-loading");
      appEvents.emit("page:requestChange", { direction: -1, target: "last" });
    }
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

  if (currentIndex === -1) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const pageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
  const totalPages = Math.ceil(getTotalMovies() / pageSize);
  const currentPage = getCurrentPage();

  const hasPrev = currentIndex > 0 || currentPage > 1;
  const hasNext = currentIndex < cards.length - 1 || currentPage < totalPages;

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

const createLink = (text: string, type: 'director' | 'actor' | 'genre'): HTMLAnchorElement => {
  const param = type === 'director' ? 'dir' : (type === 'actor' ? 'actor' : 'genre');
  const dataAttr = type === 'director' ? 'directorName' : (type === 'actor' ? 'actorName' : 'genreName');
  return createElement("a", {
    textContent: preserveHyphenatedWords(text),
    href: `?${param}=${encodeURIComponent(text)}`,
    dataset: { [dataAttr]: text }
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
  nodes.img = root.querySelector<HTMLImageElement>("img");
  nodes.iconsContainer = root.querySelector<HTMLElement>(".card-icons-line");
  nodes.origTitleWrap = root.querySelector<HTMLElement>(".back-original-title-wrapper");
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

      const lqipGen = modalLifecycleGen;
      scheduleModalTimeout(() => {
        if (lqipGen !== modalLifecycleGen) return;
        const tempImg = new Image();
        tempImg.onload = () => {
          if (lqipGen !== modalLifecycleGen) return;
          if (nodes.img) {
            nodes.img.src = hqUrl;
            scheduleModalRAF(() => {
              if (lqipGen !== modalLifecycleGen) return;
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
    applyLengthBasedClass(nodes.title, movie.title, [
      [70, "title-xxxl-long"],
      [50, "title-xxl-long"],
      [35, "title-xl-long"],
      [25, "title-long"],
      [15, "title-medium"],
    ], true);
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
    movie.country_code || undefined,
    movie.country || undefined
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
        svg.setAttribute("width", String(conf.w || "24")); svg.setAttribute("height", String(conf.h || "24"));
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
    applyLengthBasedClass(nodes["original-title"], actualOriginalTitle, [
      [40, "title-xl-long"],
      [30, "title-long"],
      [20, "title-medium"],
    ], true);
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
  if (nodes.genre) {
    nodes.genre.textContent = "";
    const genres = (movie.genres || "").split(",").map(g => g.trim()).filter(Boolean);
    if (genres.length > 0) {
      const frag = document.createDocumentFragment();
      genres.forEach((name, i, arr) => {
        frag.appendChild(createLink(name, 'genre'));
        if (i < arr.length - 1) frag.append(", ");
      });
      nodes.genre.appendChild(frag);
    } else {
      nodes.genre.textContent = "N/A";
    }
  }
  if (nodes.synopsis) nodes.synopsis.textContent = preserveHyphenatedWords(movie.synopsis) || "N/A";

  // Actores
  if (nodes.actors) {
    nodes.actors.textContent = "";
    if (movie.parsedActors && movie.parsedActors.length > 0) {
      const frag = document.createDocumentFragment();
      movie.parsedActors.forEach((name, i, arr) => {
        if ((IGNORED_ACTORS as readonly string[]).includes(name.toLowerCase())) {
          frag.append(preserveHyphenatedWords(name));
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

  // Reset UI solo si la modal NO estaba abierta previamente
  if (!modal.classList.contains("is-visible")) {
    modal.classList.remove("hide-arrows");
  }

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

      img.onload = () => {
        scheduleModalRAF(() => {
          img.classList.add(CSS_CLASSES.LOADED);
        });
      };
      img.onerror = () => {
        img.classList.add(CSS_CLASSES.LOADED);
      };

      img.src = image_hq;
      if (img.complete) {
        img.classList.add(CSS_CLASSES.LOADED);
      }
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

    const ageInfo = computePersonAgeInfo(movie.birthday, movie.deathday);

    if (ageEl) ageEl.textContent = ageInfo.ageStr;
    if (datesEl) datesEl.textContent = ageInfo.datesStr;

    // Bandera del País
    const countryCode = movie.countries?.code || movie.country_code || undefined;
    const countryName = movie.countries?.name || movie.country || undefined;
    renderCountryFlag(
      cardClone.querySelector('[data-template="country-container"]'),
      cardClone.querySelector('[data-template="country-flag"]'),
      countryCode,
      countryName
    );

    // Biografía
    const headlineEl = cardClone.querySelector('[data-template="bio-headline"]');
    if (headlineEl) {
      headlineEl.textContent = movie.titulo_bio || "";
    }

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
    updateCardUI(cardClone);
    initializeCard(cardClone);
    const starCont = cardClone.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starCont) {
      setupRatingListeners(starCont, true);
    }
    updateNavButtons(modalId, contextCards);

    // --- CAPA 2: DETALLES (Asíncrona / Diferida) ---
    scheduleModalRAF(() => {
      scheduleModalRAF(() => {
        if (content.dataset.movieId !== String(movie.id)) return;

        setupModalDetails(nodes, movie);
        setupCardRatings(cardClone, movie);

        // Si el usuario está autenticado, sincronizar sus datos específicos (nota/watchlist) para la modal
        if (movie.id && document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
          fetchUserMovieDataForIds([movie.id]).then(userEntries => {
            if (userEntries[movie.id]) {
              updateUserDataForMovie(movie.id, userEntries[movie.id]);
              if (content && content.dataset.movieId === String(movie.id)) {
                updateCardUI(cardClone);
              }
            }
          }).catch(() => { });
        }

      });
    });
  }
}

// =================================================================
//          5. API PÚBLICA
// =================================================================


/**
 * Comprueba si la modal está actualmente visible.
 */
export function isModalOpen(): boolean {
  const { modal } = getDom();
  return Boolean(modal && modal.classList.contains("is-visible"));
}

/**
 * Cierra el modal con animación y limpieza.
 */
export function closeModal(options?: { fromPopstate?: boolean; suppressHistoryBack?: boolean; skipHistory?: boolean } | Event): void {
  const isPopstate = Boolean(options && "fromPopstate" in options && options.fromPopstate);
  const suppressHistoryBack = Boolean(
    options && (
      ("suppressHistoryBack" in options && options.suppressHistoryBack) ||
      ("skipHistory" in options && options.skipHistory)
    )
  );
  const { modal, overlay } = getDom();
  if (!modal || !overlay || !modal.classList.contains("is-visible")) return;

  // Si se cierra manualmente (botón, click fuera, ESC o swipe) y se había creado entrada de historial, hacer back
  if (!isPopstate && !suppressHistoryBack && window.history.state?.modalOpen) {
    setIsClosingModalViaHistory();
    window.history.back();
  }



  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector<HTMLElement>(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  const performClose = (): void => {
    modal.classList.remove("is-visible");
    modal.classList.remove("hide-arrows");
    overlay.classList.remove("is-visible");
    document.body.classList.remove(CSS_CLASSES.MODAL_OPEN);

    // Limpieza
    scheduleModalTimeout(resetModalTransform, MODAL_TRANSITION_MS);
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
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  } else {
    executeViewTransition(performClose).finished.finally(() => {
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  }

  document.removeEventListener("click", handleOutsideClick);
}

/**
 * Abre el modal directamente a partir de un objeto de película (MappedMovie o Movie).
 * Útil para la apertura automática desde URLs ?movie={id}.
 */
export function openModalForMovie(movie: MappedMovie | Movie): void {
  const dummyCard = document.createElement("div") as MovieCardElement;
  dummyCard.className = "movie-card";
  dummyCard.movieData = "posterUrl" in movie ? movie : mapMoviePayload(movie);
  openModal(dummyCard);
  const { modal } = getDom();
  if (modal) modal.classList.add("hide-arrows");
}

/**
 * Abre el modal para una tarjeta específica.
 */
export function openModal(cardElement: MovieCardElement, contextCards: HTMLElement[] | null = null): void {
  if (!cardElement) return;
  const { modal, overlay, content } = getDom();
  if (!modal || !overlay) return;

  // Integración con el botón "Atrás" del navegador: crear entrada en el historial
  if (!window.history.state?.modalOpen) {
    window.history.pushState({ modalOpen: true }, "", window.location.href);
  }

  modal.classList.remove("modal-is-loading");

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
    scheduleModalRAF(() => {
      modal.classList.add("is-visible");
      overlay.classList.add("is-visible");
      openAccessibleModal(modal, overlay, false);
      if (content) content.scrollTop = 0;
      scheduleModalTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
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
    if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
      header.style.viewTransitionName = "";
    }
  });
}

let isQuickViewInitialized = false;
let modalUnsubscribers: Array<() => void> = [];

export function disposeModalEvents(): void {
  modalLifecycleGen++;

  try {
    closeModal({ suppressHistoryBack: true, skipHistory: true, fromPopstate: true });
  } catch (e) { }

  modalTimeouts.forEach(t => clearTimeout(t));
  modalTimeouts = [];
  modalAnimationFrames.forEach(raf => cancelAnimationFrame(raf));
  modalAnimationFrames = [];

  document.removeEventListener("click", handleOutsideClick);

  modalUnsubscribers.forEach(unsub => unsub());
  modalUnsubscribers = [];
  cachedModalDom = null;
  isQuickViewInitialized = false;
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)._quickViewInitialized;
  }
}


export function initQuickView(): void {
  if (isQuickViewInitialized) return;
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) return;

  isQuickViewInitialized = true;

  modalUnsubscribers.push(
    appEvents.on("userMovieDataChanged", (data) => {
      const movieId = data?.movieId;
      if (!movieId) return;
      const { content } = getDom();
      if (content && content.dataset.movieId === String(movieId)) {
        const modalCard = content.querySelector<MovieCardElement>(".movie-card");
        if (modalCard) updateCardUI(modalCard);
      }
    }),

    appEvents.on("userDataUpdated", () => {
      const { content } = getDom();
      if (content && content.dataset.movieId) {
        const modalCard = content.querySelector<MovieCardElement>(".movie-card");
        if (modalCard) updateCardUI(modalCard);
      }
    }),

    appEvents.on("filtersReset", () => {
      closeModal();
    }),

    appEvents.on("filter:apply", () => {
      closeModal();
    })
  );

  // Delegación de eventos en contenido
  if (content) {
    const handleContentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      handleMetadataClick(e);

      // Toggle flechas al tocar póster (Móvil/Tablet/Desktop), pero NUNCA en la barra de controles
      if (target.closest(".poster-container") && !target.closest(".card-rating-block")) {
        modal.classList.toggle("hide-arrows");
      }
    };

    content.addEventListener("click", handleContentClick);
    modalUnsubscribers.push(() => {
      content.removeEventListener("click", handleContentClick);
    });
  }

  // Teclado
  const handleKeydown = (e: KeyboardEvent) => {
    if (!modal.classList.contains("is-visible")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === "Escape") {
      e.stopPropagation(); // Detener para que no cierre el sidebar u otros elementos
      closeModal();
    }
    else if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateToSibling(-1);
    }
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateToSibling(1);
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 700
        ? (modal.querySelector<HTMLElement>(".flip-card-back") || content)
        : content;
      scrollTarget?.scrollBy({ top: 70, behavior: "smooth" });
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 700
        ? (modal.querySelector<HTMLElement>(".flip-card-back") || content)
        : content;
      scrollTarget?.scrollBy({ top: -70, behavior: "smooth" });
    }
    else if (e.key === "PageDown") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 700
        ? (modal.querySelector<HTMLElement>(".flip-card-back") || content)
        : content;
      scrollTarget?.scrollBy({ top: 250, behavior: "smooth" });
    }
    else if (e.key === "PageUp") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 700
        ? (modal.querySelector<HTMLElement>(".flip-card-back") || content)
        : content;
      scrollTarget?.scrollBy({ top: -250, behavior: "smooth" });
    }
  };


  window.addEventListener("keydown", handleKeydown, { capture: true });
  modalUnsubscribers.push(() => {
    window.removeEventListener("keydown", handleKeydown, { capture: true });
  });

  // Botones
  if (prevBtn) {
    const handlePrevClick = (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(-1); };
    prevBtn.addEventListener("click", handlePrevClick);
    modalUnsubscribers.push(() => prevBtn.removeEventListener("click", handlePrevClick));
  }

  if (nextBtn) {
    const handleNextClick = (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(1); };
    nextBtn.addEventListener("click", handleNextClick);
    modalUnsubscribers.push(() => nextBtn.removeEventListener("click", handleNextClick));
  }

  // Gestos
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
    const tStart = handleTouchStart as EventListener;
    const tMove = handleTouchMove as EventListener;
    const tEnd = handleTouchEnd as EventListener;

    modal.addEventListener("touchstart", tStart, { passive: true });
    modal.addEventListener("touchmove", tMove, { passive: false });
    modal.addEventListener("touchend", tEnd, { passive: true });
    modal.addEventListener("touchcancel", tEnd, { passive: true });

    modalUnsubscribers.push(() => {
      modal.removeEventListener("touchstart", tStart);
      modal.removeEventListener("touchmove", tMove);
      modal.removeEventListener("touchend", tEnd);
      modal.removeEventListener("touchcancel", tEnd);
    });
  }
}


