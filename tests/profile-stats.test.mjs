import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

import { createMockDomElement, setupGlobalDom } from "./helpers/mock-dom.mjs";
import { createMockIndexedDB } from "./helpers/mock-indexeddb.mjs";

function setupMockProfileDom() {
  const domMap = {};
  const ids = [
    "profile-overlay", "profile-modal", "profile-modal-close", "profile-avatar-large", "profile-modal-title",
    "profile-stat-watchlist-count", "profile-stat-rated-count", "profile-stat-average-stars", "profile-stat-stars-text",
    "profile-breakdown-container", "profile-btn-explore-watchlist", "profile-btn-explore-rated", "profile-password-form",
    "profile-new-password", "profile-password-toggle", "profile-password-strength", "profile-security-message",
    "profile-password-submit-btn", "profile-sync-dot", "profile-sync-text", "profile-btn-force-sync",
    "profile-btn-export-csv", "profile-btn-logout", "profile-btn-delete-account", "profile-danger-zone",
    "profile-btn-cancel-delete", "profile-btn-confirm-delete", "profile-delete-message",
  ];
  ids.forEach((id) => {
    domMap[id] = createMockDomElement("div", {
      id,
      hidden: true,
      children: [
        { style: {}, lastElementChild: { style: {} } },
        { style: {}, lastElementChild: { style: {} } },
        { style: {}, lastElementChild: { style: {} } },
      ],
    });
  });

  const prevIDB = globalThis.indexedDB;
  globalThis.indexedDB = createMockIndexedDB();

  const { teardown: domTeardown } = setupGlobalDom({ elementMap: domMap });

  return {
    domMap,
    teardown: () => {
      globalThis.indexedDB = prevIDB;
      domTeardown();
    },
  };
}

