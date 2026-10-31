import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

import { createMockIndexedDB } from "./helpers/mock-indexeddb.mjs";
import { setupGlobalDom } from "./helpers/mock-dom.mjs";

describe("Local-First Architecture (localStore.ts y syncManager.ts)", () => {
  let viteEnv;
  let localStore;
  let mockIDB;
  let apiModule;
  let stateModule;
  let syncManagerModule;

  before(async () => {
    mockIDB = createMockIndexedDB();
    globalThis.indexedDB = mockIDB;

    viteEnv = await startViteSsrServer([
      "/src/js/localStore.ts",
      "/src/js/api.ts",
      "/src/js/state.ts",
      "/src/js/syncManager.ts"
    ]);
    [localStore, apiModule, stateModule, syncManagerModule] = viteEnv.modules;
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

  test("saveLocalEntryWithMovie persiste atómicamente la entrada y la ficha de la película", async () => {
    const mockMovie = {
      id: 501,
      title: "Interstellar",
      year: 2014,
      synopsis: "Un viaje a través de un agujero de gusano."
    };

    const entry = await localStore.saveLocalEntryWithMovie(
      501,
      { onWatchlist: true, rating: 9 },
      mockMovie
    );

    assert.equal(entry.movieId, 501);
    assert.equal(entry.onWatchlist, true);
    assert.equal(entry.rating, 9);

    const cached = await localStore.getCachedMovie(501);
    assert.ok(cached, "La película debe existir en cached_movies");
    assert.equal(cached.title, "Interstellar");
    assert.equal(cached.year, 2014);
    assert.ok(cached.cachedAt > 0);
  });

  test("saveCachedMovies guarda en lote y getCachedMoviesByIds recupera por ID", async () => {
    const movies = [
      { id: 601, title: "Alien", year: 1979 },
      { id: 602, title: "Blade Runner", year: 1982 }
    ];

    await localStore.saveCachedMovies(movies);

    const map = await localStore.getCachedMoviesByIds([601, 602, 999]);
    assert.equal(map.size, 2);
    assert.equal(map.get(601)?.title, "Alien");
    assert.equal(map.get(602)?.title, "Blade Runner");
    assert.equal(map.has(999), false);
  });

  test("getLocalMyListResponse sirve instantáneamente películas desde cached_movies", async () => {
    stateModule.setUserMovieData({
      "701": { onWatchlist: true, rating: null },
      "702": { onWatchlist: false, rating: 8 }
    });

    await localStore.saveCachedMovies([
      { id: 701, title: "Dune", year: 2021, type: "movie" },
      { id: 702, title: "Arrival", year: 2016, type: "movie" }
    ]);

    const resWatchlist = await apiModule.getLocalMyListResponse(
      { myList: "watchlist" },
      1,
      10,
      true
    );

    assert.ok(resWatchlist);
    assert.equal(resWatchlist.total, 1);
    assert.equal(resWatchlist.items.length, 1);
    assert.equal(resWatchlist.items[0].id, 701);
    assert.equal(resWatchlist.items[0].title, "Dune");

    const resRated = await apiModule.getLocalMyListResponse(
      { myList: "rated" },
      1,
      10,
      true
    );

    assert.ok(resRated);
    assert.equal(resRated.total, 1);
    assert.equal(resRated.items[0].id, 702);
    assert.equal(resRated.items[0].title, "Arrival");
  });

  test("getLocalMyListResponse auto-hidrata desde IndexedDB si la memoria está vacía (arranque en frío / F5)", async () => {
    stateModule.clearUserMovieData();

    await localStore.saveLocalEntry(801, { onWatchlist: true, rating: null });
    await localStore.saveCachedMovies([
      { id: 801, title: "Solaris", year: 1972, type: "movie" }
    ]);

    const res = await apiModule.getLocalMyListResponse(
      { myList: "watchlist" },
      1,
      10,
      true
    );

    assert.ok(res);
    assert.equal(res.total, 1);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, 801);
    assert.equal(res.items[0].title, "Solaris");

    assert.ok(stateModule.getAllUserMovieData()["801"]);
  });

  test("pruneOldCachedMovies respeta el Escudo de Inmunidad (Pinning Shield) protegiendo películas del usuario", async () => {
    // 1. Guardamos una película en user_entries (en la colección activa del usuario: con rating o en watchlist)
    await localStore.saveLocalEntry(901, { rating: 10, onWatchlist: false });

    // 2. Guardamos 3 películas en cached_movies con diferentes fechas de caché
    // Película 901 (antigua, pero protegida por estar en la colección del usuario)
    // Película 902 (antigua, no protegida)
    // Película 903 (reciente, no protegida)
    await localStore.saveCachedMovies([
      { id: 901, title: "El Padrino", year: 1972 },
      { id: 902, title: "Pulp Fiction", year: 1994 },
      { id: 903, title: "Matrix", year: 1999 }
    ]);

    // Forzamos timestamps controlados en cached_movies para verificar orden LRU
    const db = await localStore.openLocalDB();
    await new Promise((resolve) => {
      const tx = db.transaction("cached_movies", "readwrite");
      const store = tx.objectStore("cached_movies");
      store.put({ id: 901, title: "El Padrino", year: 1972, cachedAt: 100 });
      store.put({ id: 902, title: "Pulp Fiction", year: 1994, cachedAt: 200 });
      store.put({ id: 903, title: "Matrix", year: 1999, cachedAt: 300 });
      tx.oncomplete = resolve;
    });

    // Purgamos con límite = 2. Con 3 películas, excess = 1.
    // La película más antigua es la 901 (cachedAt 100), pero tiene Escudo de Inmunidad.
    // Por tanto, debe ser omitida y debe purgarse la 902 (cachedAt 200).
    await localStore.pruneOldCachedMovies(2);

    const m901 = await localStore.getCachedMovie(901);
    const m902 = await localStore.getCachedMovie(902);
    const m903 = await localStore.getCachedMovie(903);

    assert.ok(m901, "La película 901 (en colección) debe preservarse intacta por el Escudo de Inmunidad");
    assert.equal(m902, null, "La película 902 (antigua y no protegida) debe haber sido purgada");
    assert.ok(m903, "La película 903 (reciente) debe preservarse");

    // Caso 2: Si todas las películas restantes en el almacén están protegidas por el usuario,
    // la purga no debe eliminar ninguna aunque se supere el límite
    await localStore.saveLocalEntry(903, { rating: null, onWatchlist: true });
    await localStore.pruneOldCachedMovies(1); // límite 1 cuando hay 2 películas protegidas (901 y 903)

    const final901 = await localStore.getCachedMovie(901);
    const final903 = await localStore.getCachedMovie(903);
    assert.ok(final901, "901 sigue protegida");
    assert.ok(final903, "903 sigue protegida por estar en watchlist");
  });

  test("revalidateMyListInBackground fusiona entradas remotas como 'synced' y no deja pendientes 'dirty'", async () => {
    stateModule.clearUserMovieData();
    const supabase = await apiModule.getSupabase();
    const origFrom = supabase.from;

    // Simular respuesta de Supabase con entrada remota de usuario
    supabase.from = () => {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                order: () => ({
                  range: async () => ({
                    data: [
                      {
                        id: 999,
                        title: "El Padrino",
                        slug: "el-padrino-1972",
                        year: 1972,
                        user_movie_entries: [
                          { user_id: "user-123", rating: 10, on_watchlist: false, updated_at: new Date().toISOString() }
                        ]
                      }
                    ],
                    error: null,
                    count: 1
                  })
                })
              })
            })
          })
        })
      };
    };

    try {
      const currentLocalRes = { total: 0, items: [] };

      apiModule.revalidateMyListInBackground(
        "user-123",
        { myList: "rated" },
        1,
        10,
        true,
        currentLocalRes
      );

      // Esperar a que se resuelva la revalidación en segundo plano (setTimeout 50ms + async)
      await new Promise(r => setTimeout(r, 120));

      // 1. La entrada debe existir en IndexedDB
      const entry = await localStore.getLocalEntry(999);
      assert.ok(entry, "La entrada 999 debe haberse persistido en IndexedDB");
      assert.equal(entry.rating, 10);
      assert.equal(entry.syncStatus, "synced", "La entrada que viene de Supabase DEBE guardarse como 'synced', jamás 'dirty'");

      // 2. getPendingSyncEntries NO debe tener entradas pendientes
      const pending = await localStore.getPendingSyncEntries();
      assert.equal(pending.length, 0, "No debe haber entradas pendientes de sincronizar tras revalidar");

      // 3. El estado en memoria debe estar actualizado
      const memData = stateModule.getAllUserMovieData();
      assert.equal(memData["999"]?.rating, 10);
    } finally {
      supabase.from = origFrom;
    }
  });

  test("syncManager.initSyncListeners registra y devuelve cleanup idempotentemente", () => {
    const cleanup = syncManagerModule.initSyncListeners();
    assert.equal(typeof cleanup, "function");
    cleanup();
  });

  test("syncManager.initSyncListeners escucha SYNC_PENDING_ENTRIES del Service Worker y lo desuscribe en cleanup", () => {
    const { teardown } = setupGlobalDom({ fallbackCreate: true });
    let swMessageListener = null;

    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: {
        addEventListener: (event, handler) => {
          if (event === "message") swMessageListener = handler;
        },
        removeEventListener: (event, handler) => {
          if (event === "message" && swMessageListener === handler) {
            swMessageListener = null;
          }
        }
      },
      configurable: true,
      writable: true
    });

    try {
      const cleanup = syncManagerModule.initSyncListeners();
      assert.equal(typeof swMessageListener, "function", "Debe registrar un listener de message en navigator.serviceWorker");

      // Simular mensaje de Background Sync del Service Worker
      swMessageListener({ data: { type: "SYNC_PENDING_ENTRIES" } });

      cleanup();
      assert.equal(swMessageListener, null, "Cleanup debe retirar el listener de navigator.serviceWorker");
    } finally {
      delete globalThis.navigator.serviceWorker;
      teardown();
    }
  });
});
