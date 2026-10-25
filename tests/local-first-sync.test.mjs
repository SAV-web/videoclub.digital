import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

import { createMockIndexedDB } from "./helpers/mock-indexeddb.mjs";

describe("Local-First Architecture (localStore.ts y syncManager.ts)", () => {
  let viteEnv;
  let localStore;
  let mockIDB;
  let apiModule;
  let stateModule;

  before(async () => {
    mockIDB = createMockIndexedDB();
    globalThis.indexedDB = mockIDB;

    viteEnv = await startViteSsrServer([
      "/src/js/localStore.ts",
      "/src/js/api.ts",
      "/src/js/state.ts"
    ]);
    [localStore, apiModule, stateModule] = viteEnv.modules;
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
});
