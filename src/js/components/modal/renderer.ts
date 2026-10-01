import { createElement, renderCountryFlag, computePersonAgeInfo, applyLengthBasedClass, buildFilterUrl, formatModalDuration, sanitizeExternalUrl } from "../../utils.js";
import { preserveHyphenatedWords } from "../../../shared/formatters.js";
import { STUDIO_DATA, IGNORED_ACTORS, CSS_CLASSES } from "../../constants.js";
import { updateCardUI, initializeCard } from "../card/index.js";
import { setupCardRatings, setupRatingListeners } from "../rating.js";
import { fetchUserMovieDataForIds } from "../../api.js";
import { updateUserDataForMovie } from "../../state.js";
import type { Movie, MappedMovie, MovieCardElement } from "../../types.js";

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

export interface ModalNodes {
  [key: string]: HTMLElement | null | undefined;
  img?: HTMLImageElement | null;
  iconsContainer?: HTMLElement | null;
  origTitleWrap?: HTMLElement | null;
}

export const createLink = (text: string, type: 'director' | 'actor' | 'genre'): HTMLAnchorElement => {
  const dataAttr = type === 'director' ? 'directorName' : (type === 'actor' ? 'actorName' : 'genreName');
  return createElement("a", {
    textContent: preserveHyphenatedWords(text),
    href: buildFilterUrl(type, text),
    dataset: { [dataAttr]: text }
  }) as HTMLAnchorElement;
};

/**
 * Mapea los nodos del modal mediante sus contratos de datos (data-template).
 */
export function getModalNodes(root: HTMLElement): ModalNodes {
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
export function setupModalHeader(
  nodes: ModalNodes,
  movie: ExtendedMovie,
  scheduleModalRAF?: (fn: () => void) => number,
  getLifecycleGen?: () => number
): void {
  // Imagen (Efecto LQIP suave)
  if (nodes.img) {
    const posterUrl = movie.image_hq || movie.posterUrl;
    nodes.img.alt = `Póster de ${movie.title}`;

    if (movie.thumbhash_st && posterUrl) {
      // Si la imagen ya está en memoria caché del navegador, mostrar directamente en alta resolución
      const tempImg = new Image();
      tempImg.src = posterUrl;

      if (tempImg.complete && tempImg.naturalWidth > 0) {
        nodes.img.src = posterUrl;
        nodes.img.classList.remove(CSS_CLASSES.LAZY_LQIP);
        nodes.img.classList.add(CSS_CLASSES.LOADED);
      } else {
        nodes.img.classList.remove(CSS_CLASSES.LOADED);
        nodes.img.classList.add(CSS_CLASSES.LAZY_LQIP);
        nodes.img.src = movie.thumbhash_st;

        const currentGen = getLifecycleGen ? getLifecycleGen() : 0;
        tempImg.onload = () => {
          if (getLifecycleGen && currentGen !== getLifecycleGen()) return;
          if (nodes.img) {
            nodes.img.src = posterUrl;
            const applyLoaded = () => {
              if (getLifecycleGen && currentGen !== getLifecycleGen()) return;
              nodes.img?.classList.add(CSS_CLASSES.LOADED);
            };
            if (scheduleModalRAF) {
              scheduleModalRAF(applyLoaded);
            } else {
              requestAnimationFrame(applyLoaded);
            }
          }
        };
        tempImg.onerror = () => {
          if (getLifecycleGen && currentGen !== getLifecycleGen()) return;
          if (nodes.img) {
            nodes.img.src = posterUrl;
            nodes.img.classList.add(CSS_CLASSES.LOADED);
          }
        };
      }
    } else {
      nodes.img.src = posterUrl || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
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
      const yearStr = String(movie.year);
      const formattedYear = yearStr.length === 4
        ? `${yearStr.slice(0, 1)}.${yearStr.slice(1)}`
        : yearStr;
      const yearLink = createElement("a", {
        textContent: formattedYear,
        href: buildFilterUrl("year", yearStr),
        className: "year-link",
        dataset: { yearValue: yearStr }
      });
      nodes.year.appendChild(yearLink);
      if (movie.displayYear && movie.displayYear.length > yearStr.length) {
        const rawSuffix = movie.displayYear.substring(yearStr.length);
        const formattedSuffix = rawSuffix.replace(/\b(\d{4})\b/g, (m) => `${m.slice(0, 1)}.${m.slice(1)}`);
        nodes.year.appendChild(document.createTextNode(formattedSuffix));
      }
    } else if (movie.displayYear) {
      nodes.year.textContent = movie.displayYear.replace(/\b(\d{4})\b/g, (m) => `${m.slice(0, 1)}.${m.slice(1)}`);
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
        use.setAttribute("href", `#${conf.id}`);
        svg.appendChild(use); span.appendChild(svg);
        nodes.iconsContainer?.appendChild(span);
      }
    });
  }
}

