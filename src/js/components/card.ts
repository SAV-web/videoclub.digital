/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Movie Card (Ficha e Interacciones)
// =================================================================
// FICHERO: src/js/components/card.ts
// RESPONSABILIDAD: Gestión del ciclo de vida de la tarjeta de película.
// =================================================================

import { CONFIG, CSS_CLASSES, SELECTORS, STUDIO_DATA, IGNORED_ACTORS, ICONS, FILTER_CONFIG } from "../constants.js";
import { formatRuntime, createElement, triggerHapticFeedback, renderCountryFlag, scheduleWork, LocalStore, getHqPosterUrl, debounce, getFriendlyErrorMessage } from "../utils.js";
import { getUserDataForMovie, updateUserDataForMovie, hasActiveMeaningfulFilters, getCurrentPage, appEvents } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast, areInteractionsLocked } from "../ui.js";
import { setupRatingListeners, handleRatingClick, updateRatingUI, setupCardRatings, resolveRatingMutationOnWatchlist } from "./rating.js";
import spriteUrl from "../../sprite.svg";
import { MappedMovie, ActiveFilters, UserMovieEntry, PersonDetails, VipData, MovieCardElement } from "../types.js";

// =================================================================
//          CONSTANTES Y ESTADO
// =================================================================

// Cachear templates una sola vez
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE) as HTMLTemplateElement | null;
const personTemplate = document.querySelector(SELECTORS.PERSON_CARD_TEMPLATE) as HTMLTemplateElement | null;
const collectionTemplate = document.querySelector("#collection-card-template") as HTMLTemplateElement | null;

// Estado de Renderizado
let currentRenderRequestId = 0;

// Estado de Interacción
let currentlyFlippedCard: MovieCardElement | null = null;
let hoverTimeout: ReturnType<typeof setTimeout> | undefined;
let currentHoveredCard: MovieCardElement | null = null;
const HOVER_DELAY = 1000;
const INTERACTIVE_SELECTOR = ".card-rating-block, .front-director-info, .actors-expand-btn";
const QUICK_VIEW_INIT_FLAG = "_quickViewInitialized";

// Caché del Viewport para evitar Layout Thrashing
let cachedIsMobileViewport = window.innerWidth <= 768;
window.addEventListener('resize', debounce(() => { cachedIsMobileViewport = window.innerWidth <= 768; }, 250));

// =================================================================
//          0. LAZY LOADING (Modal)
// =================================================================

async function loadAndOpenModal(cardElement: MovieCardElement): Promise<void> {
  if (cardElement.classList.contains('collection-card')) return;
  const { openModal, initQuickView } = await import("./modal.js");
  const win = window as unknown as Record<string, unknown>;
  if (!win[QUICK_VIEW_INIT_FLAG]) { 
    initQuickView(); 
    win[QUICK_VIEW_INIT_FLAG] = true; 
  }
  openModal(cardElement);
}

// =================================================================
//          1. GESTIÓN DE ESTADO VISUAL (Flip/Back)
// =================================================================

function resetCardBackState(cardElement: MovieCardElement): void {
  const flipCardBack = cardElement.querySelector<HTMLElement>(".flip-card-back");
  if (flipCardBack?.classList.contains("is-expanded")) {
    flipCardBack.classList.remove("is-expanded", "show-actors");
    const expandBtn = flipCardBack.querySelector<HTMLButtonElement>(".expand-content-btn");
    if (expandBtn) {
      expandBtn.textContent = "+";
      expandBtn.setAttribute("aria-label", "Expandir sinopsis");
    }
    // Reset scroll positions
    const scrolls = flipCardBack.querySelectorAll<HTMLElement>(".scrollable-content, .actors-scrollable-content");
    scrolls.forEach(el => el.scrollTop = 0);
  }
}

export function unflipAllCards(): void {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  if (currentlyFlippedCard) {
    currentlyFlippedCard.querySelector(".flip-card-inner")?.classList.remove("is-flipped");
    resetCardBackState(currentlyFlippedCard);
    currentlyFlippedCard = null;
    document.removeEventListener("click", handleDocumentClick);
  }
}

function handleDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (currentlyFlippedCard && !currentlyFlippedCard.contains(target)) {
    unflipAllCards();
  }
}

// =================================================================
//          2. LÓGICA DE INTERACCIÓN (Pointer Events)
// =================================================================

