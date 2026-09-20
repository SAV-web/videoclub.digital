import { CONFIG, CSS_CLASSES, SELECTORS, STUDIO_DATA, IGNORED_ACTORS, FILTER_CONFIG } from "../../constants.js";
import { formatRuntime, createElement, triggerHapticFeedback, renderCountryFlag, getPosterUrl, computePersonAgeInfo, applyLengthBasedClass, buildFilterUrl, toSlug } from "../../utils.js";
import { getUserDataForMovie, updateUserDataForMovie, appEvents } from "../../state.js";
import { saveLocalEntry } from "../../localStore.js";
import { scheduleSync } from "../../syncManager.js";
import { showToast, areInteractionsLocked, lockGlobalInteractions } from "../../ui.js";
import { setupRatingListeners, handleRatingClick, updateRatingUI, setupCardRatings, resolveRatingMutationOnWatchlist } from "../rating.js";
import { normalizeMovieId } from "../../contracts.js";
import { preserveHyphenatedWords } from "../../../shared/formatters.js";
import type { MappedMovie, PersonDetails, UserMovieEntry, MovieCardElement } from "../../types.js";

import {
  preloadedLinkElements,
  prefetchedUrls,
  lazyLoadObserver,
  getFlippedCard,
  setFlippedCard,
  getHoverTimeout,
  setHoverTimeout,
  getSingleTapTimeout,
  setSingleTapTimeout,
  getHoveredCard,
  setHoveredCard,
  getCardGeneration,
  getFlipOnboardingTimeout,
  setFlipOnboardingTimeout,
  getFlipBackTimeout,
  setFlipBackTimeout
} from "./context.js";

const CARD_TITLE_THRESHOLDS: Array<[number, string]> = [
  [40, "title-xl-long"],
  [25, "title-long"],
  [12, "title-medium"],
];

// Cachear templates bajo demanda (Lazy Getters) para asegurar reentrancia y evitar nulls en cold boots
let cardTemplate: HTMLTemplateElement | null = null;
let personTemplate: HTMLTemplateElement | null = null;
let collectionTemplate: HTMLTemplateElement | null = null;

function getCardTemplate(): HTMLTemplateElement | null {
  if (!cardTemplate && typeof document !== "undefined") {
    cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE) as HTMLTemplateElement | null;
  }
  return cardTemplate;
}

function getPersonTemplate(): HTMLTemplateElement | null {
  if (!personTemplate && typeof document !== "undefined") {
    personTemplate = document.querySelector(SELECTORS.PERSON_CARD_TEMPLATE) as HTMLTemplateElement | null;
  }
  return personTemplate;
}

function getCollectionTemplate(): HTMLTemplateElement | null {
  if (!collectionTemplate && typeof document !== "undefined") {
    collectionTemplate = document.querySelector("#collection-card-template") as HTMLTemplateElement | null;
  }
  return collectionTemplate;
}

// Consulta de Viewport sin listeners pesados de resize
const mobileQuery = typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)") : null;
const isMobileViewport = (): boolean => mobileQuery ? mobileQuery.matches : false;

export const MAX_PREFETCH_LINKS = 4;
export const HOVER_DELAY = 1000;
export const INTERACTIVE_SELECTOR = ".card-rating-block, .front-director-info, .actors-expand-btn, a[href]";
export const QUICK_VIEW_INIT_FLAG = "_quickViewInitialized";

export async function loadAndOpenModal(cardElement: MovieCardElement): Promise<void> {
  if (cardElement.classList.contains('collection-card') || cardElement.classList.contains('studio-card')) return;
  if (cardElement.classList.contains('person-card')) {
    const personData = cardElement.movieData as PersonDetails | undefined;
    if (!personData?.biography || !personData.biography.trim()) return;
  }
  lockGlobalInteractions(500);
  const { openModal, initQuickView } = await import("../modal.js");
  const win = window as unknown as Record<string, unknown>;
  if (!win[QUICK_VIEW_INIT_FLAG]) {
    initQuickView();
    win[QUICK_VIEW_INIT_FLAG] = true;
  }
  openModal(cardElement);
}

