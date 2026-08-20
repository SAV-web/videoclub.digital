import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

// Setup global DOM environment for testing components
function createMockDomElement(tagName = "div") {
  const listeners = {};
  const classListSet = new Set();
  const dataset = {};
  const attributes = {};

  const el = {
    tagName: tagName.toUpperCase(),
    dataset,
    classList: {
      add: (...cls) => cls.forEach((c) => classListSet.add(c)),
      remove: (...cls) => cls.forEach((c) => classListSet.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classListSet.has(c)) classListSet.delete(c);
          else classListSet.add(c);
        } else if (force) classListSet.add(c);
        else classListSet.delete(c);
        return classListSet.has(c);
      },
      contains: (c) => classListSet.has(c),
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const type = typeof event === "string" ? event : event.type;
      const handlers = listeners[type] || [];
      handlers.forEach((h) => h(event));
    },
    replaceChildren: (...children) => {
      el.textContent = "";
      children.forEach((c) => el.appendChild(typeof c === "string" ? createMockDomElement("span") : c));
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    appendChild: (child) => child,
    append: (...children) => children.forEach((c) => el.appendChild(typeof c === "string" ? createMockDomElement("span") : c)),
    removeChild: (child) => child,
    remove: () => {},
    setAttribute: (k, v) => { attributes[k] = String(v); },
    removeAttribute: (k) => { delete attributes[k]; },
    getAttribute: (k) => attributes[k],
    hasAttribute: (k) => k in attributes,
    style: {},
    textContent: "",
    innerHTML: "",
    _getListenerCount: (event) => (listeners[event] ? listeners[event].length : 0),
  };
  return el;
}



if (!globalThis.window) {
  const windowListeners = {};
  globalThis.window = {
    innerWidth: 1024,
    innerHeight: 768,
    scrollY: 0,
    addEventListener: (event, handler) => {
      if (!windowListeners[event]) windowListeners[event] = [];
      windowListeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (windowListeners[event]) {
        windowListeners[event] = windowListeners[event].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const type = typeof event === "string" ? event : event.type;
      const handlers = windowListeners[type] || [];
      handlers.forEach((h) => h(event));
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    _getListenerCount: (event) => (windowListeners[event] ? windowListeners[event].length : 0),
    _isTestEnv: true,
    history: { state: null, pushState: () => {}, replaceState: () => {}, back: () => {} },
    location: { search: "", pathname: "/", hash: "", href: "http://localhost/" },

    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
}



if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.document) {
  const docListeners = {};
  const docBody = createMockDomElement("body");
  const docHtml = createMockDomElement("html");
  globalThis.document = {
    body: docBody,
    documentElement: docHtml,
    head: createMockDomElement("head"),
    addEventListener: (event, handler) => {
      if (!docListeners[event]) docListeners[event] = [];
      docListeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (docListeners[event]) {
        docListeners[event] = docListeners[event].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event) => {
      const type = typeof event === "string" ? event : event.type;
      const handlers = docListeners[type] || [];
      handlers.forEach((h) => h(event));
    },
    querySelector: () => createMockDomElement("div"),
    querySelectorAll: () => [],
    getElementById: () => createMockDomElement("div"),
    getElementsByClassName: () => [],
    createElement: (tag) => createMockDomElement(tag),
    createElementNS: (ns, tag) => createMockDomElement(tag),
    createDocumentFragment: () => createMockDomElement("div"),
    _getListenerCount: (event) => (docListeners[event] ? docListeners[event].length : 0),
  };
}

if (!globalThis.localStorage) {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

if (!globalThis.navigator) {
  globalThis.navigator = { maxTouchPoints: 0, userAgent: "Node" };
}


let viteEnv;
let stateModule;
let cardModule;
let modalModule;
let sidebarModule;

let mainModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/state.ts",
    "/src/js/components/card.ts",
    "/src/js/components/modal.ts",
    "/src/js/components/sidebar.ts",
    "/src/js/main.ts",
  ]);
  [stateModule, cardModule, modalModule, sidebarModule, mainModule] = viteEnv.modules;
});

after(async () => {
  cardModule?.disposeCardEvents();
  modalModule?.disposeModalEvents();
  sidebarModule?.disposeSidebarEvents();
  mainModule?.disposeMainEvents();
  await viteEnv?.close();
});


beforeEach(() => {
  stateModule.appEvents.clearAll();
  cardModule.disposeCardEvents();
  modalModule.disposeModalEvents();
  sidebarModule.disposeSidebarEvents();
  mainModule.disposeMainEvents();
});

