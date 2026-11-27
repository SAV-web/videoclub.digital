import { createElement, renderCountryFlag, renderStudioIcons, setupExternalLink, applyLengthBasedClass, buildFilterUrl, formatModalDuration } from "../../utils.js";
import { preserveHyphenatedWords } from "../../../shared/formatters.js";
import { CONFIG, IGNORED_ACTORS_SET, CSS_CLASSES } from "../../constants.js";
import { getActiveFilters } from "../../state.js";
import { canCombinePersonFilter, getActivePeopleCount } from "../../contracts.js";
import { getCachedPersonDetails } from "../../api.js";
import { isPersonVip, isSingleActivePersonVip, loadVipSlugs } from "../../vipPerson.js";
import { updateCardUI, adjustQuickViewNoteHeight, applyLqipImage, populatePersonFields } from "../card/index.js";
import { setupCardRatings } from "../rating.js";
import type { ActiveFilters, Movie, MappedMovie, MovieCardElement } from "../../types.js";

export interface ExtendedMovie extends MappedMovie {
  image_hq?: string | null; // Alias de retrocompatibilidad hacia posterUrl
  // Propiedades para personas en caso de person-card
  name?: string;
  place_of_birth?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  biography?: string | null;
  titulo_bio?: string | null;
  countries?: { code: string; name: string };
  isPerson?: boolean;
  hasBothRoles?: boolean;
  currentRole?: 'director' | 'actor';
}

export interface MovieContentElement extends HTMLElement {
  movieData?: Movie;
}

interface ModalNodes {
  [key: string]: HTMLElement | null | undefined;
  img?: HTMLImageElement | null;
  iconsContainer?: HTMLElement | null;
  origTitleWrap?: HTMLElement | null;
}

const createLink = (text: string, type: 'director' | 'actor' | 'genre'): HTMLAnchorElement => {
  const dataAttr = type === 'director' ? 'directorName' : (type === 'actor' ? 'actorName' : 'genreName');
  return createElement("a", {
    textContent: preserveHyphenatedWords(text),
    href: buildFilterUrl(type, text),
    dataset: { [dataAttr]: text }
  }) as HTMLAnchorElement;
};

const appendCombineAnchor = (
  tail: HTMLElement,
  type: 'director' | 'actor',
  name: string
): void => {
  if (tail.querySelector(".modal-person-anchor")) return;
  const anchor = createElement("span", { className: "modal-person-anchor" });
  const combineBtn = createElement("button", {
    type: "button",
    className: "person-combine-btn modal-person-combine-btn",
    textContent: "+",
    dataset: { combineType: type, combineValue: name },
    attributes: {
      "aria-label": `Combinar con ${name}`,
      title: `Combinar con ${name}`
    }
  });
  anchor.appendChild(combineBtn);
  tail.appendChild(anchor);
};

const shouldShowModalCombine = (
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2"> | null,
  isCurrentVip: boolean,
  type: 'director' | 'actor' | 'genre',
  name: string
): boolean => {
  if (!filters || !isCurrentVip || (type !== 'director' && type !== 'actor')) return false;
  const isTargetVip = isPersonVip(type, name, getCachedPersonDetails);
  return canCombinePersonFilter(filters, type, name, isTargetVip, isCurrentVip);
};

/**
 * Construye una lista enlazada de directores, actores o géneros para la modal,
 * calculando una sola vez por bloque la elegibilidad de combinación VIP '+'.
 */
