import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";
import { createMockDomElement, setupGlobalDom } from "./helpers/mock-dom.mjs";

// 1. Configuración del DOM simulado ANTES de cargar los módulos en Vite SSR
const domMap = {};

const mainSearchInput = createMockDomElement("input", { id: "search-input", value: "" });
domMap["search-input"] = mainSearchInput;
domMap["#search-input"] = mainSearchInput;

const sidebarScrollable = createMockDomElement("div", {
  className: "sidebar-scrollable-filters",
});
domMap[".sidebar-scrollable-filters"] = sidebarScrollable;

const sidebar = createMockDomElement("div", { id: "sidebar" });
domMap["sidebar"] = sidebar;

const sidebarOverlay = createMockDomElement("div", { id: "sidebar-overlay" });
domMap["sidebar-overlay"] = sidebarOverlay;

const mobileSidebarToggle = createMockDomElement("button", { id: "mobile-sidebar-toggle" });
domMap["mobile-sidebar-toggle"] = mobileSidebarToggle;

const myListButton = createMockDomElement("button", { id: "my-list-button" });
domMap["my-list-button"] = myListButton;

const gridContainer = createMockDomElement("div", { id: "grid-container" });
domMap["grid-container"] = gridContainer;
domMap["#grid-container"] = gridContainer;

// Secciones de filtros con contenedores de píldoras
const sectionTypes = ["genre", "country", "selection", "studio", "actor", "director"];
const pillContainers = {};
const listContainers = {};

sectionTypes.forEach((type) => {
  const contentId = type === "country" ? "countries-content" : `${type}s-content`;
  const listContainer = createMockDomElement("div", { id: `${contentId}-list` });
  const pillsContainer = createMockDomElement("div", { className: "active-filters-list" });

  const collapsible = createMockDomElement("div", { className: "collapsible-section" });
  collapsible.appendChild(pillsContainer);
  collapsible.appendChild(listContainer);
  listContainer.parentElement = collapsible;

  collapsible.querySelector = (sel) => {
    if (sel === ".active-filters-list") return pillsContainer;
    return null;
  };

  domMap[`#${contentId} > div:first-child`] = listContainer;
  domMap[`${contentId} > div:first-child`] = listContainer;
  pillContainers[type] = pillsContainer;
  listContainers[type] = listContainer;
});

const { teardown: domTeardown } = setupGlobalDom({
  fallbackCreate: true,
  elementMap: domMap,
});

const origQuerySelector = globalThis.document.querySelector;
globalThis.document.querySelector = (sel) => {
  if (domMap[sel]) return domMap[sel];
  if (sel && sel.startsWith("#") && domMap[sel.slice(1)]) return domMap[sel.slice(1)];
  return origQuerySelector ? origQuerySelector(sel) : null;
};

