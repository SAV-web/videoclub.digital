/**
 * Helper unificado para simular el entorno DOM / Browser en Node.js (SSR tests).
 * Proporciona mocks ligeros y coherentes de Elementos, Window, Document y Storage,
 * eliminando cientos de líneas de boilerplate duplicado entre suites de pruebas.
 */

export function createMockDomElement(tagName = "div", extraProps = {}) {
  const listeners = {};
  const classListSet = new Set();
  const dataset = {};
  const attributes = {};
  const children = [];

  const el = {
    id: "",
    tagName: tagName.toUpperCase(),
    dataset,
    attributes,
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    style: {},
    children,
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
    replaceChildren: (...newChildren) => {
      el.textContent = "";
      children.length = 0;
      newChildren.forEach((c) => el.appendChild(typeof c === "string" ? createMockDomElement("span") : c));
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    append: (...newChildren) => {
      newChildren.forEach((c) => el.appendChild(typeof c === "string" ? createMockDomElement("span") : c));
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    remove: () => {},
    setAttribute: (k, v) => { attributes[k] = String(v); },
    removeAttribute: (k) => { delete attributes[k]; },
    getAttribute: (k) => (k in attributes ? attributes[k] : null),
    hasAttribute: (k) => k in attributes,
    focus: () => {},
    reset: () => {},
    getBoundingClientRect: () => ({ left: 0, width: 200, top: 0, height: 24, bottom: 24, right: 200 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    _getListenerCount: (event) => (listeners[event] ? listeners[event].length : 0),
    ...extraProps,
  };

  return el;
}

export function createMockWindow(initialPath = "/", initialSearch = "") {
  const windowListeners = {};
  let _pathname = initialPath;
  let _search = initialSearch;
  let _href = `http://localhost${initialPath}${initialSearch}`;
  let lastReplaced = null;
  let lastPushed = null;

  return {
    innerWidth: 1024,
    innerHeight: 768,
    scrollY: 0,
    _isTestEnv: true,
    location: {
      get pathname() { return _pathname; },
      get search() { return _search; },
      get href() { return _href; },
      set href(val) { _href = val; },
      hash: "",
    },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        lastReplaced = url;
        _href = url;
        const [p, q] = url.split("?");
        _pathname = p;
        _search = q ? `?${q}` : "";
      },
      pushState(_state, _title, url) {
        lastPushed = url;
        _href = url;
        const [p, q] = url.split("?");
        _pathname = p;
        _search = q ? `?${q}` : "";
      },
      back: () => {},
    },
    getLastReplaced: () => lastReplaced,
    getLastPushed: () => lastPushed,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
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
    _getListenerCount: (event) => (windowListeners[event] ? windowListeners[event].length : 0),
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
}

export function setupGlobalDom(options = {}) {
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    navigator: globalThis.navigator,
    IntersectionObserver: globalThis.IntersectionObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  const elementMap = options.elementMap || {};
  const docListeners = {};
  const body = createMockDomElement("body");
  const html = createMockDomElement("html");
  const head = createMockDomElement("head");

  globalThis.window = options.window || createMockWindow(options.pathname || "/", options.search || "");

  globalThis.document = {
    body,
    documentElement: html,
    head,
    activeElement: null,
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
    querySelector: (sel) => {
      if (sel && sel.startsWith("#")) {
        const id = sel.slice(1);
        if (elementMap[id]) return elementMap[id];
      }
      return options.fallbackCreate ? createMockDomElement("div") : null;
    },
    querySelectorAll: () => [],
    getElementById: (id) => elementMap[id] || (options.fallbackCreate ? createMockDomElement("div", { id }) : null),
    getElementsByClassName: () => [],
    createElement: (tag) => createMockDomElement(tag),
    createElementNS: (_ns, tag) => createMockDomElement(tag),
    createDocumentFragment: () => createMockDomElement("div"),
    _getListenerCount: (event) => (docListeners[event] ? docListeners[event].length : 0),
  };

  if (!globalThis.localStorage) {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };
  }

  if (!globalThis.navigator) {
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { maxTouchPoints: 0, userAgent: "Node" },
        configurable: true,
        writable: true,
      });
    } catch {}
  }

  if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

  const teardown = () => {
    try { globalThis.window = originals.window; } catch {}
    try { globalThis.document = originals.document; } catch {}
    try { globalThis.localStorage = originals.localStorage; } catch {}
    try { globalThis.IntersectionObserver = originals.IntersectionObserver; } catch {}
    try { globalThis.requestAnimationFrame = originals.requestAnimationFrame; } catch {}
    try { globalThis.cancelAnimationFrame = originals.cancelAnimationFrame; } catch {}
  };

  return { window: globalThis.window, document: globalThis.document, teardown };
}