describe("Ciclo de Vida: Card Component (init → dispose → init)", () => {
  test("initCardInteractions registra listeners (incluyendo visibilitychange); disposeCardEvents los limpia; segundo init los reengancha", () => {
    const mockGrid = createMockDomElement("div");
    const initialDocVisibilityListeners = globalThis.document._getListenerCount("visibilitychange");

    // 1. Primer init
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Debe registrar 1 listener de pointerover");
    assert.equal(mockGrid._getListenerCount("pointerout"), 1, "Debe registrar 1 listener de pointerout");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Debe registrar 1 listener de dblclick");
    assert.equal(mockGrid._getListenerCount("pointerdown"), 1, "Debe registrar 1 listener de pointerdown");
    assert.equal(
      globalThis.document._getListenerCount("visibilitychange"),
      initialDocVisibilityListeners + 1,
      "Debe registrar listener de visibilitychange en document"
    );

    // Llamar init de nuevo sin dispose es idempotente
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "No debe duplicar listeners al llamar init repetido");
    assert.equal(globalThis.document._getListenerCount("visibilitychange"), initialDocVisibilityListeners + 1);

    // 2. Dispose
    cardModule.disposeCardEvents();
    assert.equal(mockGrid._getListenerCount("pointerover"), 0, "Debe desvincular pointerover");
    assert.equal(mockGrid._getListenerCount("pointerout"), 0, "Debe desvincular pointerout");
    assert.equal(mockGrid._getListenerCount("dblclick"), 0, "Debe desvincular dblclick");
    assert.equal(mockGrid._getListenerCount("pointerdown"), 0, "Debe desvincular pointerdown");
    assert.equal(
      globalThis.document._getListenerCount("visibilitychange"),
      initialDocVisibilityListeners,
      "Debe desvincular visibilitychange de document en disposeCardEvents"
    );

    // 3. Segundo init tras dispose
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Debe reenganchar 1 listener de pointerover tras dispose");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Debe reenganchar 1 listener de dblclick tras dispose");
    assert.equal(
      globalThis.document._getListenerCount("visibilitychange"),
      initialDocVisibilityListeners + 1,
      "Debe volver a enganchar visibilitychange tras dispose"
    );
  });
});

describe("Ciclo de Vida: Modal Component (init → dispose → init)", () => {
  test("initQuickView registra atajos y eventos; disposeModalEvents limpia listeners y estado sin disparar history.back; segundo init es limpio", () => {
    let historyBackCalled = false;
    const origBack = globalThis.window.history.back;
    globalThis.window.history.back = () => { historyBackCalled = true; };
    globalThis.window.history.state = { modalOpen: true };

    const initialKeydownListeners = globalThis.window._getListenerCount("keydown");

    // 1. Primer init
    modalModule.initQuickView();
    assert.equal(
      globalThis.window._getListenerCount("keydown"),
      initialKeydownListeners + 1,
      "Debe registrar listener de keydown en window"
    );

    // Segundo init sin dispose no duplica
    modalModule.initQuickView();
    assert.equal(
      globalThis.window._getListenerCount("keydown"),
      initialKeydownListeners + 1,
      "No debe duplicar listeners en window si ya estaba inicializado"
    );

    // 2. Dispose (NO debe llamar a history.back)
    modalModule.disposeModalEvents();
    assert.equal(historyBackCalled, false, "disposeModalEvents NO debe llamar a history.back()");
    assert.equal(
      globalThis.window._getListenerCount("keydown"),
      initialKeydownListeners,
      "Debe desvincular keydown de window en disposeModalEvents"
    );

    // 3. Segundo init
    modalModule.initQuickView();
    assert.equal(
      globalThis.window._getListenerCount("keydown"),
      initialKeydownListeners + 1,
      "Debe volver a vincular keydown en window limpiamente"
    );

    globalThis.window.history.back = origBack;
    globalThis.window.history.state = null;
  });
});

describe("Ciclo de Vida: Sidebar Component (init → dispose → init)", () => {
  test("initSidebar arranca componentes y listeners; disposeSidebarEvents restablece la bandera única isSidebarInitialized y permite reinicializar", () => {
    // 1. Primer init

    sidebarModule.initSidebar();

    // 2. Dispose
    sidebarModule.disposeSidebarEvents();

    // 3. Segundo init: debe ejecutarse sin quedar bloqueado por banderas residuales
    assert.doesNotThrow(() => {
      sidebarModule.initSidebar();
    }, "initSidebar tras dispose no debe lanzar error ni quedar bloqueado");

    // 4. Tercer ciclo de verificación
    sidebarModule.disposeSidebarEvents();
    assert.doesNotThrow(() => {
      sidebarModule.initSidebar();
    });
  });
});

describe("Ciclo de Vida: Main Module y Orquestación Global (disposeApp)", () => {
  test("init() registra listeners globales y auth; disposeMainEvents() y disposeApp() limpian todos los subsistemas sin fugas", async () => {
    const initialDocClicks = globalThis.document._getListenerCount("click");
    const initialPopstateListeners = globalThis.window._getListenerCount("popstate");

    // 1. Inicializar main
    mainModule.init();

    // 2. Dispose individual de main
    mainModule.disposeMainEvents();
    assert.equal(globalThis.document._getListenerCount("click"), initialDocClicks, "Debe restaurar listeners de click en document");
    assert.equal(globalThis.window._getListenerCount("popstate"), initialPopstateListeners, "Debe desvincular popstate de window");

    // 3. Re-inicializar main tras dispose
    assert.doesNotThrow(() => {
      mainModule.init();
    }, "init() tras disposeMainEvents() debe poder ejecutarse limpiamente");

    // 4. Orquestación global mediante disposeApp()
    await assert.doesNotReject(async () => {
      await mainModule.disposeApp();
    }, "disposeApp() debe ejecutarse asíncronamente de forma exitosa y segura");
  });
});