const renderPersonLinksList = (
  targetEl: HTMLElement,
  names: string[],
  type: 'director' | 'actor' | 'genre',
  ignoreSet?: ReadonlySet<string>
): void => {
  const isPersonList = type === 'director' || type === 'actor';
  const filters = isPersonList ? getActiveFilters() : null;
  const hasSinglePerson = Boolean(filters && getActivePeopleCount(filters) === 1);
  if (hasSinglePerson) void loadVipSlugs();
  const isCurrentVip = (hasSinglePerson && filters)
    ? isSingleActivePersonVip(filters, getCachedPersonDetails)
    : false;

  const frag = document.createDocumentFragment();
  names.forEach((name, i, arr) => {
    const hasNext = i < arr.length - 1;
    if (ignoreSet && ignoreSet.has(name.toLowerCase())) {
      frag.append(preserveHyphenatedWords(name));
      if (hasNext) frag.append(", ");
      return;
    }

    const wrapper = createElement("span", { className: "modal-person-item" });
    const link = createLink(name, type);
    const tail = createElement("span", { className: "modal-person-tail" });
    if (hasNext) {
      tail.appendChild(createElement("span", { className: "modal-person-comma", textContent: "," }));
    }
    if (shouldShowModalCombine(filters, isCurrentVip, type, name)) {
      appendCombineAnchor(tail, type as 'director' | 'actor', name);
    }
    wrapper.append(link, tail);

    frag.appendChild(wrapper);
    if (hasNext) {
      frag.appendChild(createElement("span", { className: "modal-person-sep", textContent: " " }));
    }
  });
  targetEl.appendChild(frag);
};

/**
 * Sincroniza el estado visual y accesible ('+' / '-') del botón que despliega
 * los botones de combinación VIP del reparto en pantallas táctiles.
 */
export function applyActorsCombineToggleState(
  actorsContainer: HTMLElement,
  toggleBtn: HTMLButtonElement,
  isExpanded: boolean
): boolean {
  actorsContainer.classList.toggle("is-cast-combine-expanded", isExpanded);
  toggleBtn.textContent = isExpanded ? "-" : "+";
  toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  toggleBtn.setAttribute(
    "aria-label",
    isExpanded ? "Ocultar opciones para combinar actores" : "Mostrar opciones para combinar actores"
  );
  toggleBtn.title = isExpanded ? "Ocultar botones de combinación" : "Combinar con actor";
  return isExpanded;
}

/**
 * Crea o retira el botón '+'/'-' junto a "Reparto." según existan actores
 * combinables en la ficha actual (tanto en render inicial como tras carga VIP).
 */
const syncActorsCombineToggle = (actorsContainer: HTMLElement | null | undefined): void => {
  if (!actorsContainer) return;
  const actorsEl = actorsContainer.querySelector<HTMLElement>('[data-template="actors"]');
  const hasCombineButtons = Boolean(actorsEl?.querySelector(".modal-person-combine-btn"));
  let toggleBtn = actorsContainer.querySelector<HTMLButtonElement>(".modal-cast-combine-toggle");

  if (!hasCombineButtons) {
    actorsContainer.classList.remove("is-cast-combine-expanded");
    toggleBtn?.remove();
    return;
  }

  const isExpanded = actorsContainer.classList.contains("is-cast-combine-expanded");
  if (!toggleBtn) {
    toggleBtn = createElement("button", {
      type: "button",
      className: "modal-cast-combine-toggle",
    }) as HTMLButtonElement;
    if (actorsEl) {
      actorsContainer.insertBefore(toggleBtn, actorsEl);
    } else {
      actorsContainer.appendChild(toggleBtn);
    }
  }

  applyActorsCombineToggleState(actorsContainer, toggleBtn, isExpanded);
};

/**
 * Actualiza en vivo los enlaces de director/actor en una modal abierta cuando
 * termina la carga diferida o sincronización de VIPs en segundo plano.
 */