function prefetchCardResources(card: MovieCardElement): void {
  if (card.dataset.prefetched) return;
  card.dataset.prefetched = "true";

  // 1. Intención de detalle: Cargar lógica del modal
  import("./modal.js");

  // 2. Intención visual: Cargar imagen HQ
  const img = card.querySelector<HTMLImageElement>("img");
  if (img && img.dataset.src) {
    const link = document.createElement("link");
    link.rel = "preload"; 
    link.as = "image"; 
    link.href = img.dataset.src;
    document.head.appendChild(link);
  }
}

function startFlipTimer(cardElement: MovieCardElement): void {
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) || cardElement.classList.contains('collection-card') || cardElement.classList.contains('person-card')) return;
  const inner = cardElement.querySelector(".flip-card-inner");
  if (inner?.classList.contains("is-flipped")) return;

  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    if (currentHoveredCard === cardElement) {
      cardElement.classList.add("is-hovered");
      prefetchCardResources(cardElement);
    }
  }, HOVER_DELAY);
}

const handleSingleTap = (cardElement: MovieCardElement): void => {
  if (!cardElement || cardElement.classList.contains('collection-card') || cardElement.classList.contains('person-card')) return;
  const inner = cardElement.querySelector(".flip-card-inner");
  if (!inner) return;

  const isFlipped = inner.classList.contains("is-flipped");
  
  if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
    unflipAllCards();
  }
  
  triggerHapticFeedback("light");
  inner.classList.toggle("is-flipped");
  prefetchCardResources(cardElement);
  
  if (!isFlipped) {
    currentlyFlippedCard = cardElement;
    setTimeout(() => {
      if (currentlyFlippedCard === cardElement) {
        document.addEventListener("click", handleDocumentClick);
      }
    }, 0);
  } else {
    currentlyFlippedCard = null;
    resetCardBackState(cardElement);
    document.removeEventListener("click", handleDocumentClick);
  }
};

export function initCardInteractions(gridContainer: HTMLElement): void {
  // --- Hover (Desktop) ---
  gridContainer.addEventListener("pointerover", (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>(".movie-card");
    if (!card || card.classList.contains('collection-card') || card.classList.contains('person-card')) return;

    if (currentHoveredCard !== card) {
      if (currentHoveredCard) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        currentHoveredCard.classList.remove("is-hovered");
        resetCardBackState(currentHoveredCard);
      }
      currentHoveredCard = card;
      startFlipTimer(card);
    } else if (!target.closest(INTERACTIVE_SELECTOR)) {
      startFlipTimer(card);
    } else {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    }
  });

  gridContainer.addEventListener("pointerout", (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !currentHoveredCard) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !currentHoveredCard.contains(relatedTarget)) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      currentHoveredCard.classList.remove("is-hovered");
      resetCardBackState(currentHoveredCard);
      currentHoveredCard = null;
    }
  });

  // --- Doble Click (Desktop) ---
  gridContainer.addEventListener("dblclick", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>(".movie-card");
    if (card && !document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      loadAndOpenModal(card);
    }
  });

  // --- Tap / Doble Tap (Táctil) ---
  let lastTapTime = 0;
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let startX = 0, startY = 0;
  const DOUBLE_TAP_DELAY = 250;
  const MOVE_THRESHOLD = 10;

  gridContainer.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });

  gridContainer.addEventListener('pointerup', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>('.movie-card');
    if (!card) return;
    
    const criticalElements = '[data-action="toggle-watchlist"], [data-action^="set-rating"], a[href], .expand-content-btn, .actors-expand-btn, .actor-list-item';
    
    if (card.classList.contains('person-card')) {
      if (!target.closest(criticalElements)) {
        if (Math.abs(e.clientX - startX) <= MOVE_THRESHOLD && Math.abs(e.clientY - startY) <= MOVE_THRESHOLD) {
          if (e.cancelable) e.preventDefault();
          loadAndOpenModal(card);
        }
      }
      return;
    }

    if (card.classList.contains('collection-card') || document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) || target.closest(criticalElements)) return;

    // Detectar si fue un tap o un scroll
    if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD) return;

    if (e.cancelable) e.preventDefault();

    const currentTime = performance.now();
    const tapLength = currentTime - lastTapTime;

    if (lastTapTime > 0 && tapLength < DOUBLE_TAP_DELAY) {
      // Doble Tap -> Modal
      if (tapTimeout) clearTimeout(tapTimeout);
      loadAndOpenModal(card);
    } else {
      // Primer Tap -> Esperar
      if (tapTimeout) clearTimeout(tapTimeout);
      tapTimeout = setTimeout(() => handleSingleTap(card), DOUBLE_TAP_DELAY);
    }
    lastTapTime = currentTime;
  });
}