export function resetCardBackState(cardElement: MovieCardElement): void {
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
  const hTimeout = getHoverTimeout();
  if (hTimeout) {
    clearTimeout(hTimeout);
    setHoverTimeout(undefined);
  }
  const stTimeout = getSingleTapTimeout();
  if (stTimeout) {
    clearTimeout(stTimeout);
    setSingleTapTimeout(undefined);
  }
  const fOnboard = getFlipOnboardingTimeout();
  if (fOnboard) {
    clearTimeout(fOnboard);
    setFlipOnboardingTimeout(null);
  }
  const fBack = getFlipBackTimeout();
  if (fBack) {
    clearTimeout(fBack);
    setFlipBackTimeout(null);
  }

  // Desvoltear de forma segura todas las fichas con is-flipped en el DOM (tanto manuales como de onboarding)
  if (typeof document !== "undefined") {
    document.querySelectorAll<HTMLElement>(".flip-card-inner.is-flipped").forEach((inner) => {
      inner.classList.remove("is-flipped");
      const parentCard = inner.closest<MovieCardElement>(".movie-card");
      if (parentCard) resetCardBackState(parentCard);
    });
  }

  const flipped = getFlippedCard();
  if (flipped) {
    resetCardBackState(flipped);
    setFlippedCard(null);
    document.removeEventListener("click", handleDocumentClick);
  }
}

export function handleDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const flipped = getFlippedCard();
  if (flipped && !flipped.contains(target)) {
    unflipAllCards();
  }
}

/**
 * Precarga controlada de imagen con deduplicación estricta y límite FIFO de 4 enlaces.
 */
export function prefetchImageUrl(url: string | null | undefined): void {
  if (!url || typeof document === "undefined" || !document.head) return;
  if (url.startsWith("data:")) return;

  // 1. Evitar duplicados si ya está en el Set
  if (prefetchedUrls.has(url)) return;

  // 2. Evitar duplicados si ya existe un <link rel="prefetch"> en el documento
  if (document.querySelector(`link[rel="prefetch"][href="${url}"]`)) {
    prefetchedUrls.add(url);
    return;
  }

  // 3. Evitar prefetch innecesario si la imagen ya está presente y cargada en el DOM
  const existingImg = document.querySelector<HTMLImageElement>(`img[src="${url}"]`);
  if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
    prefetchedUrls.add(url);
    return;
  }

  prefetchedUrls.add(url);

  // 4. Política FIFO con límite MAX_PREFETCH_LINKS (4)
  if (preloadedLinkElements.length >= MAX_PREFETCH_LINKS) {
    const oldest = preloadedLinkElements.shift();
    try {
      if (oldest?.href) {
        prefetchedUrls.delete(oldest.href);
        prefetchedUrls.delete(oldest.getAttribute("href") || "");
      }
      oldest?.remove();
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[Card] Error al retirar enlace de precarga FIFO:", e);
      }
    }
  }

  // 5. Inserción en el head
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "image";
  link.href = url;
  document.head.appendChild(link);
  preloadedLinkElements.push(link);
}

export function prefetchCardResources(card: MovieCardElement): void {
  if (card.dataset.prefetched) return;
  card.dataset.prefetched = "true";

  // 1. Intención de detalle: Cargar lógica del modal bajo demanda
  import("../modal.js");

  // 2. Intención visual en desktop (hover prolongado 1000ms): Precarga no bloqueante de imagen
  const img = card.querySelector<HTMLImageElement>("img");
  const src = img?.dataset?.src || (img?.src && !img.src.startsWith("data:") ? img.src : null);
  if (src) {
    prefetchImageUrl(src);
  }
}

export function startFlipTimer(cardElement: MovieCardElement): void {
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) || cardElement.classList.contains('collection-card') || cardElement.classList.contains('person-card')) return;
  const inner = cardElement.querySelector(".flip-card-inner");
  if (inner?.classList.contains("is-flipped")) return;

  const hTimeout = getHoverTimeout();
  if (hTimeout) clearTimeout(hTimeout);
  const currentGen = getCardGeneration();
  setHoverTimeout(setTimeout(() => {
    if (currentGen !== getCardGeneration()) return;
    if (getHoveredCard() === cardElement) {
      cardElement.classList.add("is-hovered");
      prefetchCardResources(cardElement);
    }
  }, HOVER_DELAY));
}