export function upgradeModalPersonCombineButtons(root: HTMLElement): void {
  const filters = getActiveFilters();
  const actorsContainer = root.querySelector<HTMLElement>('[data-template="actors-container"]');
  const isCurrentVip = getActivePeopleCount(filters) === 1
    ? isSingleActivePersonVip(filters, getCachedPersonDetails)
    : false;

  if (!isCurrentVip) {
    syncActorsCombineToggle(actorsContainer);
    return;
  }

  root.querySelectorAll<HTMLAnchorElement>('[data-director-name], [data-actor-name]').forEach((link) => {
    const item = link.closest<HTMLElement>(".modal-person-item");
    const tail = item?.querySelector<HTMLElement>(".modal-person-tail");
    if (!tail || tail.querySelector(".modal-person-anchor")) return;
    const type = link.dataset.directorName ? 'director' : 'actor';
    const name = (type === 'director' ? link.dataset.directorName : link.dataset.actorName) || "";
    if (shouldShowModalCombine(filters, isCurrentVip, type, name)) {
      appendCombineAnchor(tail, type, name);
    }
  });

  syncActorsCombineToggle(actorsContainer);
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
function setupModalHeader(
  nodes: ModalNodes,
  movie: ExtendedMovie,
  _scheduleModalRAF?: (fn: () => void) => number,
  _getLifecycleGen?: () => number
): void {
  // Imagen (Efecto LQIP suave y unificado con applyLqipImage)
  if (nodes.img) {
    const posterUrl = movie.image_hq || movie.posterUrl;
    nodes.img.alt = movie.title ? `Póster de ${movie.title}` : "";

    if (posterUrl) {
      applyLqipImage(nodes.img, movie.thumbhash_st, posterUrl);
    } else {
      nodes.img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      nodes.img.classList.remove(CSS_CLASSES.LAZY_LQIP);
      nodes.img.classList.add(CSS_CLASSES.LOADED);
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
      renderPersonLinksList(nodes.director, movie.parsedDirectors, 'director');
    }
  }

  // Año y País
  if (nodes.year) {
    nodes.year.textContent = "";
    if (movie.year) {
      const yearStr = String(movie.year);
      const yearLink = createElement("a", {
        textContent: yearStr,
        href: buildFilterUrl("year", yearStr),
        className: "year-link",
        dataset: { yearValue: yearStr }
      });
      nodes.year.appendChild(yearLink);
      if (movie.displayYear && movie.displayYear.length > yearStr.length) {
        const suffix = movie.displayYear.substring(yearStr.length);
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
  renderStudioIcons(nodes.iconsContainer, movie.studioList || movie.studios_list);
}

/**
 * Renderiza unidades y palabras de metadatos en spans con clase .meta-unit para
 * permitir una modulación tipográfica más ligera (-20% font-weight) respecto a las cifras numéricas.
 */
function renderModalMetaUnits(container: HTMLElement, text: string): void {
  container.textContent = "";
  if (!text) return;
  const regex = /([a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\.)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.append(text.substring(lastIndex, match.index));
    }
    const span = document.createElement("span");
    span.className = "meta-unit";
    span.textContent = match[0];
    container.appendChild(span);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    container.append(text.substring(lastIndex));
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

  // Duración y Episodios (Formato modal: "10 ep. x 30 min." o "1 h. 45 min.")
  const { episodesText, durationText } = formatModalDuration(movie.minutes, movie.episodes, movie.isSeries);

  if (nodes.episodes) {
    renderModalMetaUnits(nodes.episodes, episodesText);
    nodes.episodes.hidden = !episodesText;
  }

  if (nodes.duration) {
    renderModalMetaUnits(nodes.duration, durationText);
    nodes.duration.hidden = !durationText;
  }

  // Links Externos
  setupExternalLink(nodes["justwatch-link"] as HTMLAnchorElement | null, "justwatch", movie.justwatch);
  setupExternalLink(nodes["wikipedia-link"] as HTMLAnchorElement | null, "wikipedia", movie.wikipedia);

  // Textos Largos
  if (nodes.genre) {
    nodes.genre.textContent = "";
    const genres = (movie.genres || "").split(",").map(g => g.trim()).filter(Boolean);
    if (genres.length > 0) {
      renderPersonLinksList(nodes.genre, genres, 'genre');
    } else {
      nodes.genre.textContent = "N/A";
    }
  }
  if (nodes.synopsis) nodes.synopsis.textContent = preserveHyphenatedWords(movie.synopsis) || "N/A";

  // Actores
  if (nodes.actors) {
    nodes.actors.textContent = "";
    if (movie.parsedActors && movie.parsedActors.length > 0) {
      renderPersonLinksList(nodes.actors, movie.parsedActors, 'actor', IGNORED_ACTORS_SET);
    } else {
      nodes.actors.textContent = "N/A";
    }
    syncActorsCombineToggle(
      nodes["actors-container"] || nodes.actors.closest<HTMLElement>('[data-template="actors-container"]')
    );
  }
}

interface PopulateModalOptions {
  cardElement: MovieCardElement;
  contextCards: HTMLElement[] | null;
  template: DocumentFragment | undefined;
  content: MovieContentElement;
  modal: HTMLElement;
  scheduleModalRAF: (fn: () => void) => number;
  getLifecycleGen: () => number;
  updateNavButtons: (currentId: number | string, contextCards?: HTMLElement[] | null) => void;
}

/**
 * Puebla el contenido del modal clonando la plantilla y asignando datos.
 */
export function populateModalContent(options: PopulateModalOptions): void {
  const {
    cardElement,
    contextCards,
    template,
    content,
    modal,
    scheduleModalRAF,
    getLifecycleGen,
    updateNavButtons
  } = options;

  if (!template || !content || !modal) return;

  // Extraemos URL del póster ya cargado en la tarjeta para evitar parpadeo
  const cardImg = cardElement.querySelector("img");
  const posterUrl = cardImg ? (cardImg.dataset.src || cardImg.src) : null;

  // Clon superficial para evitar mutaciones cruzadas con la card del grid.
  const basePosterUrl = (cardElement.movieData && "posterUrl" in cardElement.movieData) ? cardElement.movieData.posterUrl : undefined;
  const movie = { ...cardElement.movieData, image_hq: posterUrl, posterUrl: posterUrl || basePosterUrl } as ExtendedMovie;
  const isPerson = cardElement.classList.contains('person-card') || movie.isPerson;

  // Si es persona, usamos quick-view-person-template en lugar de quick-view-template
  const personQuickViewTemplate =
    document.getElementById("quick-view-person-template") as HTMLTemplateElement | null;
  const currentTemplate = isPerson
    ? personQuickViewTemplate?.content
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
    // Foto de perfil (Efecto LQIP unificado)
    const img = nodes.img || cardClone.querySelector<HTMLImageElement>("img");
    if (img) {
      img.alt = movie.name ? `Foto de perfil de ${movie.name}` : "";
      if (posterUrl) {
        applyLqipImage(img, movie.thumbhash_st, posterUrl);
      } else {
        img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;
        img.classList.remove(CSS_CLASSES.LAZY_LQIP);
        img.classList.add(CSS_CLASSES.LOADED);
      }
    }

    populatePersonFields(cardClone, movie);

    // Montaje
    content.textContent = "";
    content.appendChild(clone);
    const personFront = cardClone.querySelector<HTMLElement>(".quick-view-media");
    if (personFront) {
      personFront.scrollTop = 0;
      personFront.classList.remove("poster-compact");
    }
    updateNavButtons(modalId, contextCards);
  } else {
    // --- CAPA PELÍCULA ---
    // Poblar cabecera, detalles y notas síncronamente para evitar parpadeos y FOUC
    setupModalHeader(nodes, movie, scheduleModalRAF, getLifecycleGen);
    setupModalDetails(nodes, movie);
    setupCardRatings(cardClone, movie);

    // Montaje
    content.textContent = "";
    content.scrollTop = 0;
    content.appendChild(clone);
    const initialFront = cardClone.querySelector<HTMLElement>(".quick-view-media");
    if (initialFront) {
      initialFront.scrollTop = 0;
      initialFront.classList.remove("poster-compact");
    }
    const initialBack = cardClone.querySelector<HTMLElement>(".quick-view-details");
    if (initialBack) {
      initialBack.scrollTop = 0;
      }

    // Inicializar interactividad básica
    updateCardUI(cardClone);
    updateNavButtons(modalId, contextCards);
    scheduleModalRAF(() => {
      adjustQuickViewNoteHeight(cardClone);
    });
  }
}
