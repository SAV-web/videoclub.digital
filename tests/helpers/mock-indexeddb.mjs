/**
 * Mock en memoria completo de IndexedDB para entornos de pruebas en Node.js (SSR).
 * Soporta creación de almacenes de objetos, índices y transacciones asíncronas
 * con eventos onsuccess, onerror y oncomplete.
 */
export function createMockIndexedDB() {
  const stores = new Map();

  function getStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  return {
    open(name, version) {
      const request = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      setTimeout(() => {
        const db = {
          name,
          version,
          objectStoreNames: {
            contains: (s) => stores.has(s),
          },
          createObjectStore: (s) => {
            getStore(s);
            return {
              createIndex: () => {},
            };
          },
          transaction: (storeNames) => {
            const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            const targetMap = getStore(storeName);

            const tx = {
              oncomplete: null,
              onerror: null,
              objectStore: () => ({
                get: (key) => {
                  const req = { result: undefined, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    req.result = targetMap.get(key);
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                getAll: () => {
                  const req = { result: [], onsuccess: null, onerror: null };
                  setTimeout(() => {
                    req.result = Array.from(targetMap.values());
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                put: (val) => {
                  const req = { result: val.movieId, onsuccess: null, onerror: null };
                  targetMap.set(val.movieId, { ...val });
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                delete: (key) => {
                  const req = { result: undefined, onsuccess: null, onerror: null };
                  targetMap.delete(key);
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                clear: () => {
                  const req = { result: undefined, onsuccess: null, onerror: null };
                  targetMap.clear();
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
              }),
            };

            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete();
            }, 5);

            return tx;
          },
          close: () => {},
        };

        request.result = db;
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: db } });
        }
        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    },
    _reset: () => stores.clear(),
  };
}
