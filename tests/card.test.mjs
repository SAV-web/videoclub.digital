import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";
import { createMockDomElement, setupGlobalDom } from "./helpers/mock-dom.mjs";
import { createMockIndexedDB } from "./helpers/mock-indexeddb.mjs";

// Mock de Image para Node.js
if (!globalThis.Image) {
  globalThis.Image = class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this._src = "";
      this.complete = true;
    }
    get src() { return this._src; }
    set src(v) {
      this._src = v;
      if (this.onload) setTimeout(() => this.onload?.(), 0);
    }
  };
}

// Mock de IndexedDB
const prevIDB = globalThis.indexedDB;
globalThis.indexedDB = createMockIndexedDB();

// Helper para búsqueda DOM recursiva en nuestros mocks
function attachQuerySelector(root) {
  function match(el, sel) {
    if (!el || !sel) return false;
    // Soporte para selector compuesto de clases (ej. .flip-card-inner.is-flipped)
    if (sel.startsWith(".")) {
      const classes = sel.split(".").filter(Boolean);
      return classes.every((cls) => Boolean(el.classList && el.classList.contains(cls)));
    }
    // Si contiene id
    if (sel.startsWith("#")) {
      return el.id === sel.slice(1);
    }
    // Selectores de atributo [k="v"]
    if (sel.startsWith("[data-template=\"")) {
      const val = sel.slice(16, -2);
      return el.getAttribute && el.getAttribute("data-template") === val;
    }
    if (sel.startsWith("[data-action=\"")) {
      const val = sel.slice(14, -2);
      return el.getAttribute && el.getAttribute("data-action") === val;
    }
    if (sel.startsWith("[data-action^=\"")) {
      const prefix = sel.slice(15, -2);
      const val = el.getAttribute && el.getAttribute("data-action");
      return Boolean(val && val.startsWith(prefix));
    }
    // Etiquetas
    if (el.tagName && el.tagName.toLowerCase() === sel.toLowerCase()) {
      return true;
    }
    return false;
  }

  function find(node, sel) {
    if (!node || !node.children) return null;
    for (const child of node.children) {
      if (match(child, sel)) return child;
      const sub = find(child, sel);
      if (sub) return sub;
    }
    return null;
  }

  function findAll(node, sel, acc = []) {
    if (!node || !node.children) return acc;
    for (const child of node.children) {
      if (match(child, sel)) acc.push(child);
      findAll(child, sel, acc);
    }
    return acc;
  }

  root.querySelector = (sel) => {
    if (!sel) return null;
    if (match(root, sel)) return root;
    if (sel.includes(":not")) {
      const baseSel = sel.split(":")[0];
      const res = findAll(root, baseSel);
      return res[0] || null;
    }
    return find(root, sel);
  };

  root.querySelectorAll = (sel) => findAll(root, sel, []);
  return root;
}

// Implementación fiel de DocumentFragment con desempaquetado W3C
function createDocumentFragmentMock() {
  const frag = createMockDomElement("fragment");
  frag.isDocumentFragment = true;

  const origAppend = frag.appendChild;
  frag.appendChild = (child) => {
    if (child && child.isDocumentFragment) {
      const toMove = [...child.children];
      child.children.length = 0;
      toMove.forEach((c) => frag.appendChild(c));
      return child;
    }
    return origAppend(child);
  };

  attachQuerySelector(frag);
  return frag;
}