// =================================================================
//          3. MANEJADORES DE CLICS (Acciones)
// =================================================================

async function toggleWatchlist(movieId: number, btn: HTMLElement, card: MovieCardElement): Promise<void> {
  const wasActive = btn.classList.contains("is-active");
  const newState: Partial<UserMovieEntry> = { onWatchlist: !wasActive };
  const prevState = getUserDataForMovie(movieId) || { onWatchlist: false, rating: null };

  const ratingMutation = resolveRatingMutationOnWatchlist(newState.onWatchlist || false);
  if (ratingMutation !== undefined) {
    newState.rating = ratingMutation;
  }

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newState);
  updateCardUI(card);

  try {
    await setUserMovieDataAPI(movieId, newState);
    triggerHapticFeedback("success");
  } catch (err: unknown) {
    showToast(getFriendlyErrorMessage(err) || "Error al actualizar la lista.", "error");
    updateUserDataForMovie(movieId, prevState);
    updateCardUI(card);
  }
}

export function handleCardClick(this: MovieCardElement, event: MouseEvent): void {
  // Contrato Global: Respetar el cooldown de gestos
  if (areInteractionsLocked()) { event.preventDefault(); event.stopPropagation(); return; }

  const card = this;
  const isPerson = card.classList.contains('person-card');
  const target = event.target as HTMLElement;

  // 1. Botones de Acción
  const watchlistBtn = target.closest<HTMLElement>('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    event.preventDefault(); event.stopPropagation();
    if (isPerson) return;
    const movieId = parseInt(card.dataset.movieId || "0", 10);
    toggleWatchlist(movieId, watchlistBtn, card);
    return;
  }

  // 2. Rating (Estrellas o Suspenso)
  if (!isPerson && handleRatingClick(event, card)) return;
  if (isPerson && target.closest('[data-action^="set-rating"]')) {
    event.preventDefault(); event.stopPropagation();
    return;
  }

  // 3. Expansión de Contenido (Películas o Personas)
  const flipBack = card.querySelector<HTMLElement>(".flip-card-back");
  const expandBtn = target.closest<HTMLButtonElement>(".expand-content-btn");
  const actorsExpandBtn = target.closest<HTMLButtonElement>(".actors-expand-btn");

  if (actorsExpandBtn && flipBack) {
    let actorsOverlay = flipBack.querySelector<HTMLElement>('.actors-scrollable-content');
    if (!actorsOverlay) {
      actorsOverlay = createElement("div", { className: "actors-scrollable-content" });

      const heading = createElement("h4", { textContent: "Reparto" });
      const listText = createElement("div", { className: "actors-list-text" });

      const actors = (card.movieData as MappedMovie)?.parsedActors || [];
      actors.forEach(name => {
        if (IGNORED_ACTORS.includes(name.toLowerCase())) {
          listText.appendChild(createElement("span", {
            className: "actor-list-item",
            textContent: name,
            style: "cursor:default; pointer-events:none"
          }));
        } else {
          listText.appendChild(createElement("button", {
            className: "actor-list-item",
            textContent: name,
            attributes: { "type": "button", "data-actor-name": name }
          }));
        }
      });
      actorsOverlay.appendChild(heading);
      actorsOverlay.appendChild(listText);
      flipBack.insertBefore(actorsOverlay, flipBack.querySelector(".expand-content-btn"));
    }

    event.stopPropagation();
    flipBack.classList.add("is-expanded", "show-actors");
    const bottomBtn = flipBack.querySelector<HTMLButtonElement>(".expand-content-btn");
    if(bottomBtn) { 
      bottomBtn.textContent = "−"; 
      bottomBtn.setAttribute("aria-label", "Cerrar detalles"); 
    }
    return;
  }

  if (expandBtn && flipBack) {
    event.stopPropagation();
    const isExpanded = flipBack.classList.contains("is-expanded");
    if (isExpanded) {
      resetCardBackState(card);
    } else {
      flipBack.classList.add("is-expanded");
      flipBack.classList.remove("show-actors");
      expandBtn.textContent = "−";
      expandBtn.setAttribute("aria-label", "Contraer sinopsis");
    }
    return;
  }

  // 4. Bloqueo de Flip en Scroll
  if (flipBack && ((target.closest('.scrollable-content') && flipBack.classList.contains('is-expanded')) ||
      target.closest('.actors-scrollable-content'))) {
    if (!target.closest('.actor-list-item')) {
      event.stopPropagation(); 
      return;
    }
  }

  // 5. Enlaces Filtros
  const filterLink = target.closest<HTMLElement>("[data-director-name], [data-actor-name], [data-year-value]");
  if (filterLink) {
    if (card.id === 'quick-view-content') return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    event.stopPropagation();
    let type: "director" | "actor" | "year";
    let value: string | undefined;

    if (filterLink.dataset.directorName) { 
      type = "director"; 
      value = filterLink.dataset.directorName; 
    } else if (filterLink.dataset.actorName) { 
      type = "actor"; 
      value = filterLink.dataset.actorName; 
    } else { 
      type = "year"; 
      value = filterLink.dataset.yearValue; 
    }

    appEvents.emit("filtersReset", { keepSort: true, newFilter: { type, value } });
    return;
  }

  // 6. Enlaces Externos
  const link = target.closest("a");
  if (link && link.href && link.origin !== location.origin) return;

  // 7. Apertura Modal (Modo Muro o Fichas de Personas)
  if (card.id !== 'quick-view-content') {
    const isPerson = card.classList.contains('person-card');
    if (isPerson || document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      loadAndOpenModal(card);
    }
  }
}