describe("Componente Sidebar (src/js/components/sidebar.ts) - Tests de Caracterización", () => {
  let viteEnv;
  let stateModule;
  let sidebarModule;
  let mainModule;
  let apiModule;

  before(async () => {
    viteEnv = await startViteSsrServer([
      "/src/js/state.ts",
      "/src/js/components/sidebar/index.ts",
      "/src/js/main.ts",
      "/src/js/api.ts",
    ]);
    [stateModule, sidebarModule, mainModule, apiModule] = viteEnv.modules;
  });

  after(async () => {
    sidebarModule?.disposeSidebarEvents();
    mainModule?.disposeMainEvents();
    if (viteEnv) await viteEnv.close();
    globalThis.document.querySelector = origQuerySelector;
    // domTeardown();
  });

  beforeEach(() => {
    stateModule.appEvents.clearAll();
    stateModule.resetFiltersState();
    sidebarModule.disposeSidebarEvents();
    mainSearchInput.value = "";
    if (globalThis.document?.body?.classList) {
      globalThis.document.body.classList.remove("modal-open");
      globalThis.document.body.classList.remove("sidebar-open");
    }
    Object.values(pillContainers).forEach((c) => {
      c.children.length = 0;
      c.textContent = "";
    });
  });

  test("handleFilterChangeOptimistic: activa filtro, limpia búsqueda activa y añade pill al DOM", async () => {
    sidebarModule.initSidebar();

    // 1. Estado previo con término de búsqueda
    stateModule.setSearchTerm("matrix");
    mainSearchInput.value = "matrix";

    // Mock de catálogo exitoso
    const supabase = await apiModule.getSupabase();
    const originalRpc = supabase.rpc;
    supabase.rpc = () => {
      const p = Promise.resolve({ data: { items: [], total: 0 }, error: null });
      p.abortSignal = () => p;
      return p;
    };

    try {
      // 2. Simular clic en un filter-link de género 'Acción'
      const filterLink = createMockDomElement("div", {
        className: "filter-link",
        dataset: { filterType: "genre", filterValue: "Acción" },
      });

      sidebarScrollable.dispatchEvent({
        type: "click",
        target: filterLink,
      });

      // Esperar microtareas asíncronas
      await new Promise((r) => setTimeout(r, 150));

      const active = stateModule.getActiveFilters();
      assert.equal(active.genre, "Acción", "El género debe ser 'Acción'");
      assert.equal(active.searchTerm, "", "El término de búsqueda debe limpiarse");
      assert.equal(mainSearchInput.value, "", "El input de búsqueda del DOM debe vaciarse");

      // 3. Verificar que se renderizó la píldora en el contenedor correspondiente
      const genrePills = pillContainers.genre;
      assert.equal(genrePills.children.length, 1, "Debe haberse añadido 1 pill al contenedor de género");
      const pill = genrePills.children[0];
      assert.equal(pill.dataset.filterType, "genre");
      assert.equal(pill.dataset.filterValue, "Acción");
      assert.ok(pill.textContent.includes("Acción"), "La pill debe contener la etiqueta legible 'Acción'");
    } finally {
      supabase.rpc = originalRpc;
      sidebarModule.disposeSidebarEvents();
    }
  });

  test("handleFilterChangeOptimistic: rollback exacto si loadAndRenderMovies falla", async () => {
    sidebarModule.initSidebar();

    const supabase = await apiModule.getSupabase();
    const originalRpc = supabase.rpc;

    // Primero renderizamos pills iniciales con RPC exitoso
    supabase.rpc = () => {
      const p = Promise.resolve({ data: { items: [], total: 10 }, error: null });
      p.abortSignal = () => p;
      return p;
    };

    // Render inicial de 'Drama' mediante clic
    const initialLink = createMockDomElement("div", {
      className: "filter-link",
      dataset: { filterType: "genre", filterValue: "Drama" },
    });
    sidebarScrollable.dispatchEvent({ type: "click", target: initialLink });
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(stateModule.getActiveFilters().genre, "Drama");
    assert.equal(pillContainers.genre.children.length, 1);
    assert.ok(pillContainers.genre.children[0].textContent.includes("Drama"));

    // 2. Ahora simulamos error de base de datos / red para el siguiente cambio
    supabase.rpc = () => {
      const p = Promise.resolve({
        data: null,
        error: new Error("Simulated network timeout"),
      });
      p.abortSignal = () => p;
      return p;
    };

    try {
      // Intentar cambiar género a 'Comedia'
      const comedyLink = createMockDomElement("div", {
        className: "filter-link",
        dataset: { filterType: "genre", filterValue: "Comedia" },
      });

      sidebarScrollable.dispatchEvent({ type: "click", target: comedyLink });
      await new Promise((r) => setTimeout(r, 1100));

      // 3. Rollback: el género debe haber revertido a 'Drama'
      const active = stateModule.getActiveFilters();
      assert.equal(active.genre, "Drama", "Debe restaurar el filtro previo ('Drama') tras fallar la petición");

      // Las pills deben reflejar 'Drama' y no 'Comedia'
      assert.equal(pillContainers.genre.children.length, 1);
      assert.ok(pillContainers.genre.children[0].textContent.includes("Drama"), "La pill debe volver a mostrar 'Drama'");
    } finally {
      supabase.rpc = originalRpc;
      sidebarModule.disposeSidebarEvents();
    }
  });

  test("handleToggleExcludedFilterOptimistic: excluye filtro, limpia búsqueda y revierte ante error", async () => {
    sidebarModule.initSidebar();

    stateModule.setSearchTerm("sci-fi test");
    mainSearchInput.value = "sci-fi test";

    const supabase = await apiModule.getSupabase();
    const originalRpc = supabase.rpc;

    // 1. Exclusión exitosa
    supabase.rpc = () => {
      const p = Promise.resolve({ data: { items: [], total: 0 }, error: null });
      p.abortSignal = () => p;
      return p;
    };

    try {
      const excludeBtn = createMockDomElement("button", {
        className: "exclude-filter-btn",
        dataset: { type: "genre", value: "Terror" },
      });

      sidebarScrollable.dispatchEvent({ type: "click", target: excludeBtn });
      await new Promise((r) => setTimeout(r, 30));

      const active = stateModule.getActiveFilters();
      assert.ok(active.excludedGenres.includes("Terror"), "excludedGenres debe contener 'Terror'");
      assert.equal(active.searchTerm, "", "Debe limpiar el término de búsqueda al excluir");
      assert.equal(mainSearchInput.value, "", "Debe vaciar el input del DOM al excluir");

      // Verificar píldora con estilo de exclusión
      const genrePills = pillContainers.genre;
      assert.equal(genrePills.children.length, 1);
      const pill = genrePills.children[0];
      assert.ok(pill.classList.contains("filter-pill--exclude"), "Debe tener clase filter-pill--exclude");
      assert.ok(pill.textContent.includes("(-) Terror"), "Debe mostrar el prefijo (-) y el nombre");

      // 2. Simular fallo de red al intentar excluir 'Acción'
      stateModule.resetFiltersState();
      supabase.rpc = () => {
        const p = Promise.resolve({ data: null, error: new Error("Network error") });
        p.abortSignal = () => p;
        return p;
      };

      const excludeActionBtn = createMockDomElement("button", {
        className: "exclude-filter-btn",
        dataset: { type: "genre", value: "Acción" },
      });

      sidebarScrollable.dispatchEvent({ type: "click", target: excludeActionBtn });
      await new Promise((r) => setTimeout(r, 1100));

      // Debe haber revertido: 'Acción' no queda excluido tras el fallo
      const activeAfterError = stateModule.getActiveFilters();
      assert.ok(!activeAfterError.excludedGenres.includes("Acción"), "No debe contener 'Acción' tras el fallo");
      assert.equal(activeAfterError.excludedGenres.length, 0, "No debe haber filtros excluidos tras el rollback");
    } finally {
      supabase.rpc = originalRpc;
      sidebarModule.disposeSidebarEvents();
    }
  });

  test("handlePillClick: eliminar píldora desencadena animación y retira el filtro", async () => {
    sidebarModule.initSidebar();

    const supabase = await apiModule.getSupabase();
    const originalRpc = supabase.rpc;
    supabase.rpc = () => {
      const p = Promise.resolve({ data: { items: [], total: 0 }, error: null });
      p.abortSignal = () => p;
      return p;
    };

    try {
      // 1. Activar filtro de género 'Animación'
      const link = createMockDomElement("div", {
        className: "filter-link",
        dataset: { filterType: "genre", filterValue: "Animación" },
      });
      sidebarScrollable.dispatchEvent({ type: "click", target: link });
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(stateModule.getActiveFilters().genre, "Animación");
      assert.equal(pillContainers.genre.children.length, 1);

      const pill = pillContainers.genre.children[0];
      const removeBtn = pill.children.find((c) => c.classList && c.classList.contains("remove-filter-btn")) || pill;

      // 2. Hacer clic en el botón de la píldora
      sidebarScrollable.dispatchEvent({ type: "click", target: removeBtn });

      assert.ok(pill.classList.contains("is-removing"), "La píldora debe tener la clase 'is-removing'");

      // 3. Simular fin de animación
      pill.dispatchEvent("animationend");
      await new Promise((r) => setTimeout(r, 40));

      // El filtro de género debe haberse limpiado
      assert.equal(stateModule.getActiveFilters().genre, null, "El filtro de género debe quedar en null");
      assert.equal(pillContainers.genre.children.length, 0, "La píldora debe haberse eliminado del DOM");
    } finally {
      supabase.rpc = originalRpc;
      sidebarModule.disposeSidebarEvents();
    }
  });

  test("Exclusividad semántica: alternar entre studio y selection limpia el filtro opuesto", async () => {
    sidebarModule.initSidebar();

    const supabase = await apiModule.getSupabase();
    const originalRpc = supabase.rpc;
    supabase.rpc = () => {
      const p = Promise.resolve({ data: { items: [], total: 0 }, error: null });
      p.abortSignal = () => p;
      return p;
    };

    try {
      // 1. Activar estudio A24
      const studioLink = createMockDomElement("div", {
        className: "filter-link",
        dataset: { filterType: "studio", filterValue: "a24" },
      });
      sidebarScrollable.dispatchEvent({ type: "click", target: studioLink });
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(stateModule.getActiveFilters().studio, "a24");
      assert.equal(stateModule.getActiveFilters().selection, null);

      // 2. Activar selección Criterion
      const selectionLink = createMockDomElement("div", {
        className: "filter-link",
        dataset: { filterType: "selection", filterValue: "criterion" },
      });
      sidebarScrollable.dispatchEvent({ type: "click", target: selectionLink });
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(stateModule.getActiveFilters().selection, "criterion");
      assert.equal(stateModule.getActiveFilters().studio, null, "Al activar una selección debe anular el estudio");

      // 3. Volver a activar estudio: debe anular la selección
      sidebarScrollable.dispatchEvent({ type: "click", target: studioLink });
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(stateModule.getActiveFilters().studio, "a24");
      assert.equal(stateModule.getActiveFilters().selection, null, "Al activar un estudio debe anular la selección");
    } finally {
      supabase.rpc = originalRpc;
      sidebarModule.disposeSidebarEvents();
    }
  });

  test("toggleDesktopSidebar: alterna clases en documentElement y body de forma simétrica", () => {
    // 1. Simular inicio colapsado
    globalThis.document.documentElement.classList.add("sidebar-collapsed");
    globalThis.document.body.classList.remove("sidebar-collapsed");

    // 2. toggleDesktopSidebar debe descolapsar ambos
    sidebarModule.toggleDesktopSidebar();
    assert.equal(globalThis.document.documentElement.classList.contains("sidebar-collapsed"), false);
    assert.equal(globalThis.document.body.classList.contains("sidebar-collapsed"), false);

    // 3. toggleDesktopSidebar debe volver a colapsar ambos
    sidebarModule.toggleDesktopSidebar();
    assert.equal(globalThis.document.documentElement.classList.contains("sidebar-collapsed"), true);
    assert.equal(globalThis.document.body.classList.contains("sidebar-collapsed"), true);

    // Cleanup
    globalThis.document.documentElement.classList.remove("sidebar-collapsed");
    globalThis.document.body.classList.remove("sidebar-collapsed");
  });

  test("Director/Actor: los slugs crudos no se renderizan como píldora hasta resolverse el nombre bien escrito", () => {
    sidebarModule.initSidebar();

    // 1. Verificación pura de isRawPersonSlug
    assert.equal(sidebarModule.isRawPersonSlug("juan-antonio-bardem"), true);
    assert.equal(sidebarModule.isRawPersonSlug("pedro-almodovar"), true);
    assert.equal(sidebarModule.isRawPersonSlug("Juan Antonio Bardem"), false);
    assert.equal(sidebarModule.isRawPersonSlug("Jean-Luc Godard"), false);
    assert.equal(sidebarModule.isRawPersonSlug("Daniel Day-Lewis"), false);

    // 2. Establecer filtro director con un slug crudo
    stateModule.setFilter("director", "juan-antonio-bardem");
    sidebarModule.resetFilterPillsCache();
    sidebarModule.renderFilterPills();

    // La píldora NO debe salir en el DOM si es un slug crudo no resuelto
    const dirContainer = pillContainers["director"];
    assert.equal(dirContainer.children.length, 0, "Un slug crudo sin resolver nunca debe generar píldora en el DOM");

    // 3. Cuando se resuelve el nombre canónico bien escrito
    stateModule.setFilter("director", "Juan Antonio Bardem");
    sidebarModule.renderFilterPills();

    // La píldora debe salir con el nombre canónico bien escrito
    assert.equal(dirContainer.children.length, 1, "Debe crearse la píldora para el nombre canónico");
    assert.equal(dirContainer.children[0].dataset.filterValue, "Juan Antonio Bardem");
    assert.match(dirContainer.children[0].textContent, /Juan Antonio Bardem/);
  });

  test("Búsquedas sin punto ('j j abrams', 'jj abrams'): generación de variantes y resolución canónica", () => {
    // 1. Verificación de generación de variantes fonéticas y ortográficas en apiModule
    const abramsVariants = apiModule.getAlternativeSearchTerms("j j abrams");
    assert.ok(abramsVariants.includes("j.j. abrams"), "Debe generar la variante compacta con puntos 'j.j. abrams'");

    const compactVariants = apiModule.getAlternativeSearchTerms("jj abrams");
    assert.ok(compactVariants.includes("j.j. abrams"), "Debe expandir 'jj abrams' a 'j.j. abrams'");

    const middleVariants = apiModule.getAlternativeSearchTerms("david o russell");
    assert.ok(middleVariants.includes("david o. russell"), "Debe puntuar la inicial intermedia");

    const singleInitialVariants = apiModule.getAlternativeSearchTerms("m night shyamalan");
    assert.ok(singleInitialVariants.includes("m. night shyamalan"), "Debe puntuar la inicial inicial");

    // 2. Comprobar que una píldora para 'J.J. Abrams' se renderiza impecable con el nombre canónico
    sidebarModule.initSidebar();
    stateModule.setFilter("director", "J.J. Abrams");
    sidebarModule.resetFilterPillsCache();
    sidebarModule.renderFilterPills();

    const dirContainer = pillContainers["director"];
    assert.equal(dirContainer.children.length, 1);
    assert.equal(dirContainer.children[0].dataset.filterValue, "J.J. Abrams");
    assert.match(dirContainer.children[0].textContent, /J\.J\. Abrams/);
  });

  test("handleRandomMovieRecommendation: selecciona película globalmente cuando totalMovies > cards.length", async () => {
    const grid = document.getElementById("grid-container");
    grid.innerHTML = "";
    grid.children = [];

    // Creamos 2 tarjetas locales
    const card1 = createMockDomElement("div", { className: "movie-card" });
    card1.movieData = { id: 101, title: "Metropolis" };
    const card2 = createMockDomElement("div", { className: "movie-card" });
    card2.movieData = { id: 102, title: "M, el vampiro de Düsseldorf" };
    grid.appendChild(card1);
    grid.appendChild(card2);

    grid.querySelectorAll = (sel) => {
      if (sel.includes(".movie-card")) return [card1, card2];
      return [];
    };

    const supabase = await apiModule.getSupabase();
    const origRpc = supabase.rpc;
    let rpcCalls = 0;
    let rpcParamsCaptured = null;

    supabase.rpc = (fnName, params) => {
      rpcCalls++;
      rpcParamsCaptured = params;
      const p = Promise.resolve({
        data: {
          items: [{ id: 999, title: "La Noche del Cazador", slug: "la-noche-del-cazador-1955" }],
          total: 500
        },
        error: null
      });
      p.abortSignal = () => p;
      return p;
    };

    try {
      // Caso 1: totalMovies = 2 (total <= cards.length) -> Fast-Path local sin tocar RPC
      stateModule.setTotalMovies(2);
      await sidebarModule.handleRandomMovieRecommendation();
      assert.equal(rpcCalls, 0, "En el fast-path local no debe emitirse consulta RPC");

      // Caso 2: totalMovies = 500 (total > cards.length) -> Selección global remota con offset
      stateModule.setTotalMovies(500);
      await sidebarModule.handleRandomMovieRecommendation();

      assert.equal(rpcCalls, 1, "Debe invocar la RPC para consultar el offset global");
      assert.equal(rpcParamsCaptured.page_limit, 1, "Debe solicitar exactamente 1 película");
      assert.ok(
        rpcParamsCaptured.page_offset >= 0 && rpcParamsCaptured.page_offset < 500,
        `El offset (${rpcParamsCaptured.page_offset}) debe estar en el rango de totalMovies (0..499)`
      );
      assert.equal(rpcParamsCaptured.get_count, false, "No debe solicitar recálculo de conteo");
    } finally {
      supabase.rpc = origRpc;
    }
  });

  test("initGlobalHotkeys: atajos 'b', 'Ctrl+K', 'm', 's', 'r' y protecciones modales", async () => {
    let focusCalled = false;
    let selectCalled = false;
    mainSearchInput.focus = () => { focusCalled = true; };
    mainSearchInput.select = () => { selectCalled = true; };

    const cleanupHotkeys = mainModule.initGlobalHotkeys();

    function dispatchKey(key, opts = {}) {
      let prevented = false;
      const ev = {
        type: "keydown",
        key,
        ctrlKey: opts.ctrlKey || false,
        metaKey: opts.metaKey || false,
        altKey: opts.altKey || false,
        target: opts.target || globalThis.document.body,
        preventDefault: () => { prevented = true; },
      };
      globalThis.document.dispatchEvent(ev);
      return { prevented, ev };
    }

    try {
      // 1. Tecla 'b' sin modificadores enfoca el buscador
      focusCalled = false;
      selectCalled = false;
      const rB = dispatchKey("b");
      assert.equal(rB.prevented, true);
      assert.equal(focusCalled, true);
      assert.equal(selectCalled, true);

      // 2. 'Ctrl+K' enfoca el buscador
      focusCalled = false;
      selectCalled = false;
      const rCtrlK = dispatchKey("k", { ctrlKey: true });
      assert.equal(rCtrlK.prevented, true);
      assert.equal(focusCalled, true);
      assert.equal(selectCalled, true);

      // 3. 'Ctrl+R' (recargar página) no es interceptado por 'r'
      const rReload = dispatchKey("r", { ctrlKey: true });
      assert.equal(rReload.prevented, false, "Ctrl+R no debe ser interceptado");

      // 4. Si el foco está en un INPUT, 'b' es ignorado
      focusCalled = false;
      const rInput = dispatchKey("b", { target: { tagName: "INPUT" } });
      assert.equal(rInput.prevented, false);
      assert.equal(focusCalled, false);

      // 5. Si hay una modal abierta (modal-open en body), 'b' es ignorado
      globalThis.document.body.classList.add("modal-open");
      focusCalled = false;
      const rModal = dispatchKey("b");
      assert.equal(rModal.prevented, false);
      assert.equal(focusCalled, false);
      globalThis.document.body.classList.remove("modal-open");

      // 6. Tecla 'm' intercepta y previene default
      const rM = dispatchKey("m");
      assert.equal(rM.prevented, true, "Tecla 'm' debe llamar preventDefault()");

      // 7. Tecla 's' y '[' interceptan y previenen default
      const rS = dispatchKey("s");
      assert.equal(rS.prevented, true, "Tecla 's' debe llamar preventDefault()");
      const rBracket = dispatchKey("[");
      assert.equal(rBracket.prevented, true, "Tecla '[' debe llamar preventDefault()");

      // 8. Tecla 'r' sin modificadores intercepta y previene default
      const rRandom = dispatchKey("r");
      assert.equal(rRandom.prevented, true, "Tecla 'r' debe llamar preventDefault()");
    } finally {
      cleanupHotkeys();
    }
  });
});