// Helper para construir la plantilla completa de movie-card
function buildCardTemplateElement() {
  const tpl = createMockDomElement("template", { id: "movie-card-template" });

  tpl.content = {
    cloneNode: () => {
      const fragment = createDocumentFragmentMock();
      const card = createMockDomElement("article", { className: "movie-card" });
      const inner = createMockDomElement("div", { className: "flip-card-inner" });

      // Frontal
      const front = createMockDomElement("div", { className: "movie-summary" });
      const img = createMockDomElement("img");
      const titleEl = createMockDomElement("h2", { className: "movie-title" });
      titleEl.setAttribute("data-template", "title");
      const dirEl = createMockDomElement("div");
      dirEl.setAttribute("data-template", "director");
      const yearEl = createMockDomElement("span");
      yearEl.setAttribute("data-template", "year");

      front.appendChild(img);
      front.appendChild(titleEl);
      front.appendChild(dirEl);
      front.appendChild(yearEl);

      // Trasera
      const back = createMockDomElement("div", { className: "flip-card-back" });
      const durationEl = createMockDomElement("span", { className: "detail-duration" });
      durationEl.setAttribute("data-template", "duration");
      const epEl = createMockDomElement("span");
      epEl.setAttribute("data-template", "episodes");
      const jwLink = createMockDomElement("a");
      jwLink.setAttribute("data-template", "justwatch-link");
      const wikiLink = createMockDomElement("a");
      wikiLink.setAttribute("data-template", "wikipedia-link");
      const genreEl = createMockDomElement("span");
      genreEl.setAttribute("data-template", "genre");
      const genreCont = createMockDomElement("div", { className: "detail-item" });
      genreCont.setAttribute("data-template", "genre-container");
      genreCont.appendChild(genreEl);

      const actorsEl = createMockDomElement("span");
      actorsEl.setAttribute("data-template", "actors");
      const actorsCont = createMockDomElement("div", { className: "detail-item" });
      actorsCont.setAttribute("data-template", "actors-container");
      actorsCont.appendChild(actorsEl);

      const synopsisEl = createMockDomElement("span");
      synopsisEl.setAttribute("data-template", "synopsis");

      const watchlistBtn = createMockDomElement("button");
      watchlistBtn.setAttribute("data-action", "toggle-watchlist");

      const ratingCont = createMockDomElement("div");
      ratingCont.setAttribute("data-action", "set-rating-estrellas");

      back.appendChild(durationEl);
      back.appendChild(epEl);
      back.appendChild(jwLink);
      back.appendChild(wikiLink);
      back.appendChild(genreCont);
      back.appendChild(actorsCont);
      back.appendChild(synopsisEl);
      back.appendChild(watchlistBtn);
      back.appendChild(ratingCont);

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);

      attachQuerySelector(front);
      attachQuerySelector(back);
      attachQuerySelector(inner);
      attachQuerySelector(card);
      fragment.appendChild(card);
      return fragment;
    }
  };

  return tpl;
}

// Helper para construir la plantilla de person-card (VIP)
function buildPersonTemplateElement() {
  const tpl = createMockDomElement("template", { id: "person-card-template" });

  tpl.content = {
    cloneNode: () => {
      const fragment = createDocumentFragmentMock();
      const card = createMockDomElement("article", { className: "person-card" });
      const inner = createMockDomElement("div", { className: "flip-card-inner" });

      const front = createMockDomElement("div", { className: "flip-card-front" });
      const img = createMockDomElement("img");
      front.appendChild(img);

      const back = createMockDomElement("div", { className: "flip-card-back" });
      const titleEl = createMockDomElement("h2");
      titleEl.setAttribute("data-template", "title");
      const bioEl = createMockDomElement("p");
      bioEl.setAttribute("data-template", "biography");
      const ageEl = createMockDomElement("span");
      ageEl.setAttribute("data-template", "age");
      const datesEl = createMockDomElement("span");
      datesEl.setAttribute("data-template", "dates");
      const birthplaceEl = createMockDomElement("span");
      birthplaceEl.setAttribute("data-template", "birthplace");
      const headlineEl = createMockDomElement("span");
      headlineEl.setAttribute("data-template", "bio-headline");

      back.appendChild(titleEl);
      back.appendChild(bioEl);
      back.appendChild(ageEl);
      back.appendChild(datesEl);
      back.appendChild(birthplaceEl);
      back.appendChild(headlineEl);

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);

      attachQuerySelector(front);
      attachQuerySelector(back);
      attachQuerySelector(inner);
      attachQuerySelector(card);
      fragment.appendChild(card);
      return fragment;
    }
  };

  return tpl;
}

// Helper para construir la plantilla de colección/estudio
function buildCollectionTemplateElement() {
  const tpl = createMockDomElement("template", { id: "collection-card-template" });

  tpl.content = {
    cloneNode: () => {
      const fragment = createDocumentFragmentMock();
      const card = createMockDomElement("article", { className: "collection-card" });
      const inner = createMockDomElement("div", { className: "flip-card-inner" });

      const front = createMockDomElement("div", { className: "flip-card-front" });
      const img = createMockDomElement("img");
      const countEl = createMockDomElement("span", { className: "collection-movie-count" });
      front.appendChild(img);
      front.appendChild(countEl);

      const back = createMockDomElement("div", { className: "flip-card-back" });
      const titleEl = createMockDomElement("h2");
      titleEl.setAttribute("data-template", "title");
      const subtitleEl = createMockDomElement("span");
      subtitleEl.setAttribute("data-template", "subtitle");
      back.appendChild(titleEl);
      back.appendChild(subtitleEl);

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);

      attachQuerySelector(front);
      attachQuerySelector(back);
      attachQuerySelector(inner);
      attachQuerySelector(card);
      fragment.appendChild(card);
      return fragment;
    }
  };

  return tpl;
}

// 1. Registro de elementos globales antes de levantar Vite SSR
const cardTemplate = buildCardTemplateElement();
const personTemplate = buildPersonTemplateElement();
const collectionTemplate = buildCollectionTemplateElement();

const domMap = {
  "#movie-card-template": cardTemplate,
  "movie-card-template": cardTemplate,
  "#person-card-template": personTemplate,
  "person-card-template": personTemplate,
  "#collection-card-template": collectionTemplate,
  "collection-card-template": collectionTemplate,
};

