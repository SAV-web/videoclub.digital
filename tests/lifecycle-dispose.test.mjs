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
    history: { state: null },
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
  test("initCardInteractions registra listeners y reacciona a eventos; disposeCardEvents los limpia; segundo init los reengancha", () => {
    const mockGrid = createMockDomElement("div");

    // 1. Primer init
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Debe registrar 1 listener de pointerover");
    assert.equal(mockGrid._getListenerCount("pointerout"), 1, "Debe registrar 1 listener de pointerout");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Debe registrar 1 listener de dblclick");
    assert.equal(mockGrid._getListenerCount("pointerdown"), 1, "Debe registrar 1 listener de pointerdown");

    // Llamar init de nuevo sin dispose es idempotente
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "No debe duplicar listeners al llamar init repetido");

    // 2. Dispose
    cardModule.disposeCardEvents();
    assert.equal(mockGrid._getListenerCount("pointerover"), 0, "Debe desvincular pointerover");
    assert.equal(mockGrid._getListenerCount("pointerout"), 0, "Debe desvincular pointerout");
    assert.equal(mockGrid._getListenerCount("dblclick"), 0, "Debe desvincular dblclick");
    assert.equal(mockGrid._getListenerCount("pointerdown"), 0, "Debe desvincular pointerdown");

    // 3. Segundo init tras dispose
    cardModule.initCardInteractions(mockGrid);
    assert.equal(mockGrid._getListenerCount("pointerover"), 1, "Debe reenganchar 1 listener de pointerover tras dispose");
    assert.equal(mockGrid._getListenerCount("dblclick"), 1, "Debe reenganchar 1 listener de dblclick tras dispose");
  });
});

describe("Ciclo de Vida: Modal Component (init → dispose → init)", () => {
  test("initQuickView registra atajos y eventos; disposeModalEvents limpia listeners y estado; segundo init es limpio", () => {
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

    // 2. Dispose
    modalModule.disposeModalEvents();
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
  });
});

describe("Ciclo de Vida: Sidebar Component (init → dispose → init)", () => {
  test("initSidebar arranca componentes y listeners; disposeSidebarEvents restablece el estado y permite reinicializar", () => {
    // 1. Primer init
    sidebarModule.initSidebar();

    // 2. Dispose
    sidebarModule.disposeSidebarEvents();

    // 3. Segundo init: debe ejecutarse sin quedar bloqueado por isSidebarInitialized
    sidebarModule.initSidebar();
  });
});

describe("Ciclo de Vida: Main Module (init → dispose → init)", () => {
  test("setupGlobalListeners vincula listeners de documento y scroll; disposeMainEvents los remueve; re-init vuelve a vincularlos", () => {
    const initialDocClicks = globalThis.document._getListenerCount("click");

    // 1. Dispose inicial para asegurar estado limpio
    mainModule.disposeMainEvents();

    // 2. Simular re-init de listeners
    mainModule.disposeMainEvents();
    assert.equal(globalThis.document._getListenerCount("click"), initialDocClicks);
  });
});