// =================================================================
//          4. RENDERIZADO (Builders)
// =================================================================

const lazyLoadObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target as HTMLImageElement;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
        img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
      }
      obs.unobserve(img);
    }
  });
}, { 
  rootMargin: "200px"
});

function cleanupLazyImages(container: HTMLElement): void {
  if (!container) return;
  container.querySelectorAll<HTMLImageElement>("img[data-src]").forEach(img => lazyLoadObserver.unobserve(img));
}

function populateCard(card: MovieCardElement, movie: MappedMovie, index: number): void {
  const front = card.querySelector<HTMLElement>('.movie-summary');
  const back = card.querySelector<HTMLElement>('.flip-card-back');
  if (!front || !back) return;

  // --- IMAGEN ---
  const img = card.querySelector<HTMLImageElement>("img");
  if (!img) return;

  const hqPoster = getHqPosterUrl(movie.image);
  img.alt = `Póster de ${movie.title}`;
  
  const priorityCount = cachedIsMobileViewport ? 6 : 2;
  const isFirstPage = getCurrentPage() === 1;

  if (isFirstPage && index < priorityCount) {
    card.style.animation = "none";
    img.loading = "eager";
    img.decoding = "async";
    img.classList.remove(CSS_CLASSES.LAZY_LQIP);
    img.setAttribute("fetchpriority", index === 0 ? "high" : "auto");
    img.src = hqPoster;
  } else {
    img.src = movie.thumbhash_st || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    img.dataset.src = hqPoster;
    img.loading = "lazy";
    img.decoding = "async";
    img.removeAttribute("fetchpriority");
    if (movie.thumbhash_st) img.classList.add(CSS_CLASSES.LAZY_LQIP);
    lazyLoadObserver.observe(img);
  }

  // --- TEXTOS BÁSICOS ---
  const titleEl = front.querySelector<HTMLElement>(SELECTORS.TITLE);
  if (titleEl && movie.title) {
    titleEl.textContent = movie.title;
    titleEl.title = movie.title;
    titleEl.className = "";

    const tLen = movie.title.length;
    if (tLen > 40) titleEl.classList.add("title-xl-long");
    else if (tLen > 25) titleEl.classList.add("title-long");
    else if (tLen > 12) titleEl.classList.add("title-medium");
  }

  // Directores
  const dirCont = front.querySelector<HTMLElement>(SELECTORS.DIRECTOR);
  if (dirCont) {
    dirCont.textContent = "";
    if (movie.parsedDirectors && movie.parsedDirectors.length > 0) {
      const showOnlyLastName = movie.parsedDirectors.length > 2;
      
      movie.parsedDirectors.forEach((name, i, arr) => {
        let displayText = name;
        
        if (showOnlyLastName) {
          const nameParts = name.split(" ");
          if (nameParts.length > 1) displayText = nameParts.pop() || name;
        }
        
        const link = createElement("a", { 
          textContent: displayText, 
          href: `?dir=${encodeURIComponent(name)}`, 
          dataset: { directorName: name } 
        });
        dirCont.append(link, i < arr.length - 1 ? ", " : "");
      });
    }
  }

  // Año y País
  const isSeries = movie.isSeries;
  const yearContainer = front.querySelector<HTMLElement>(SELECTORS.YEAR);
  if (yearContainer) {
    yearContainer.textContent = "";
    const displayYear = movie.displayYear || "N/A";
    if (movie.year) {
      const yearLink = createElement("a", {
        textContent: String(movie.year),
        href: `?year=${movie.year}`,
        className: "year-link",
        dataset: { yearValue: `${movie.year}` }
      });
      yearContainer.appendChild(yearLink);
      if (displayYear.length > String(movie.year).length) {
        const suffix = displayYear.substring(String(movie.year).length);
        yearContainer.appendChild(document.createTextNode(suffix));
      }
    } else {
      yearContainer.textContent = displayYear;
    }
  }
  
  renderCountryFlag(
    front.querySelector(SELECTORS.COUNTRY_CONTAINER),
    front.querySelector(SELECTORS.COUNTRY_FLAG),
    movie.country_code || null,
    movie.country || null
  );

  // Iconos
  const iconCont = front.querySelector<HTMLElement>('.card-icons-line');
  if (iconCont) {
    iconCont.innerHTML = "";
    const codes = movie.studios_list?.split(",") || [];
    
    iconCont.classList.toggle('compact', codes.filter(c => STUDIO_DATA[c as keyof typeof STUDIO_DATA]).length >= 3);

    let iconsHtml = "";
    codes.forEach(code => {
      const conf = STUDIO_DATA[code as keyof typeof STUDIO_DATA];
      if (conf) {
        iconsHtml += `<span class="platform-icon ${conf.class || ''}" title="${conf.title}">
          <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="${conf.vb || "0 0 24 24"}">
            <use href="${spriteUrl}#${conf.id}"></use>
          </svg>
        </span>`;
      }
    });
    iconCont.innerHTML = iconsHtml;
  }

  // Nota numérica para modo muro
  const wallRatingEl = card.querySelector<HTMLElement>('[data-template="wall-rating"]');
  if (wallRatingEl) {
    wallRatingEl.textContent = movie.avg_rating ? movie.avg_rating.toFixed(1) : "";
  }

  // --- BACK ---
  const origWrap = back.querySelector<HTMLElement>('.back-original-title-wrapper');
  if (origWrap) {
    if (movie.original_title && movie.original_title.trim()) {
      const origEl = origWrap.querySelector<HTMLElement>('[data-template="original-title"]');
      if (origEl) {
        origEl.textContent = movie.original_title;
        origEl.className = "";
        const oLen = movie.original_title.length;
        if (oLen > 40) origEl.classList.add("title-xl-long");
        else if (oLen > 30) origEl.classList.add("title-long");
        else if (oLen > 20) origEl.classList.add("title-medium");
      }
      origWrap.hidden = false;
    } else { 
      origWrap.hidden = true; 
    }
  }

  // Duración y Episodios
  const durationEl = back.querySelector(SELECTORS.DURATION);
  if (durationEl) durationEl.textContent = formatRuntime(movie.minutes, isSeries);
  
  const epEl = back.querySelector<HTMLElement>('[data-template="episodes"]');
  if (epEl) {
    const epText = isSeries && movie.episodes ? `${movie.episodes} x` : "";
    epEl.textContent = epText;
    epEl.hidden = !epText;
  }

  // Links Externos
  const setupLink = (key: string, url: string | null | undefined) => {
    const el = back.querySelector(`[data-template="${key}-link"]`) as HTMLAnchorElement | null;
    if (!el) return;
    if (url) {
      el.href = url;
      el.classList.remove('disabled');
      el.setAttribute("aria-label", `Ver en ${key}`);
    } else {
      el.removeAttribute('href');
      el.classList.add('disabled');
      el.removeAttribute("aria-label");
    }
    el.hidden = false;
  };
  setupLink('justwatch', movie.justwatch);
  setupLink('wikipedia', movie.wikipedia);

  // Textos Largos
  const genreEl = back.querySelector(SELECTORS.GENRE);
  if (genreEl) genreEl.textContent = movie.genres || "Género no disponible";
  
  const synopsisEl = back.querySelector(SELECTORS.SYNOPSIS);
  if (synopsisEl) synopsisEl.textContent = movie.synopsis || "Sinopsis no disponible.";
  
  // Actores
  const actorsEl = back.querySelector<HTMLElement>(SELECTORS.ACTORS);
  if (actorsEl) {
    const actors = movie.parsedActors || [];
    
    let shortActors = actors.slice(0, 4).join(", ");
    if (actors.length > 4) shortActors += "...";
    if (movie.actors === "(A)") shortActors = "Animación";
    
    actorsEl.textContent = shortActors || "Reparto no disponible";

    const hasActors = actors.length > 0 && actors.some(a => !IGNORED_ACTORS.includes(a.toLowerCase()));
    const expandBtn = actorsEl.parentElement?.querySelector(".actors-expand-btn");
    
    if (hasActors) {
      if (!expandBtn) {
        actorsEl.parentElement?.appendChild(
          createElement("button", { 
            className: "actors-expand-btn", 
            textContent: "+", 
            attributes: { "aria-label": "Ver reparto" } 
          })
        );
      }
    } else {
      expandBtn?.remove();
      back.querySelector('.actors-scrollable-content')?.remove();
    }
  }

  // Ratings
  setupCardRatings(back, movie);
}