/**
 * Renderiza unidades y palabras de metadatos en spans con clase .meta-unit para
 * permitir una modulación tipográfica más ligera (-20% font-weight) respecto a las cifras numéricas.
 */
export function renderModalMetaUnits(container: HTMLElement, text: string): void {
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
export function setupModalDetails(nodes: ModalNodes, movie: ExtendedMovie): void {
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
  const setupLink = (key: string, rawUrl: string | null | undefined) => {
    const el = nodes[`${key}-link`] as HTMLAnchorElement | null | undefined;
    if (!el) return;
    const safeUrl = sanitizeExternalUrl(rawUrl);
    if (safeUrl) {
      el.href = safeUrl; el.classList.remove('disabled'); el.setAttribute("aria-label", `Ver en ${key}`);
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

export interface PopulateModalOptions {
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
    // Foto de perfil
    const img = cardClone.querySelector("img");
    if (img && posterUrl) {
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

      img.src = posterUrl;
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
      countryName,
      false
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

    // Botón de alternancia de rol (Director <-> Actor)
    const roleToggleBtn = cardClone.querySelector<HTMLButtonElement>('[data-template="role-toggle-btn"]');
    const roleLetterEl = cardClone.querySelector<HTMLElement>('[data-template="role-badge-letter"]');

    if (roleToggleBtn && roleLetterEl) {
      if (movie.hasBothRoles) {
        const isDirector = movie.currentRole === "director";
        const targetRole = isDirector ? "actor" : "director";
        const currentLetter = isDirector ? "D" : "A";
        const tooltipText = isDirector
          ? `Ver películas de ${movie.name} como Actor`
          : `Ver películas de ${movie.name} como Director`;

        roleLetterEl.textContent = currentLetter;
        roleToggleBtn.title = tooltipText;
        roleToggleBtn.setAttribute("aria-label", tooltipText);
        roleToggleBtn.style.display = "flex";
        roleToggleBtn.dataset.targetRole = targetRole;
        roleToggleBtn.dataset.personName = movie.name;
      } else {
        roleToggleBtn.style.display = "none";
      }
    }

    // Montaje
    content.textContent = "";
    content.appendChild(clone);
    const personFront = cardClone.querySelector<HTMLElement>(".quick-view-media");
    if (personFront) {
      personFront.scrollTop = 0;
      personFront.classList.remove("is-scrolled");
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
    content.classList.remove("is-scrolled");
    content.appendChild(clone);
    const initialFront = cardClone.querySelector<HTMLElement>(".quick-view-media");
    if (initialFront) {
      initialFront.scrollTop = 0;
      initialFront.classList.remove("is-scrolled");
      initialFront.classList.remove("poster-compact");
    }
    const initialBack = cardClone.querySelector<HTMLElement>(".quick-view-details");
    if (initialBack) {
      initialBack.scrollTop = 0;
      initialBack.classList.remove("is-scrolled");
    }

    // Inicializar interactividad básica
    updateCardUI(cardClone);
    initializeCard(cardClone);
    const starCont = cardClone.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starCont) {
      setupRatingListeners(starCont, true);
    }
    updateNavButtons(modalId, contextCards);

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
  }
}
