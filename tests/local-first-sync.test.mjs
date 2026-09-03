import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

// Mock en memoria completo de IndexedDB para Node.js
function createMockIndexedDB() {
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
        onupgradeneeded: null
      };

      setTimeout(() => {
        const db = {
          name,
          version,
          objectStoreNames: {
            contains: (s) => stores.has(s)
          },
          createObjectStore: (s) => {
            getStore(s);
            return {
              createIndex: () => {}
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
                }
              })
            };

            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete();
            }, 5);

            return tx;
          },
          close: () => {}
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
    _reset: () => stores.clear()
  };
}

describe("Local-First Architecture (localStore.ts y syncManager.ts)", () => {
  let viteEnv;
  let localStore;
  let mockIDB;

  before(async () => {
    mockIDB = createMockIndexedDB();
    globalThis.indexedDB = mockIDB;

    viteEnv = await startViteSsrServer([
      "/src/js/localStore.ts",
      "/src/js/syncManager.ts"
    ]);
    [localStore] = viteEnv.modules;
  });

  beforeEach(async () => {
    if (localStore) {
      await localStore.clearLocalStore();
    }
  });

  after(async () => {
    localStore.closeLocalDB();
    delete globalThis.indexedDB;
    if (viteEnv) await viteEnv.close();
  });

  test("saveLocalEntry persiste inmediatamente con estado 'dirty' y timestamp UTC", async () => {
    const entry = await localStore.saveLocalEntry(42, { onWatchlist: true, rating: null });

    assert.equal(entry.movieId, 42);
    assert.equal(entry.onWatchlist, true);
    assert.equal(entry.rating, null);
    assert.equal(entry.syncStatus, "dirty");
    assert.ok(entry.updatedAt > 0);

    const stored = await localStore.getLocalEntry(42);
    assert.deepEqual(stored, entry);
  });

  test("saveLocalEntry con rating null y onWatchlist false marca 'deleted' para notificar a la nube", async () => {
    const entry = await localStore.saveLocalEntry(42, { onWatchlist: false, rating: null });

    assert.equal(entry.syncStatus, "deleted");
    assert.equal(entry.onWatchlist, false);
    assert.equal(entry.rating, null);

    // getAllLocalEntries NO debe incluir las entradas 'deleted' en el catálogo activo del usuario
    const all = await localStore.getAllLocalEntries();
    assert.equal(all["42"], undefined);
  });

  test("markEntriesAsSynced purga filas 'deleted' y marca las activas como 'synced'", async () => {
    await localStore.saveLocalEntry(101, { rating: 8, onWatchlist: false });
    await localStore.saveLocalEntry(102, { rating: null, onWatchlist: false }); // deleted

    const pendingBefore = await localStore.getPendingSyncEntries();
    assert.equal(pendingBefore.length, 2);

    await localStore.markEntriesAsSynced([101, 102], Date.now() + 1000);

    const entry101 = await localStore.getLocalEntry(101);
    assert.equal(entry101.syncStatus, "synced");

    const entry102 = await localStore.getLocalEntry(102);
    assert.equal(entry102, null, "La entrada eliminada debe ser purgada de IndexedDB tras sincronizarse");
  });

  test("mergeRemoteEntries aplica Last-Write-Wins (LWW): local más reciente gana", async () => {
    const now = Date.now();
    // Entrada local mutada offline a las (now + 5000)
    await localStore.saveLocalEntry(200, { rating: 10, onWatchlist: false }, now + 5000);

    // Entrada remota de Supabase con timestamp anterior (now)
    const remoteData = [
      {
        movie_id: 200,
        rating: 5,
        on_watchlist: false,
        updated_at: new Date(now).toISOString()
      }
    ];

    const result = await localStore.mergeRemoteEntries(remoteData);

    assert.equal(result.hasLocalChangesToUpload, true, "Debe marcar que el dato local debe subirse a la nube");
    assert.equal(result.mergedMap["200"].rating, 10, "Debe prevalecer la valoración local más reciente");
  });

  test("mergeRemoteEntries adopta entradas remotas nuevas o más recientes", async () => {
    const remoteData = [
      {
        movie_id: 300,
        rating: null,
        on_watchlist: true,
        updated_at: new Date().toISOString()
      }
    ];

    const result = await localStore.mergeRemoteEntries(remoteData);
    assert.ok(result.mergedMap["300"]);
    assert.equal(result.mergedMap["300"].onWatchlist, true);

    const stored = await localStore.getLocalEntry(300);
    assert.equal(stored.syncStatus, "synced");
  });
});