export function updateCardUI(card: MovieCardElement): void {
  const movieId = parseInt(card.dataset.movieId || "0", 10);
  const movie = card.movieData;
  if (!movie || movie.isPerson) return;

  const userData = getUserDataForMovie(movieId);
  const isOnWatchlist = userData?.onWatchlist ?? false;

  // Botón Watchlist
  const watchlistBtn = card.querySelector('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    watchlistBtn.classList.toggle("is-active", isOnWatchlist);
    watchlistBtn.setAttribute("aria-label", isOnWatchlist ? "Quitar de lista" : "Añadir a lista");
  }

  // Estrellas
  updateRatingUI(card);
}

export function initializeCard(card: MovieCardElement): void {
  const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (starCont) {
    setupRatingListeners(starCont, document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN));
  }
}

// =================================================================
//          5. GESTIÓN DE GRID (Renderizado Masivo)
// =================================================================

export async function renderMovieGrid(
  container: HTMLElement | null, 
  movies: MappedMovie[], 
  vipData: VipData | null = null
): Promise<void> {
  const renderId = ++currentRenderRequestId;
  unflipAllCards();
  if (!container) return;

  const BATCH_SIZE = CONFIG.CARD_BATCH_SIZE || 12;
  let index = 0;

  function renderBatch() {
    if (renderId !== currentRenderRequestId) return;
    if (index >= movies.length || !document.body.contains(container)) return;

    const limit = Math.min(index + BATCH_SIZE, movies.length);
    const isFirstBatch = index === 0;

    scheduleWork(() => {
      if (renderId !== currentRenderRequestId) return;
      const fragment = document.createDocumentFragment();

      for (let i = index; i < limit; i++) {
        fragment.appendChild(createCardElement(movies[i], i));
      }

      if (isFirstBatch) {
        cleanupLazyImages(container);
        container.textContent = "";
        
        if (vipData) {
          if (vipData.type === 'person' && vipData.data) {
            container.appendChild(createPersonCardElement(vipData.data));
          } else if (vipData.type === 'collection') {
            container.appendChild(createCollectionCardElement(vipData.code, vipData.total));
          } else if (vipData.type === 'studio') {
            container.appendChild(createStudioCardElement(vipData.code, vipData.total));
          }
        }
      }

      container.appendChild(fragment);
      index = limit;
      
      if (index < movies.length) {
        renderBatch();
      }
    }, isFirstBatch ? 'user-visible' : 'background');
  }

  renderBatch();
}