export const handleSingleTap = (cardElement: MovieCardElement): void => {
  if (!cardElement || cardElement.classList.contains('collection-card') || cardElement.classList.contains('person-card')) return;
  const inner = cardElement.querySelector(".flip-card-inner");
  if (!inner) return;

  const isFlipped = inner.classList.contains("is-flipped");

  const flipped = getFlippedCard();
  if (flipped && flipped !== cardElement) {
    unflipAllCards();
  }

  triggerHapticFeedback("light");
  inner.classList.toggle("is-flipped");
  // En tap táctil de móvil/tablet NO se descarga el póster.
  // Solo precargamos bajo demanda la lógica JS del modal si el usuario aún no la tiene.
  import("../modal.js");

  if (!isFlipped) {
    setFlippedCard(cardElement);
    const stTimeout = getSingleTapTimeout();
    if (stTimeout) clearTimeout(stTimeout);
    const currentGen = getCardGeneration();
    setSingleTapTimeout(setTimeout(() => {
      if (currentGen !== getCardGeneration()) return;
      if (getFlippedCard() === cardElement) {
        document.addEventListener("click", handleDocumentClick);
      }
    }, 0));
  } else {
    setFlippedCard(null);
    resetCardBackState(cardElement);
    const stTimeout = getSingleTapTimeout();
    if (stTimeout) {
      clearTimeout(stTimeout);
      setSingleTapTimeout(undefined);
    }
    document.removeEventListener("click", handleDocumentClick);
  }
};

export async function toggleWatchlist(movieId: number, btn: HTMLElement, card: MovieCardElement): Promise<void> {
  if (!document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
    showToast("Identifícate para añadir", "info");
    return;
  }

  const wasActive = btn.classList.contains("is-active");
  const newState: Partial<UserMovieEntry> = { onWatchlist: !wasActive };

  const ratingMutation = resolveRatingMutationOnWatchlist(newState.onWatchlist || false);
  if (ratingMutation !== undefined) {
    newState.rating = ratingMutation;
  }

  // 1. Experiencia de usuario inmediata (0 ms de latencia)
  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newState);
  updateCardUI(card);

  // 2. Persistencia local inmediata (Local-First: nunca falla, nunca hace rollback)
  await saveLocalEntry(movieId, newState);
  triggerHapticFeedback("success");

  // 3. Sincronización en segundo plano hacia Supabase
  scheduleSync(200);
}