describe("Test de Integración Completo: init → interacción → dispose → resolver timers/promesas → init", () => {
  test("Garantiza el ciclo de vida completo y teardown real de los cuatro módulos (Card, Modal, Sidebar, Main)", async () => {
    // Capturar recuentos base de listeners en window y document
    const initialWindowPopstate = globalThis.window._getListenerCount("popstate");
    const initialWindowKeydown = globalThis.window._getListenerCount("keydown");
    const initialDocVisibility = globalThis.document._getListenerCount("visibilitychange");
    const initialDocClicks = globalThis.document._getListenerCount("click");

    // ==========================================
    // CICLO 1: INICIALIZACIÓN DE LOS 4 MÓDULOS
    // ==========================================
    mainModule.init();
    sidebarModule.initSidebar();
    modalModule.initQuickView();

    const mockGrid = createMockDomElement("div");
    cardModule.initCardInteractions(mockGrid);

    // Verificar que los listeners reales están activos en el ciclo 1
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Grid debe tener listener de pointerover en ciclo 1");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Grid debe tener listener de dblclick en ciclo 1");
    assert.ok(globalThis.document._getListenerCount("visibilitychange") > initialDocVisibility, "visibilitychange activo en ciclo 1");
    assert.ok(globalThis.window._getListenerCount("keydown") > initialWindowKeydown, "keydown activo en ciclo 1");
    assert.ok(globalThis.window._getListenerCount("popstate") > initialWindowPopstate, "popstate activo en ciclo 1");

    // Simular interacción en la app
    let cardUpdatedTriggered = 0;
    const unsubCard = stateModule.appEvents.on("userMovieDataChanged", () => {
      cardUpdatedTriggered++;
    });
    stateModule.appEvents.emit("userMovieDataChanged", { movieId: 101 });
    assert.equal(cardUpdatedTriggered, 1, "userMovieDataChanged debe ejecutarse en ciclo 1");

    // ==========================================
    // DESMONTAJE COMPLETO (disposeApp)
    // ==========================================
    await mainModule.disposeApp();

    // Comprobar que el teardown de los 4 módulos retiró todos sus listeners del DOM, Window y Document
    assert.equal(mockGrid._getListenerCount("pointerover"), 0, "Grid no debe conservar listener de pointerover tras disposeApp");
    assert.equal(mockGrid._getListenerCount("dblclick"), 0, "Grid no debe conservar listener de dblclick tras disposeApp");
    assert.equal(globalThis.document._getListenerCount("visibilitychange"), initialDocVisibility, "visibilitychange restaurado");
    assert.equal(globalThis.window._getListenerCount("keydown"), initialWindowKeydown, "keydown restaurado");
    assert.equal(globalThis.window._getListenerCount("popstate"), initialWindowPopstate, "popstate restaurado");
    assert.equal(globalThis.document._getListenerCount("click"), initialDocClicks, "clicks en document restaurados");

    // ==========================================
    // RESOLUCIÓN DE TIMERS / PROMESAS PENDIENTES TRAS DISPOSE
    // ==========================================
    // Simular resolución tardía de red o timers (ej. LQIP onload diferido o fetch que responde tras unmount)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Despachar eventos con la app desmontada (no debe disparar handlers de módulos destruidos)
    mockGrid.dispatchEvent({ type: "pointerover", pointerType: "mouse" });
    globalThis.window.dispatchEvent({ type: "keydown", key: "Escape" });

    // ==========================================
    // CICLO 2: SEGUNDO INIT COMPLETO (REENGANCHE LIMPIO)
    // ==========================================
    mainModule.init();
    sidebarModule.initSidebar();
    modalModule.initQuickView();
    cardModule.initCardInteractions(mockGrid);

    // Verificar que los listeners se han reenganchado exactamente 1 vez por módulo (sin duplicaciones)
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Grid debe tener exactamente 1 listener de pointerover en ciclo 2");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Grid debe tener exactamente 1 listener de dblclick en ciclo 2");
    assert.equal(
      globalThis.document._getListenerCount("visibilitychange"),
      initialDocVisibility + 2, // 1 por main y 1 por card
      "visibilitychange debe estar reenganchado exactamente una vez por subsistema"
    );
    assert.equal(
      globalThis.window._getListenerCount("keydown"),
      initialWindowKeydown + 1,
      "keydown debe estar reenganchado exactamente 1 vez"
    );

    // Nueva interacción en el ciclo 2
    stateModule.appEvents.emit("userMovieDataChanged", { movieId: 102 });
    assert.equal(cardUpdatedTriggered, 2, "userMovieDataChanged debe procesarse en ciclo 2");

    unsubCard();
    await mainModule.disposeApp();
  });
});





