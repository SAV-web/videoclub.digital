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
      "/src/js/components/sidebar.ts",
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
});