function createCardElement(movie: MappedMovie, index: number): DocumentFragment {
  if (!cardTemplate) return document.createDocumentFragment();
  const clone = cardTemplate.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`) as MovieCardElement | null;
  
  if (card) {
    card.dataset.movieId = String(movie.id);
    card.movieData = movie;
    card.style.setProperty("--card-index", String(Math.min(index, 20)));

    populateCard(card, movie, index);
    updateCardUI(card);
    initializeCard(card);
  }
  
  return clone;
}

function createPersonCardElement(person: PersonDetails): DocumentFragment {
  if (!personTemplate) return document.createDocumentFragment();
  const clone = personTemplate.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector('.person-card') as MovieCardElement | null;
  if (!card) return clone;
  
  card.dataset.movieId = `person-${person.id}`;
  card.movieData = { ...person, isPerson: true };
  
  const img = card.querySelector('img');
  
  if (img) {
    if (person.photo && person.photo !== 'NOT_FOUND') {
      let photoName = person.photo;
      if (/\.(jpg|jpeg|png)$/i.test(photoName)) {
        photoName = photoName.replace(/\.(jpg|jpeg|png)$/i, ".webp");
      } else if (!photoName.endsWith(".webp")) {
        photoName += ".webp";
      }
      img.src = `${CONFIG.PROFILE_BASE_URL}${photoName}`;
    } else {
      img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;
    }
    
    img.alt = `Foto de ${person.name}`;
    img.loading = "eager";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "high");
    img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  }
  
  const titleEl = card.querySelector<HTMLElement>('[data-template="title"]');
  if (titleEl) {
    titleEl.textContent = person.name;
    const tLen = person.name.length;
    if (tLen > 40) titleEl.classList.add("title-xl-long");
    else if (tLen > 25) titleEl.classList.add("title-long");
    else if (tLen > 12) titleEl.classList.add("title-medium");
  }
  
  const birthplaceEl = card.querySelector('[data-template="birthplace"]');
  if (birthplaceEl) birthplaceEl.textContent = person.place_of_birth || "";
  
  const getYear = (dateStr: string | null) => dateStr ? dateStr.split('-')[0] : '';
  const bYear = getYear(person.birthday);
  const dYear = getYear(person.deathday);
  
  let ageStr = "";
  if (person.birthday) {
    const bDate = new Date(person.birthday);
    const eDate = person.deathday ? new Date(person.deathday) : new Date();
    let age = eDate.getFullYear() - bDate.getFullYear();
    const m = eDate.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && eDate.getDate() < bDate.getDate())) age--;
    ageStr = person.deathday ? `(${age} ✝)` : `(${age})`;
  }
  
  const ageEl = card.querySelector('[data-template="age"]');
  if (ageEl) ageEl.textContent = ageStr;

  const datesEl = card.querySelector('[data-template="dates"]');
  if (datesEl) datesEl.textContent = bYear ? (dYear ? `${bYear}-${dYear}` : `${bYear}-`) : "";
  
  let wallName = person.name;
  if (wallName.length > 14) {
    const parts = wallName.split(" ");
    if (parts.length >= 2) {
      wallName = `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    }
  }
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = wallName;
 
  renderCountryFlag(
    card.querySelector(SELECTORS.COUNTRY_CONTAINER),
    card.querySelector(SELECTORS.COUNTRY_FLAG),
    person.countries?.code || null,
    person.countries?.name || null
  );
  
  const headlineEl = card.querySelector('[data-template="bio-headline"]');
  if (headlineEl) {
    headlineEl.textContent = person.titulo_bio || "";
  }
  
  const biographyEl = card.querySelector('[data-template="biography"]');
  if (biographyEl) {
    biographyEl.textContent = person.biography || "Biografía no disponible en el catálogo.";
  }
  
  return clone;
}