setupGlobalDom({
  fallbackCreate: true,
  elementMap: domMap,
});

attachQuerySelector(globalThis.document.body);

// Soporte nativo de fragmentos y queries en document
const origCreateDocumentFragment = globalThis.document.createDocumentFragment;
globalThis.document.createDocumentFragment = () => createDocumentFragmentMock();

const origQuerySelector = globalThis.document.querySelector;
globalThis.document.querySelector = (sel) => {
  if (domMap[sel]) return domMap[sel];
  if (sel && sel.startsWith("#") && domMap[sel.slice(1)]) return domMap[sel.slice(1)];
  const fromBody = globalThis.document.body.querySelector(sel);
  if (fromBody) return fromBody;
  return origQuerySelector ? origQuerySelector(sel) : null;
};

const origQuerySelectorAll = globalThis.document.querySelectorAll;
globalThis.document.querySelectorAll = (sel) => {
  return globalThis.document.body.querySelectorAll(sel);
};

// Datos mock de películas representativas
function createMockMovie(overrides = {}) {
  return {
    id: 101,
    title: "Origen (Inception)",
    originalTitle: "Inception",
    slug: "origen-inception-2010",
    year: 2010,
    minutes: 148,
    type: "movie",
    isSeries: false,
    posterUrl: "/posters/origen-inception-2010.avif",
    thumbhash_st: "data:image/webp;base64,mockthumb",
    genres: "Ciencia ficción, Acción, Intriga",
    parsedDirectors: ["Christopher Nolan"],
    parsedActors: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy", "Ken Watanabe"],
    synopsis: "Dom Cobb es un ladrón capaz de adentrarse en los sueños.",
    justwatch: "https://www.justwatch.com/es/pelicula/origen",
    wikipedia: "https://es.wikipedia.org/wiki/Inception",
    ...overrides,
  };
}

// Helper para crear un contenedor con soporte W3C de DocumentFragment
function createGridContainer(id = "movies-grid") {
  const container = createMockDomElement("main", { id });
  attachQuerySelector(container);

  const origAppendChild = container.appendChild;
  container.appendChild = (child) => {
    if (child && child.isDocumentFragment) {
      const childrenToMove = [...child.children];
      child.children.length = 0;
      childrenToMove.forEach((c) => origAppendChild(c));
      return child;
    }
    return origAppendChild(child);
  };

  container.replaceChildren = (...newChildren) => {
    container.textContent = "";
    container.children.length = 0;
    newChildren.forEach((c) => container.appendChild(c));
  };

  globalThis.document.body.appendChild(container);
  return container;
}