export function handleCardClick(this: MovieCardElement, event: MouseEvent): void {
  // Contrato Global: Respetar el cooldown de gestos y descartar clics adicionales si la modal está abriéndose/abierta
  if (areInteractionsLocked() || document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
    if (!this.classList.contains('is-quick-view') && !this.closest('#quick-view-content')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  const card = this;
  const isPerson = card.classList.contains('person-card');
  const target = event.target as HTMLElement;

  // 0. Botón de alternancia de rol en VIP (Director <-> Actor)
  const roleToggleBtn = target.closest<HTMLElement>('.person-role-toggle-btn');
  if (roleToggleBtn) {
    event.preventDefault();
    event.stopPropagation();
    const targetRole = roleToggleBtn.dataset.targetRole;
    const personName = roleToggleBtn.dataset.personName;
    if (targetRole && personName) {
      if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        import("../modal.js").then(({ closeModal }) => closeModal({ suppressHistoryBack: true }));
      }
      appEvents.emit("filter:apply", { type: targetRole, value: personName });
    }
    return;
  }

  // 1. Botones de Acción
  const watchlistBtn = target.closest<HTMLElement>('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    event.preventDefault(); event.stopPropagation();
    if (isPerson) return;
    if (!document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
      showToast("Identifícate para añadir", "info");
      watchlistBtn.blur();
      return;
    }
    const movieId = normalizeMovieId(card.dataset.movieId);
    if (movieId) toggleWatchlist(movieId, watchlistBtn, card);
    watchlistBtn.blur();
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

      const movieData = card.movieData as MappedMovie;

      // 1. Géneros delante de los actores
      const genres = (movieData?.genres || "")
        .split(",")
        .map(g => g.trim())
        .filter(Boolean);

      if (genres.length > 0) {
        const genreHeading = createElement("h4", { textContent: "Géneros" });
        const genreListText = createElement("div", { className: "actors-list-text genres-list-text" });
        genres.forEach(name => {
          genreListText.appendChild(createElement("button", {
            className: "actor-list-item genre-list-item",
            textContent: name,
            attributes: { "type": "button", "data-genre-name": name }
          }));
        });
        actorsOverlay.appendChild(genreHeading);
        actorsOverlay.appendChild(genreListText);
      }

      // 2. Reparto de actores
      const actors = movieData?.parsedActors || [];
      if (actors.length > 0) {
        const heading = createElement("h4", { textContent: "Reparto" });
        const listText = createElement("div", { className: "actors-list-text" });

        actors.forEach(name => {
          if ((IGNORED_ACTORS as readonly string[]).includes(name.toLowerCase())) {
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
      }

      flipBack.insertBefore(actorsOverlay, flipBack.querySelector(".expand-content-btn"));
    }

    event.stopPropagation();
    flipBack.classList.add("is-expanded", "show-actors");
    const bottomBtn = flipBack.querySelector<HTMLButtonElement>(".expand-content-btn");
    if (bottomBtn) {
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

  // 4. Trasera ampliada: retroceder a la trasera normal al pulsar fuera del área de enlaces
  if (flipBack && flipBack.classList.contains("is-expanded")) {
    const isInteractive = target.closest<HTMLElement>(
      ".actor-list-item, .genre-list-item, [data-director-name], [data-actor-name], [data-year-value], [data-genre-name], [data-country-name], a[href], button, input, [data-action]"
    );
    if (!isInteractive) {
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (selection && selection.toString().trim().length > 0) {
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      resetCardBackState(card);
      return;
    }
  }

  // 5. Enlaces Filtros
  const filterLink = target.closest<HTMLElement>("[data-director-name], [data-actor-name], [data-year-value], [data-genre-name], [data-country-name]");
  if (filterLink) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    event.stopPropagation();

    if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN) || card.classList.contains('is-quick-view')) {
      import("../modal.js").then(({ closeModal }) => closeModal({ suppressHistoryBack: true }));
    }

    if (filterLink.dataset.genreName) {
      appEvents.emit("filter:apply", { type: "genre", value: filterLink.dataset.genreName });
      return;
    }
    if (filterLink.dataset.countryName) {
      appEvents.emit("filter:apply", { type: "country", value: filterLink.dataset.countryName });
      return;
    }

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

  // 7. Apertura Modal (Modo Muro) - Solo si NO estamos ya dentro del modal
  const isInsideModal = card.classList.contains('is-quick-view') || !!card.closest('#quick-view-content');
  if (!isInsideModal) {
    if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      loadAndOpenModal(card);
    }
  }
}

export function populateCard(card: MovieCardElement, movie: MappedMovie, index: number): void {
  const front = card.querySelector<HTMLElement>('.movie-summary');
  const back = card.querySelector<HTMLElement>('.flip-card-back');
  if (!front || !back) return;

  // --- IMAGEN ---
  const img = card.querySelector<HTMLImageElement>("img");
  if (!img) return;

  const posterUrl = movie.posterUrl || getPosterUrl(movie.slug);
  img.alt = `Póster de ${movie.title}`;

  // Uniformidad visual LQIP idéntica a SEO: background-image con ThumbHash inmediato
  if (movie.thumbhash_st) {
    img.style.backgroundImage = `url('${movie.thumbhash_st}')`;
    img.style.backgroundSize = "cover";
    img.style.backgroundPosition = "center";
    img.classList.add(CSS_CLASSES.LAZY_LQIP);
  } else {
    img.style.backgroundImage = "";
    img.classList.remove(CSS_CLASSES.LAZY_LQIP);
  }

  // Prioridad de red para el elemento principal del viewport (LCP)
  if (index === 0) {
    img.setAttribute("fetchpriority", "high");
  } else {
    img.removeAttribute("fetchpriority");
  }

  // Las tarjetas visibles iniciales usan loading="eager" y src directo como en SEO
  const priorityCount = isMobileViewport() ? 6 : (CONFIG.CARD_BATCH_SIZE || 12);
  const isPriority = index < priorityCount;
  img.loading = isPriority ? "eager" : "lazy";

  if (isPriority) {
    img.src = posterUrl;
    if (img.complete) {
      img.classList.add(CSS_CLASSES.LOADED);
    } else {
      img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
      img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
    }
  } else if (lazyLoadObserver) {
    img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    img.dataset.src = posterUrl;
    lazyLoadObserver.observe(img);
  } else {
    img.src = posterUrl;
    img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
    img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
  }


  // --- TEXTOS BÁSICOS ---
  const titleEl = front.querySelector<HTMLElement>(SELECTORS.TITLE);
  if (titleEl && movie.title) {
    titleEl.textContent = movie.title;
    titleEl.title = movie.title;
    applyLengthBasedClass(titleEl, movie.title, CARD_TITLE_THRESHOLDS, true);
  }

  // Directores
  const dirCont = front.querySelector<HTMLElement>(SELECTORS.DIRECTOR);
  if (dirCont) {
    dirCont.textContent = "";
    if (movie.parsedDirectors && movie.parsedDirectors.length > 0) {
      const showOnlyLastName = movie.parsedDirectors.length > 2;

      const directorsInfo = movie.parsedDirectors.map(fullName => {
        const parts = fullName.trim().split(/\s+/);
        const lastName = parts.length > 1 ? parts[parts.length - 1] : fullName;
        const firstName = parts.length > 1 ? parts[0] : "";
        return {
          fullName,
          lastName,
          initial: firstName ? firstName.charAt(0).toUpperCase() : ""
        };
      });

      directorsInfo.forEach((info, i) => {
        let displayText = info.fullName;

        if (showOnlyLastName) {
          const sharesLastName = directorsInfo.some(other =>
            other.fullName !== info.fullName &&
            other.lastName.toLowerCase() === info.lastName.toLowerCase()
          );

          if (sharesLastName && info.initial) {
            displayText = `${info.initial}. ${info.lastName}`;
          } else {
            displayText = info.lastName;
          }
        }

        const link = createElement("a", {
          textContent: displayText,
          href: buildFilterUrl("director", info.fullName),
          dataset: { directorName: info.fullName }
        });
        dirCont.append(link, i < directorsInfo.length - 1 ? ", " : "");
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
        href: buildFilterUrl("year", String(movie.year)),
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
    movie.country_code || undefined,
    movie.country || undefined
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
            <use href="#${conf.id}"></use>
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
    const origTitle = (movie.original_title && movie.original_title.trim()) || (movie.title && movie.title.trim()) || "";
    if (origTitle) {
      const origEl = origWrap.querySelector<HTMLElement>('[data-template="original-title"]');
      if (origEl) {
        origEl.textContent = origTitle;
        origEl.className = "";
        const oLen = origTitle.length;
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
  const genreEl = back.querySelector<HTMLElement>(SELECTORS.GENRE);
  if (genreEl) {
    genreEl.textContent = preserveHyphenatedWords(movie.genres) || "Género no disponible";
  }

  const synopsisEl = back.querySelector(SELECTORS.SYNOPSIS);
  if (synopsisEl) synopsisEl.textContent = preserveHyphenatedWords(movie.synopsis) || "Sinopsis no disponible.";

  // Actores
  const actorsEl = back.querySelector<HTMLElement>(SELECTORS.ACTORS);
  if (actorsEl) {
    const actors = movie.parsedActors || [];

    let shortActors = actors.slice(0, 4).join(", ");
    if (actors.length > 4) shortActors += "...";
    if (movie.actors === "(A)") shortActors = "Animación";

    actorsEl.textContent = preserveHyphenatedWords(shortActors) || "Reparto no disponible";


    const hasActors = actors.length > 0 && actors.some(a => !(IGNORED_ACTORS as readonly string[]).includes(a.toLowerCase()));
    const genres = (movie.genres || "").split(",").map(g => g.trim()).filter(Boolean);
    const canExpand = hasActors || genres.length > 0;
    const expandBtn = actorsEl.parentElement?.querySelector(".actors-expand-btn");

    if (canExpand) {
      if (!expandBtn) {
        actorsEl.parentElement?.appendChild(
          createElement("button", {
            className: "actors-expand-btn",
            textContent: "+",
            attributes: { "aria-label": "Ver detalles de géneros y reparto" }
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

export function applyLqipImage(img: HTMLImageElement, thumbhashSrc: string | null | undefined, fullUrl: string): void {
  if (thumbhashSrc) {
    img.src = thumbhashSrc;
    img.classList.remove(CSS_CLASSES.LOADED);
    img.classList.add(CSS_CLASSES.LAZY_LQIP);

    const highResImg = new Image();
    highResImg.onload = () => {
      img.src = fullUrl;
      requestAnimationFrame(() => {
        img.classList.add(CSS_CLASSES.LOADED);
      });
    };
    highResImg.onerror = () => {
      img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;
      img.classList.add(CSS_CLASSES.LOADED);
    };
    highResImg.src = fullUrl;
  } else {
    img.classList.remove(CSS_CLASSES.LOADED);
    img.classList.add(CSS_CLASSES.LAZY_LQIP);

    img.onload = () => {
      requestAnimationFrame(() => {
        img.classList.add(CSS_CLASSES.LOADED);
      });
    };
    img.onerror = () => {
      img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;
      img.classList.add(CSS_CLASSES.LOADED);
      img.onerror = null;
    };

    img.src = fullUrl;
    if (img.complete) {
      img.classList.add(CSS_CLASSES.LOADED);
    }
  }
}

export function updateCardUI(card: MovieCardElement): void {
  const movieId = normalizeMovieId(card.dataset.movieId);
  const movie = card.movieData;
  if (!movie || ("isPerson" in movie && movie.isPerson) || !movieId) return;

  const userData = getUserDataForMovie(movieId);
  const isOnWatchlist = userData?.onWatchlist ?? false;

  // Botón Watchlist
  const watchlistBtn = card.querySelector('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    watchlistBtn.classList.toggle("is-active", isOnWatchlist);
    watchlistBtn.setAttribute("aria-label", isOnWatchlist ? "Quitar de lista" : "Añadir a lista");
  }

  // Estrellas (pasamos userData ya obtenido para evitar consulta duplicada)
  updateRatingUI(card, userData);
}

export function initializeCard(card: MovieCardElement): void {
  const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (starCont) {
    setupRatingListeners(starCont, true);
  }
  card.addEventListener("click", handleCardClick);
}

export function createCardElement(movie: MappedMovie, index: number): DocumentFragment {
  const template = getCardTemplate();
  if (!template) return document.createDocumentFragment();
  const clone = template.content.cloneNode(true) as DocumentFragment;
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

export function createPersonCardElement(person: PersonDetails): DocumentFragment {
  const template = getPersonTemplate();
  if (!template) return document.createDocumentFragment();
  const clone = template.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector('.person-card') as MovieCardElement | null;
  if (!card) return clone;

  const hasBio = Boolean(person.biography && person.biography.trim());
  if (!hasBio) {
    card.classList.add('no-bio');
  }

  card.dataset.movieId = `person-${person.id}`;
  card.movieData = { ...person, isPerson: true };
  card.style.setProperty("--card-index", "0");

  const img = card.querySelector('img');

  if (img) {
    const personSlug = person.slug || toSlug(person.name);
    const photoUrl = (person.vip === 1 || Boolean(person.birthday) || Boolean(person.thumbhash_st))
      ? `${CONFIG.PROFILE_BASE_URL}${personSlug}.webp`
      : `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;

    img.alt = `Foto de ${person.name}`;
    img.loading = "eager";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "high");

    applyLqipImage(img, person.thumbhash_st, photoUrl);
  }

  const titleEl = card.querySelector<HTMLElement>('[data-template="title"]');
  if (titleEl) {
    titleEl.textContent = person.name;
    applyLengthBasedClass(titleEl, person.name, CARD_TITLE_THRESHOLDS);
  }

  const birthplaceEl = card.querySelector('[data-template="birthplace"]');
  if (birthplaceEl) birthplaceEl.textContent = person.place_of_birth || "";

  const ageInfo = computePersonAgeInfo(person.birthday, person.deathday);

  const ageEl = card.querySelector('[data-template="age"]');
  if (ageEl) ageEl.textContent = ageInfo.ageStr;

  const datesEl = card.querySelector('[data-template="dates"]');
  if (datesEl) datesEl.textContent = ageInfo.datesStr;

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
    person.countries?.code ?? undefined,
    person.countries?.name ?? undefined
  );

  const headlineEl = card.querySelector('[data-template="bio-headline"]');
  if (headlineEl) {
    headlineEl.textContent = person.titulo_bio || "";
  }

  const biographyEl = card.querySelector('[data-template="biography"]');
  if (biographyEl) {
    biographyEl.textContent = person.biography || "Biografía no disponible en el catálogo.";
  }

  // Botón de alternancia de rol (Director <-> Actor)
  const roleToggleBtn = card.querySelector<HTMLButtonElement>('[data-template="role-toggle-btn"]');
  const roleLetterEl = card.querySelector<HTMLElement>('[data-template="role-badge-letter"]');

  if (roleToggleBtn && roleLetterEl) {
    if (person.hasBothRoles) {
      const isDirector = person.currentRole === "director";
      const targetRole = isDirector ? "actor" : "director";
      const currentLetter = isDirector ? "D" : "A";
      const tooltipText = isDirector
        ? `Ver películas de ${person.name} como Actor`
        : `Ver películas de ${person.name} como Director`;

      roleLetterEl.textContent = currentLetter;
      roleToggleBtn.title = tooltipText;
      roleToggleBtn.setAttribute("aria-label", tooltipText);
      roleToggleBtn.style.display = "flex";
      roleToggleBtn.dataset.targetRole = targetRole;
      roleToggleBtn.dataset.personName = person.name;
    } else {
      roleToggleBtn.style.display = "none";
    }
  }

  return clone;
}

export function createGroupCardElement(
  kind: 'collection' | 'studio',
  code: string,
  totalMovies: number = 0,
  thumbhash_st?: string | null
): DocumentFragment {
  const template = getCollectionTemplate();
  if (!template) return document.createDocumentFragment();
  const clone = template.content.cloneNode(true) as DocumentFragment;
  const card = clone.querySelector<HTMLElement>('.collection-card');
  if (!card) return clone;

  card.style.setProperty("--card-index", "0");

  const isStudio = kind === 'studio';
  const img = card.querySelector('img');

  let fullName = code;
  let shortName = code;

  if (isStudio) {
    const config = STUDIO_DATA[code as keyof typeof STUDIO_DATA];
    fullName = (config && config.title) ? config.title : code;
    shortName = fullName;
  } else {
    const config = FILTER_CONFIG.selection as unknown as { titles?: Record<string, string>; items: Record<string, string> };
    fullName = config.titles?.[code] || config.items[code] || code;
    shortName = config.items[code] || fullName;
  }

  if (img) {
    const prefix = isStudio ? "studio" : "selection";
    const label = isStudio ? "Estudio" : "Selección";
    const fullUrl = `${CONFIG.PROFILE_BASE_URL}${prefix}_${code.toLowerCase()}.webp`;

    img.alt = `${label} ${fullName}`;
    img.loading = "eager";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "high");

    applyLqipImage(img, thumbhash_st, fullUrl);
  }

  const titleEl = card.querySelector<HTMLElement>('[data-template="title"]');
  if (titleEl) {
    titleEl.textContent = fullName;
    applyLengthBasedClass(titleEl, fullName, CARD_TITLE_THRESHOLDS);
  }

  const subtitleEl = card.querySelector('[data-template="subtitle"]');
  if (subtitleEl) subtitleEl.textContent = isStudio ? "Estudio / Productora" : "Selección";

  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = shortName;

  return clone;
}

export function createCollectionCardElement(selectionCode: string, totalMovies: number = 0, thumbhash_st?: string | null): DocumentFragment {
  return createGroupCardElement('collection', selectionCode, totalMovies, thumbhash_st);
}

export function createStudioCardElement(studioCode: string, totalMovies: number = 0, thumbhash_st?: string | null): DocumentFragment {
  return createGroupCardElement('studio', studioCode, totalMovies, thumbhash_st);
}