function createCollectionCardElement(selectionCode: string, totalMovies: number): DocumentFragment {
  if (!collectionTemplate) return document.createDocumentFragment();
  const clone = collectionTemplate.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector('.collection-card');
  if (!card) return clone;
  
  const img = card.querySelector('img');
  const config = FILTER_CONFIG.selection as unknown as { titles?: Record<string, string>; items: Record<string, string> };
  const fullName = config.titles?.[selectionCode] || config.items[selectionCode] || selectionCode;
  const shortName = config.items[selectionCode] || fullName;
  
  if (img) {
    img.src = `${CONFIG.PROFILE_BASE_URL}collection_${selectionCode.toLowerCase()}.webp`;
    img.alt = `Colección ${fullName}`;
    img.loading = "eager";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "high");
    img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  }
  
  const titleEl = card.querySelector<HTMLElement>('[data-template="title"]');
  if (titleEl) {
    titleEl.textContent = fullName;
    if (fullName.length > 40) titleEl.classList.add("title-xl-long");
    else if (fullName.length > 25) titleEl.classList.add("title-long");
    else if (fullName.length > 12) titleEl.classList.add("title-medium");
  }
  
  const subtitleEl = card.querySelector('[data-template="subtitle"]');
  if (subtitleEl) subtitleEl.textContent = "Selección / Saga";

  const countEl = card.querySelector('[data-template="count"]');
  if (countEl) countEl.textContent = `${totalMovies} títulos`;
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = shortName;

  return clone;
}