describe("Componente Card (src/js/components/card.ts) - Tests de Caracterización", () => {
  let viteEnv;
  let cardModule;
  let stateModule;
  let modalRendererModule;
  let modalEventsModule;
  let vipModule;

  before(async () => {
    viteEnv = await startViteSsrServer([
      "/src/js/state.ts",
      "/src/js/components/card/index.ts",
      "/src/js/components/modal/renderer.ts",
      "/src/js/components/modal/events.ts",
      "/src/js/vipPerson.ts",
    ]);
    [stateModule, cardModule, modalRendererModule, modalEventsModule, vipModule] = viteEnv.modules;
  });

  after(async () => {
    cardModule?.disposeCardEvents();
    if (viteEnv) await viteEnv.close();
    globalThis.document.querySelector = origQuerySelector;
    globalThis.document.querySelectorAll = origQuerySelectorAll;
    globalThis.document.createDocumentFragment = origCreateDocumentFragment;
    globalThis.indexedDB = prevIDB;
  });

  beforeEach(() => {
    stateModule.appEvents.clearAll();
    cardModule.disposeCardEvents();
    globalThis.document.body.classList.remove("user-logged-in");
  });

  test("renderMovieGrid: renderiza películas y puebla correctamente sus elementos frontales y traseros", async () => {
    const gridContainer = createGridContainer();

    const movie = createMockMovie();
    await cardModule.renderMovieGrid(gridContainer, [movie]);

    assert.equal(gridContainer.children.length, 1, "Debe insertar 1 tarjeta en el contenedor");
    const card = gridContainer.children[0];

    assert.equal(card.dataset.movieId, "101", "El dataset de la tarjeta debe guardar el id de la película");
    assert.equal(card.movieData?.title, "Origen (Inception)");

    // Verificar Frontal
    const titleEl = card.querySelector('[data-template="title"]');
    assert.ok(titleEl, "Debe existir titleEl");
    assert.equal(titleEl.textContent, "Origen (Inception)");

    const dirEl = card.querySelector('[data-template="director"]');
    assert.ok(dirEl, "Debe existir dirEl");
    assert.ok(dirEl.textContent.includes("Christopher Nolan"));

    // Verificar Trasera: Duración en formato horas/minutos, enlaces, géneros y actores
    const durationEl = card.querySelector('[data-template="duration"]');
    assert.ok(durationEl, "Debe existir durationEl");
    assert.equal(durationEl.textContent, "2 h 28 m");

    const jwLink = card.querySelector('[data-template="justwatch-link"]');
    assert.equal(jwLink?.href, "https://www.justwatch.com/es/pelicula/origen");
    assert.ok(!jwLink?.classList.contains("disabled"));

    const actorsEl = card.querySelector('[data-template="actors"]');
    assert.ok(actorsEl, "Debe existir actorsEl");
    assert.ok(actorsEl.textContent.includes("Leonardo DiCaprio"));
    assert.ok(actorsEl.textContent.endsWith("..."));

    gridContainer.remove();
  });

  test("renderMovieGrid: inyecta la tarjeta VIP #0 cuando se proporciona vipData de persona", async () => {
    const gridContainer = createGridContainer();

    const vipData = {
      type: "person",
      data: {
        id: 233,
        name: "Clyde Geronimi",
        slug: "clyde-geronimi",
        vip: 1,
        birthday: null,
        deathday: "1989-04-24",
        place_of_birth: "Chiavenna, Italia",
        biography: "Director clave de la animación clásica en Disney.",
        titulo_bio: "Director de animación",
        thumbhash_st: "data:image/webp;base64,mockthumbvip",
      },
    };

    const movies = [createMockMovie({ id: 201, title: "Peter Pan" })];
    await cardModule.renderMovieGrid(gridContainer, movies, vipData);

    assert.equal(gridContainer.children.length, 2, "Debe contener tarjeta VIP en #0 y tarjeta de película en #1");
    const personCard = gridContainer.children[0];
    const movieCard = gridContainer.children[1];

    assert.ok(personCard.classList.contains("person-card"), "La tarjeta #0 debe ser de tipo person-card");
    assert.equal(personCard.dataset.movieId, "person-233");
    assert.equal(personCard.style["--card-index"], "0");

    assert.ok(movieCard.classList.contains("movie-card"), "La tarjeta #1 debe ser la película ordinaria");
    assert.equal(movieCard.dataset.movieId, "201");
    assert.equal(movieCard.style["--card-index"], "1");

    gridContainer.remove();
  });

  test("populateCard: formatea series con episodios y directores múltiples con solo apellidos", async () => {
    const gridContainer = createGridContainer();

    const seriesMovie = createMockMovie({
      id: 301,
      title: "Fringe (Al límite)",
      type: "series",
      isSeries: true,
      minutes: 46,
      episodes: 100,
      parsedDirectors: ["J.J. Abrams", "Alex Kurtzman", "Roberto Orci"],
      wikipedia: null, // Sin enlace Wikipedia
    });

    await cardModule.renderMovieGrid(gridContainer, [seriesMovie]);
    const card = gridContainer.children[0];

    // Episodios en reverso
    const epEl = card.querySelector('[data-template="episodes"]');
    assert.ok(epEl, "Debe existir epEl");
    assert.equal(epEl.textContent, "100 x");
    assert.equal(epEl.hidden, false);

    // Wikipedia deshabilitado
    const wikiLink = card.querySelector('[data-template="wikipedia-link"]');
    assert.ok(wikiLink?.classList.contains("disabled"));

    // Directores múltiples (> 2): usa solo apellido
    const dirEl = card.querySelector('[data-template="director"]');
    assert.ok(dirEl.textContent.includes("Abrams"));
    assert.ok(dirEl.textContent.includes("Kurtzman"));
    assert.ok(dirEl.textContent.includes("Orci"));

    gridContainer.remove();
  });

  test("populateCard: formatea año con espacio al lado del año para miniseries (M)", async () => {
    const gridContainer = createGridContainer();

    const miniMovie = createMockMovie({
      id: 302,
      title: "Chernobyl",
      year: 2019,
      displayYear: "2019\u00A0(M)",
      type: "SM",
      isSeries: true,
    });

    await cardModule.renderMovieGrid(gridContainer, [miniMovie]);
    const card = gridContainer.children[0];

    const yearEl = card.querySelector('[data-template="year"]');
    assert.ok(yearEl, "Debe existir yearEl");
    assert.equal(yearEl.textContent, "2019\u00A0(M)", "Debe incluir espacio no divisible entre año y (M)");

    gridContainer.remove();
  });

  test("toggleWatchlist: actualiza de forma optimista la clase .is-active y el estado de usuario cuando el usuario está autenticado", async () => {
    globalThis.document.body.classList.add("user-logged-in");
    const gridContainer = createGridContainer();

    const movie = createMockMovie({ id: 555 });
    await cardModule.renderMovieGrid(gridContainer, [movie]);
    const card = gridContainer.children[0];

    const watchlistBtn = card.querySelector('[data-action="toggle-watchlist"]');
    assert.ok(watchlistBtn, "Debe existir el botón de watchlist");
    assert.ok(!watchlistBtn.classList.contains("is-active"), "Inicialmente no debe estar en watchlist");

    let eventFired = false;
    const unsub = stateModule.appEvents.on("userMovieDataChanged", (payload) => {
      if (payload.movieId === 555) {
        eventFired = true;
      }
    });

    // 1. Activar Watchlist
    await cardModule.toggleWatchlist(555, watchlistBtn, card);
    assert.ok(watchlistBtn.classList.contains("is-active"), "El botón debe ganar la clase is-active");
    assert.equal(watchlistBtn.getAttribute("aria-label"), "Quitar de lista");
    assert.ok(eventFired, "Debe emitir el evento user_data_updated con onWatchlist: true");

    // Verificar persistencia en estado en memoria
    const userData = stateModule.getUserDataForMovie(555);
    assert.equal(userData?.onWatchlist, true);

    // 2. Desactivar Watchlist
    await cardModule.toggleWatchlist(555, watchlistBtn, card);
    assert.ok(!watchlistBtn.classList.contains("is-active"), "El botón debe perder la clase is-active");
    assert.equal(watchlistBtn.getAttribute("aria-label"), "Añadir a lista");

    const updatedUserData = stateModule.getUserDataForMovie(555);
    assert.equal(updatedUserData?.onWatchlist, false);

    unsub();
    gridContainer.remove();
  });

  test("handleCardClick y unflipAllCards: ignora clics en enlaces y unflipAllCards des-voltea", async () => {
    const gridContainer = createGridContainer();

    const movie = createMockMovie({ id: 777 });
    await cardModule.renderMovieGrid(gridContainer, [movie]);
    const card = gridContainer.children[0];
    const inner = card.querySelector(".flip-card-inner");

    assert.ok(inner, "Debe existir flip-card-inner");

    // 1. Simular estado volteado
    inner.classList.add("is-flipped");
    assert.ok(inner.classList.contains("is-flipped"));

    // 2. Clic en un enlace interactivo dentro de la tarjeta: no altera el estado
    const link = createMockDomElement("a");
    link.setAttribute("href", "https://ejemplo.com");
    card.appendChild(link);

    cardModule.handleCardClick.call(card, { target: link, defaultPrevented: false });
    assert.ok(inner.classList.contains("is-flipped"), "El clic en enlace no debe des-voltear");

    // 3. unflipAllCards des-voltea todas las tarjetas activas en el DOM
    cardModule.unflipAllCards();
    assert.ok(!inner.classList.contains("is-flipped"), "unflipAllCards debe retirar is-flipped");

    gridContainer.remove();
  });

  test("renderNoResults y renderErrorState: renderizan los estados vacíos y de error con los roles de accesibilidad adecuados", () => {
    const container = createMockDomElement("div", { id: "results-container" });
    const pagContainer = createMockDomElement("div", { id: "pagination-container" });

    // 1. Estado Sin Resultados
    cardModule.renderNoResults(container, pagContainer, { myList: "watchlist" });
    assert.equal(container.children.length, 1);
    const alertBox = container.children[0];
    assert.equal(alertBox.getAttribute("role"), "status");
    assert.ok(alertBox.textContent.includes("Aún no tienes obras en tu lista de pendientes"));

    // 2. Estado de Error
    cardModule.renderErrorState(container, pagContainer, "Error al conectar con el catálogo");
    assert.equal(container.children.length, 1);
    const errorBox = container.children[0];
    assert.equal(errorBox.getAttribute("role"), "alert");
    assert.ok(errorBox.textContent.includes("¡Vaya! Algo ha ido mal"));
    assert.ok(errorBox.textContent.includes("Error al conectar con el catálogo"));
  });

  test("runFlipOnboarding: gestiona contador de 10 ejecuciones y respeta persistencia en localStorage", () => {
    const store = new Map();
    const prevStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };

    try {
      cardModule.resetFlipOnboardingCount();
      assert.equal(cardModule.getFlipOnboardingCount(), 0);

      // Simular que ya ha alcanzado el límite de 10 ejecuciones
      globalThis.localStorage.setItem("videoclub:flip_onboarding_count", "10");
      assert.equal(cardModule.getFlipOnboardingCount(), 10);

      // runFlipOnboarding debe ser un no-op inmediato sin programar nada
      const container = createMockDomElement("div");
      cardModule.runFlipOnboarding(container);
      assert.equal(container.children.length, 0);

      // Resetear contador y verificar que vuelve a 0
      cardModule.resetFlipOnboardingCount();
      assert.equal(cardModule.getFlipOnboardingCount(), 0);
    } finally {
      globalThis.localStorage = prevStorage;
    }
  });

  test("revertAction: ciclo de vida de deshacer/revertir al votar o alternar lista", async () => {
    const {
      registerRevertSnapshot,
      clearActiveRevertAction,
      executeRevertAction,
      isMovieRevertActive,
      getActiveRevertSnapshot
    } = cardModule;

    // 1. Estado inicial vacío
    clearActiveRevertAction();
    assert.equal(getActiveRevertSnapshot(), null);
    assert.equal(isMovieRevertActive(42), false);

    // 2. Registrar snapshot de película 42 y mutar su estado
    const initial42 = { rating: 5, onWatchlist: true, note: "Gran peli" };
    stateModule.updateUserDataForMovie(42, initial42);
    registerRevertSnapshot(42, initial42, { id: 42, title: "Alien" });
    
    // Al mutar la película (ej. nueva nota 8 y sacarla de watchlist)
    stateModule.updateUserDataForMovie(42, { rating: 8, onWatchlist: false });
    assert.equal(isMovieRevertActive(42), true);
    assert.equal(isMovieRevertActive(99), false);
    assert.equal(getActiveRevertSnapshot().rating, 5);

    // 3. Mutaciones sucesivas en la misma película no deben sobrescribir el snapshot prístino
    registerRevertSnapshot(42, { rating: 8, onWatchlist: false }, { id: 42, title: "Alien" });
    assert.equal(getActiveRevertSnapshot().rating, 5); // Mantiene el original antes del primer cambio

    // 4. Si el usuario vuelve a poner la misma nota y watchlist, el icono de revertir no es necesario
    stateModule.updateUserDataForMovie(42, initial42);
    assert.equal(isMovieRevertActive(42), false);
    cardModule.showRevertButtonForMovie(42);
    assert.equal(getActiveRevertSnapshot(), null); // Se limpia automáticamente

    // 5. Votar otra película (ej. 99) transfiere el snapshot a la nueva película
    stateModule.updateUserDataForMovie(99, { rating: 4, onWatchlist: false });
    registerRevertSnapshot(99, { rating: null, onWatchlist: false }, { id: 99, title: "Blade Runner" });
    assert.equal(isMovieRevertActive(42), false);
    assert.equal(isMovieRevertActive(99), true);
    assert.equal(getActiveRevertSnapshot().movieId, 99);

    // 6. Al limpiar acción (ej. cambio de filtros), el snapshot se anula
    clearActiveRevertAction();
    assert.equal(getActiveRevertSnapshot(), null);
    assert.equal(isMovieRevertActive(99), false);

    // 7. Ejecutar reversión restaura el estado y limpia el snapshot
    stateModule.updateUserDataForMovie(101, { rating: 3, onWatchlist: false });
    registerRevertSnapshot(101, { rating: 10, onWatchlist: false }, { id: 101, title: "Vertigo" });
    assert.equal(isMovieRevertActive(101), true);
    let restored = false;
    await executeRevertAction(101, undefined, () => { restored = true; });
    assert.equal(getActiveRevertSnapshot(), null);
    assert.equal(isMovieRevertActive(101), false);
  });

  test("Modal Reparto: toggle '+' -> '-' entre Reparto y primer actor y upgrade en vivo", async () => {
    await vipModule.loadVipSlugs();
    stateModule.resetFiltersState();

    const walkNodes = (node, predicate, acc = []) => {
      if (!node || !node.children) return acc;
      for (const ch of node.children) {
        if (predicate(ch)) acc.push(ch);
        walkNodes(ch, predicate, acc);
      }
      return acc;
    };
    const enhanceModalQueries = (root) => {
      const nodes = [root, ...walkNodes(root, () => true)];
      nodes.forEach((n) => {
        attachQuerySelector(n);
        const origQSA = n.querySelectorAll;
        n.querySelectorAll = (sel) => {
          if (sel === "[data-template]") {
            return walkNodes(n, (el) => Boolean(el.dataset?.template || el.getAttribute?.("data-template")));
          }
          if (sel === "[data-director-name], [data-actor-name]") {
            return walkNodes(n, (el) => Boolean(el.dataset && (el.dataset.directorName || el.dataset.actorName)));
          }
          return origQSA ? origQSA(sel) : [];
        };
        const origClosest = n.closest;
        n.closest = (sel) => {
          if (sel && sel.startsWith('[data-template="')) {
            const val = sel.slice(16, -2);
            let curr = n;
            while (curr) {
              if (curr.dataset?.template === val || curr.getAttribute?.("data-template") === val) return curr;
              curr = curr.parentElement;
            }
            return null;
          }
          return origClosest ? origClosest(sel) : null;
        };
      });
    };

    function buildQuickViewTemplate() {
      const tpl = createMockDomElement("template", { id: "quick-view-template" });
      tpl.content = {
        cloneNode: () => {
          const frag = createDocumentFragmentMock();
          const card = attachQuerySelector(createMockDomElement("article", { className: "movie-card" }));
          const img = createMockDomElement("img");
          const dirEl = createMockDomElement("div", { className: "front-director-info", dataset: { template: "director" } });
          dirEl.setAttribute("data-template", "director");

          const genreCont = createMockDomElement("div", { className: "detail-item", dataset: { template: "genre-container" } });
          genreCont.setAttribute("data-template", "genre-container");
          const genreLabel = createMockDomElement("strong", { className: "detail-label-title", textContent: "Género." });
          const genreEl = createMockDomElement("span", { className: "detail-data", dataset: { template: "genre" } });
          genreEl.setAttribute("data-template", "genre");
          genreCont.appendChild(genreLabel);
          genreCont.appendChild(genreEl);

          const actorsCont = createMockDomElement("div", { className: "detail-item", dataset: { template: "actors-container" } });
          actorsCont.setAttribute("data-template", "actors-container");
          actorsCont.insertBefore = (newChild, refChild) => {
            const idx = actorsCont.children.indexOf(refChild);
            if (idx === -1) return actorsCont.appendChild(newChild);
            newChild.parentElement = actorsCont;
            actorsCont.children.splice(idx, 0, newChild);
            return newChild;
          };
          const actorsLabel = createMockDomElement("strong", { className: "detail-label-title", textContent: "Reparto." });
          const actorsEl = createMockDomElement("span", { className: "detail-data", dataset: { template: "actors" } });
          actorsEl.setAttribute("data-template", "actors");
          const origActorsAppend = actorsEl.appendChild;
          actorsEl.appendChild = (child) => {
            if (child && child.isDocumentFragment) {
              const items = [...child.children];
              child.children.length = 0;
              items.forEach((c) => actorsEl.appendChild(c));
              return child;
            }
            return origActorsAppend(child);
          };
          actorsEl.append = (...items) => {
            items.forEach((it) => actorsEl.appendChild(typeof it === "string" ? { textContent: it, nodeType: 3 } : it));
          };
          actorsCont.appendChild(actorsLabel);
          actorsCont.appendChild(actorsEl);

          const synopsisEl = createMockDomElement("span", { dataset: { template: "synopsis" } });
          synopsisEl.setAttribute("data-template", "synopsis");

          card.appendChild(img);
          card.appendChild(dirEl);
          card.appendChild(genreCont);
          card.appendChild(actorsCont);
          card.appendChild(synopsisEl);
          enhanceModalQueries(card);
          frag.appendChild(card);
          return frag;
        }
      };
      return tpl;
    }

    const modal = attachQuerySelector(createMockDomElement("div", { id: "movie-modal" }));
    const content = attachQuerySelector(createMockDomElement("div", { id: "modal-content" }));
    content.appendChild = (child) => {
      if (child && child.isDocumentFragment) {
        const items = [...child.children];
        child.children.length = 0;
        items.forEach((c) => content.appendChild(c));
        return child;
      }
      child.parentElement = content;
      content.children.push(child);
      return child;
    };
    const quickTpl = buildQuickViewTemplate();

    const sourceCard = attachQuerySelector(createMockDomElement("div", { className: "movie-card" }));
    sourceCard.movieData = createMockMovie({
      id: 777,
      title: "Pulp Fiction",
      genres: "Crimen, Thriller",
      parsedDirectors: ["Quentin Tarantino"],
      parsedActors: ["John Travolta", "Samuel L. Jackson", "Uma Thurman"],
    });

    // 1. Sin VIP activo: no debe existir botón toggle '+' junto a Reparto
    modalRendererModule.populateModalContent({
      cardElement: sourceCard,
      contextCards: null,
      template: quickTpl.content,
      content,
      modal,
      scheduleModalRAF: (fn) => { fn(); return 1; },
      getLifecycleGen: () => 1,
      updateNavButtons: () => {},
    });
    enhanceModalQueries(content);
    const actorsContIdle = content.querySelector('[data-template="actors-container"]');
    assert.equal(actorsContIdle.querySelector(".modal-cast-combine-toggle"), null, "Sin VIP activo no debe renderizar toggle '+'");

    // 2. Con VIP activo (1 actor VIP): upgradeModalPersonCombineButtons inserta toggle '+' antes de actors
    stateModule.setFilter("actor", "John Travolta");
    modalRendererModule.upgradeModalPersonCombineButtons(content);

    const toggleBtn = actorsContIdle.querySelector(".modal-cast-combine-toggle");
    enhanceModalQueries(actorsContIdle);
    assert.ok(toggleBtn, "Debe crear el toggle '+' entre 'Reparto.' y el primer actor");
    assert.equal(toggleBtn.textContent, "+");
    assert.equal(toggleBtn.getAttribute("aria-expanded"), "false");
    const actorsIdx = actorsContIdle.children.findIndex((c) => c.getAttribute?.("data-template") === "actors");
    const toggleIdx = actorsContIdle.children.indexOf(toggleBtn);
    assert.equal(toggleIdx, actorsIdx - 1, "El botón toggle '+' debe ir inmediatamente entre 'Reparto.' y [data-template='actors']");
    assert.equal(actorsContIdle.classList.contains("is-cast-combine-expanded"), false);

    // 3. Click en '+' cambia a '-' y expande clase .is-cast-combine-expanded; segundo click vuelve a '+'
    const eventsBinding = modalEventsModule.bindModalEvents({
      getDom: () => ({ modal, content, prevBtn: null, nextBtn: null }),
      navigateToSibling: () => {},
      closeModal: () => {},
      resetModalTransform: () => {},
    });

    try {
      content.dispatchEvent({ type: "click", target: toggleBtn });
      assert.equal(actorsContIdle.classList.contains("is-cast-combine-expanded"), true);
      assert.equal(toggleBtn.textContent, "-");
      assert.equal(toggleBtn.getAttribute("aria-expanded"), "true");

      content.dispatchEvent({ type: "click", target: toggleBtn });
      assert.equal(actorsContIdle.classList.contains("is-cast-combine-expanded"), false);
      assert.equal(toggleBtn.textContent, "+");
      assert.equal(toggleBtn.getAttribute("aria-expanded"), "false");

      // 4. Al abrir una modal ya con 1 VIP activo, el toggle '+' se inserta de inmediato
      modalRendererModule.populateModalContent({
        cardElement: sourceCard,
        contextCards: null,
        template: quickTpl.content,
        content,
        modal,
        scheduleModalRAF: (fn) => { fn(); return 1; },
        getLifecycleGen: () => 2,
        updateNavButtons: () => {},
      });
      enhanceModalQueries(content);
      const actorsContDirect = content.querySelector('[data-template="actors-container"]');
      const directToggle = actorsContDirect.querySelector(".modal-cast-combine-toggle");
      assert.ok(directToggle, "Al abrir con VIP activo debe crear el toggle '+' directamente");
      assert.equal(directToggle.textContent, "+");
    } finally {
      eventsBinding.unbind();
      stateModule.resetFiltersState();
    }
  });

  test("renderMovieGrid con dual-person: primera ficha con collage diagonal de ambos VIP y sin texto al pie", async () => {
    const gridContainer = createGridContainer("dual-vip-grid");
    const martin = {
      id: 10,
      name: "Martin Scorsese",
      slug: "martin-scorsese",
      vip: 1,
      thumbhash_st: "data:image/webp;base64,martin",
    };
    const cage = {
      id: 20,
      name: "Nicolas Cage",
      slug: "nicolas-cage",
      vip: 1,
      thumbhash_st: "data:image/webp;base64,cage",
    };
    const movie = createMockMovie({ id: 555, title: "Bringing Out the Dead" });

    await cardModule.renderMovieGrid(gridContainer, [movie], {
      type: "dual-person",
      data: [martin, cage],
    });

    assert.equal(gridContainer.children.length, 2, "Debe insertar ficha dual + película");
    const dualCard = gridContainer.children[0];
    attachQuerySelector(dualCard);

    assert.ok(dualCard.classList.contains("dual-vip-card"), "Debe tener clase .dual-vip-card");
    assert.ok(dualCard.classList.contains("person-card"), "Debe heredar clase .person-card");
    assert.ok(dualCard.classList.contains("collection-card"), "Debe heredar .collection-card");
    assert.ok(dualCard.classList.contains("no-bio"), "Debe incluir .no-bio");
    assert.equal(dualCard.textContent, "", "La ficha dual no debe renderizar texto visible en el pie");
    assert.equal(dualCard.querySelector(".movie-summary"), null, "No debe renderizar .movie-summary");

    const primarySlot = dualCard.querySelector(".dual-vip-portrait--primary");
    const secondarySlot = dualCard.querySelector(".dual-vip-portrait--secondary");
    assert.ok(primarySlot, "Debe existir hueco superior izquierdo (--primary)");
    assert.ok(secondarySlot, "Debe existir hueco inferior derecho (--secondary)");

    attachQuerySelector(primarySlot);
    attachQuerySelector(secondarySlot);
    const primaryImg = primarySlot.querySelector("img");
    const secondaryImg = secondarySlot.querySelector("img");
    assert.ok(primaryImg, "Debe existir img primaria");
    assert.ok(secondaryImg, "Debe existir img secundaria");
    assert.equal(primaryImg.alt, "Foto de Martin Scorsese");
    assert.equal(secondaryImg.alt, "Foto de Nicolas Cage");
    assert.ok(String(primaryImg.style.backgroundImage).includes("martin"));
    assert.ok(String(secondaryImg.style.backgroundImage).includes("cage"));
  });
});