describe("Panel de Perfil de Usuario y Estadísticas Cinemáticas (profile.ts)", () => {
  let viteEnv;
  let profileModule;
  let stateModule;
  let apiModule;
  let localStoreModule;

  before(async () => {
    viteEnv = await startViteSsrServer([
      "/src/js/components/profile.ts",
      "/src/js/state.ts",
      "/src/js/api.ts",
      "/src/js/localStore.ts"
    ]);
    [profileModule, stateModule, apiModule, localStoreModule] = viteEnv.modules;
  });

  after(async () => {
    if (viteEnv) await viteEnv.close();
  });

  test("computeUserMovieStats maneja catálogos vacíos sin NaN ni divisiones por cero", () => {
    const stats = profileModule.computeUserMovieStats({});

    assert.equal(stats.watchlistCount, 0);
    assert.equal(stats.ratedCount, 0);
    assert.equal(stats.averageStars, null);
    assert.equal(stats.formattedStars, "Sin valoraciones");

    assert.equal(stats.breakdown.level3.count, 0);
    assert.equal(stats.breakdown.level3.percentage, 0);
    assert.equal(stats.breakdown.level2.count, 0);
    assert.equal(stats.breakdown.level2.percentage, 0);
    assert.equal(stats.breakdown.level1.count, 0);
    assert.equal(stats.breakdown.level1.percentage, 0);
    assert.equal(stats.breakdown.level0.count, 0);
    assert.equal(stats.breakdown.level0.percentage, 0);
  });

  test("computeUserMovieStats calcula con exactitud estrellas, fracción y desglose sin etiquetas académicas", () => {
    const mockData = {
      "1": { rating: 10, onWatchlist: false }, // 3 estrellas
      "2": { rating: 9, onWatchlist: false },  // 3 estrellas
      "3": { rating: 8, onWatchlist: false },  // 2 estrellas
      "4": { rating: 7, onWatchlist: false },  // 2 estrellas
      "5": { rating: 5, onWatchlist: false },  // 1 estrella
      "6": { rating: 2, onWatchlist: false },  // 0 estrellas (suspenso)
      "7": { rating: null, onWatchlist: true },
      "8": { rating: null, onWatchlist: true },
      "9": { rating: null, onWatchlist: false } // Entrada vacía / desmarcada
    };

    const stats = profileModule.computeUserMovieStats(mockData);

    assert.equal(stats.watchlistCount, 2, "Debe contar 2 películas activas en Watchlist");
    assert.equal(stats.ratedCount, 6, "Debe contar 6 películas con valoración");

    // Estrellas: 3 + 3 + 2 + 2 + 1 + 0 = 11 / 6 = 1.83
    assert.equal(stats.averageStars, 1.83, "El promedio de estrellas debe ser 1.83");
    assert.equal(stats.formattedStars, "1 ¾ estrellas", "Debe formatear en estrellas y fracción");

    // Verificar que NO existen etiquetas como 'Sobresaliente', 'Notable', etc.
    assert.ok(!stats.breakdown.level3.label.includes("Sobresaliente"));
    assert.ok(!stats.breakdown.level2.label.includes("Notable"));
    assert.ok(!stats.breakdown.level1.label.includes("Aprobado"));
    assert.ok(!stats.breakdown.level0.label.includes("Suspenso"));

    assert.equal(stats.breakdown.level3.label, "★★★ 3 estrellas");
    assert.equal(stats.breakdown.level2.label, "★★☆ 2 estrellas");
    assert.equal(stats.breakdown.level1.label, "★☆☆ 1 estrella");
    assert.equal(stats.breakdown.level0.label, "☆☆☆ 0 estrellas");

    // Conteos y porcentajes
    assert.equal(stats.breakdown.level3.count, 2);
    assert.equal(stats.breakdown.level3.percentage, 33);
    assert.equal(stats.breakdown.level2.count, 2);
    assert.equal(stats.breakdown.level2.percentage, 33);
    assert.equal(stats.breakdown.level1.count, 1);
    assert.equal(stats.breakdown.level1.percentage, 17);
    assert.equal(stats.breakdown.level0.count, 1);
    assert.equal(stats.breakdown.level0.percentage, 17);
  });

  test("formatStarFraction formatea con exactitud números enteros y fracciones de estrella", () => {
    assert.equal(profileModule.formatStarFraction(null), "Sin valoraciones");
    assert.equal(profileModule.formatStarFraction(0), "Sin valoraciones");
    assert.equal(profileModule.formatStarFraction(3), "3 estrellas");
    assert.equal(profileModule.formatStarFraction(2.5), "2 ½ estrellas");
    assert.equal(profileModule.formatStarFraction(2.72), "2 ¾ estrellas");
    assert.equal(profileModule.formatStarFraction(2.33), "2 ⅓ estrellas");
    assert.equal(profileModule.formatStarFraction(1.25), "1 ¼ estrellas");
    assert.equal(profileModule.formatStarFraction(2.0), "2 estrellas");
    assert.equal(profileModule.formatStarFraction(1.0), "1 estrella");
    assert.equal(profileModule.formatStarFraction(0.5), "½ estrella");
  });

  test("isProfileModalOpen devuelve false cuando el modal no existe o está oculto", () => {
    assert.equal(profileModule.isProfileModalOpen(), false);
  });

  test("computeUserMovieStats procesa fielmente catálogos masivos (>2.500 entradas) calculando nota sobre 10 y sobre 3", () => {
    // Simulamos la colección real del usuario: 2.886 entradas (2.844 votadas y 42 en watchlist)
    const massiveMockData = {};
    for (let i = 1; i <= 42; i++) {
      massiveMockData[`wl-${i}`] = { rating: null, onWatchlist: true };
    }
    for (let i = 1; i <= 2844; i++) {
      // Alternamos notas entre 6, 7, 8, 9, 10
      const rating = 6 + (i % 5);
      massiveMockData[`rated-${i}`] = { rating, onWatchlist: false };
    }

    const stats = profileModule.computeUserMovieStats(massiveMockData);

    assert.equal(stats.watchlistCount, 42, "Debe registrar con exactitud las 42 películas en watchlist");
    assert.equal(stats.ratedCount, 2844, "Debe registrar con exactitud las 2.844 películas votadas");
    assert.ok(stats.averageRating !== null && stats.averageRating >= 7 && stats.averageRating <= 9, "La nota media sobre 10 debe ser coherente");
    assert.ok(stats.averageStars !== null && stats.averageStars >= 1.5 && stats.averageStars <= 3, "El promedio de estrellas debe ser coherente");
    assert.equal(
      stats.breakdown.level3.count + stats.breakdown.level2.count + stats.breakdown.level1.count + stats.breakdown.level0.count,
      2844,
      "La suma de los desgloses por estrella debe ser exactamente igual al total de votadas"
    );
  });

  test("exportUserDataCsv y exportUserDataJson están disponibles como funciones de exportación", () => {
    assert.equal(typeof profileModule.exportUserDataCsv, "function");
    assert.equal(typeof profileModule.exportUserDataJson, "function");
  });

  test("deleteUserAccount está disponible y gestiona la baja del usuario capturando respuestas RPC", async () => {
    assert.equal(typeof profileModule.deleteUserAccount, "function");
    const result = await profileModule.deleteUserAccount();
    // En entorno mock de pruebas sin credenciales de BD, devuelve success: false con el error tipado
    assert.equal(result.success, false);
    assert.ok(typeof result.error === "string" && result.error.length > 0);
  });

  test("openProfileModal reconcilia incondicionalmente con mergeOnLogin cuando hay sesión activa aunque la caché local no esté vacía", async () => {
    const { domMap, teardown } = setupMockProfileDom();
    await localStoreModule.clearLocalStore().catch(() => {});

    // 1. Caché local previa NO vacía (ejemplo: 1 película de sesión anterior en portátil)
    stateModule.clearUserMovieData();
    stateModule.setUserMovieData({ "99": { rating: 6, onWatchlist: false } });
    assert.equal(Object.keys(stateModule.getAllUserMovieData()).length, 1);

    const supabase = await apiModule.getSupabase();
    const originalGetSession = supabase.auth.getSession;
    const originalFrom = supabase.from;
    let mergeOnLoginCalled = false;

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: "user_test_sync_profile", email: "tester@videoclub.digital" } } },
      error: null
    });

    supabase.from = (table) => {
      if (table === "user_movie_entries") {
        mergeOnLoginCalled = true;
        const q = {
          select: () => q, eq: () => q, order: () => q,
          range: async () => ({
            data: [
              { movie_id: 99, rating: 6, on_watchlist: false, updated_at: new Date().toISOString() },
              { movie_id: 101, rating: 10, on_watchlist: false, updated_at: new Date().toISOString() },
              { movie_id: 102, rating: null, on_watchlist: true, updated_at: new Date().toISOString() }
            ],
            error: null
          })
        };
        return q;
      }
      return originalFrom ? originalFrom(table) : null;
    };

    try {
      const cleanup = profileModule.setupProfileModal();
      await profileModule.openProfileModal();

      assert.equal(domMap["profile-modal"].hidden, false);
      assert.equal(domMap["profile-overlay"].hidden, false);
      assert.equal(domMap["profile-modal-title"].textContent, "tester@videoclub.digital");
      assert.equal(mergeOnLoginCalled, true, "openProfileModal debe invocar mergeOnLogin aunque getAllUserMovieData() no esté vacío");

      await new Promise((r) => setTimeout(r, 60));

      const entriesAfter = stateModule.getAllUserMovieData();
      assert.equal(Object.keys(entriesAfter).length, 3);
      assert.equal(entriesAfter["101"].rating, 10);
      assert.equal(entriesAfter["102"].onWatchlist, true);
      assert.equal(domMap["profile-stat-watchlist-count"].textContent, "1");
      assert.equal(domMap["profile-stat-rated-count"].textContent, "2");

      cleanup();
    } finally {
      await localStoreModule.clearLocalStore().catch(() => {});
      supabase.auth.getSession = originalGetSession;
      supabase.from = originalFrom;
      stateModule.clearUserMovieData();
      teardown();
    }
  });

  test("openProfileModal dispara mergeOnLogin y puebla estadísticas en arranque en frío (caché local vacía)", async () => {
    const { domMap, teardown } = setupMockProfileDom();
    await localStoreModule.clearLocalStore().catch(() => {});

    stateModule.clearUserMovieData();
    assert.equal(Object.keys(stateModule.getAllUserMovieData()).length, 0);

    const supabase = await apiModule.getSupabase();
    const originalGetSession = supabase.auth.getSession;
    const originalFrom = supabase.from;
    let mergeCalled = false;

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: "user_test_cold_start", email: "coldstart@videoclub.digital" } } },
      error: null
    });

    supabase.from = (table) => {
      if (table === "user_movie_entries") {
        mergeCalled = true;
        const q = {
          select: () => q, eq: () => q, order: () => q,
          range: async () => ({
            data: [{ movie_id: 301, rating: 8, on_watchlist: false, updated_at: new Date().toISOString() }],
            error: null
          })
        };
        return q;
      }
      return originalFrom ? originalFrom(table) : null;
    };

    try {
      const cleanup = profileModule.setupProfileModal();
      await profileModule.openProfileModal();

      assert.equal(mergeCalled, true);
      await new Promise((r) => setTimeout(r, 60));

      const entries = stateModule.getAllUserMovieData();
      assert.equal(Object.keys(entries).length, 1);
      assert.equal(entries["301"].rating, 8);
      assert.equal(domMap["profile-stat-rated-count"].textContent, "1");

      cleanup();
    } finally {
      await localStoreModule.clearLocalStore().catch(() => {});
      supabase.auth.getSession = originalGetSession;
      supabase.from = originalFrom;
      stateModule.clearUserMovieData();
      teardown();
    }
  });
});