function createStudioCardElement(studioCode: string, totalMovies: number): DocumentFragment {
  if (!collectionTemplate) return document.createDocumentFragment();
  const clone = collectionTemplate.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector('.collection-card');
  if (!card) return clone;
  
  const img = card.querySelector('img');
  const config = STUDIO_DATA[studioCode as keyof typeof STUDIO_DATA];
  const fullName = config ? config.title : studioCode;
  
  if (img) {
    img.src = `${CONFIG.PROFILE_BASE_URL}studio_${studioCode.toLowerCase()}.webp`;
    img.alt = `Estudio ${fullName}`;
    img.loading = "eager";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "high");
    img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  }
  
  const titleEl = card.querySelector<HTMLElement>('[data-template="title"]');
  if (titleEl) {
    titleEl.textContent = fullName;
    if (fullName.length > 40) titleEl.classList.add("title-xl-long");
    else if (fullName.length > 25) titleEl.classList.add("title-long");
    else if (fullName.length > 12) titleEl.classList.add("title-medium");
  }
  
  const subtitleEl = card.querySelector('[data-template="subtitle"]');
  if (subtitleEl) subtitleEl.textContent = "Estudio / Productora";

  const countEl = card.querySelector('[data-template="count"]');
  if (countEl) countEl.textContent = `${totalMovies} títulos`;
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = fullName;

  return clone;
}

// Skeletons y Estados Vacíos
export function renderSkeletons(container: HTMLElement | null, pagContainer: HTMLElement | null): void {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;
  
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const count = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    frag.appendChild(createElement("div", { className: "skeleton-card" }));
  }
  container.appendChild(frag);
}

export function renderNoResults(
  container: HTMLElement | null, 
  pagContainer: HTMLElement | null, 
  filters: ActiveFilters
): void {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;

  const div = createElement("div", { className: "no-results", attributes: { role: "status" } });
  
  // Micro-ilustración editorial (SVG Inline)
  div.appendChild(createElement("div", { className: "no-results-icon", innerHTML: ICONS.POPCORN }));

  div.appendChild(createElement("h3", { textContent: "No se encontraron resultados" }));
  
  const hasFilters = hasActiveMeaningfulFilters();
  const msg = filters.searchTerm 
    ? `Prueba a simplificar tu búsqueda para "${filters.searchTerm}".`
    : hasFilters ? "Intenta eliminar algunos filtros." : "";
    
  if (msg) div.appendChild(createElement("p", { textContent: msg }));
  
  div.appendChild(createElement("button", { 
    id: "clear-filters-from-empty", className: "btn btn--outline", textContent: "Limpiar filtros" 
  }));
  
  container.appendChild(div);
}

export function renderErrorState(container: HTMLElement | null, pagContainer: HTMLElement | null, message: string): void {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  
  const div = createElement("div", { className: "no-results", attributes: { role: "alert" } });
  
  div.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  div.appendChild(createElement("p", { textContent: message }));
  
  container?.appendChild(div);
}

// =================================================================
//          6. ONBOARDING (Educación de Usuario)
// =================================================================

export function runFlipOnboarding(container: HTMLElement): void {
  const seenCount = (LocalStore.get("flipTutorialCount") as number) || 0;
  const MAX_SHOWS = 3;

  if (seenCount >= MAX_SHOWS || document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;

  setTimeout(() => {
    const firstCard = container.querySelector<HTMLElement>(`.${CSS_CLASSES.MOVIE_CARD}`);
    if (!firstCard || !firstCard.isConnected) return;

    const inner = firstCard.querySelector(".flip-card-inner");
    if (inner && !inner.classList.contains("is-flipped")) {
      inner.classList.add("is-flipped");
      
      setTimeout(() => {
        if (inner.isConnected && inner.classList.contains("is-flipped")) {
          inner.classList.remove("is-flipped");
          LocalStore.set("flipTutorialCount", seenCount + 1);
        }
      }, 1200);
    }
  }, 1500);
}
