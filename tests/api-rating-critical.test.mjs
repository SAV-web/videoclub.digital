import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let checkedIdsModule;
let ratingModule;
let stateModule;
let offlineQueueModule;
let uiModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/checkedIds.ts",
    "/src/js/components/rating.ts",
    "/src/js/state.ts",
    "/src/js/offlineQueue.ts",
    "/src/js/ui.ts"
  ]);
  [checkedIdsModule, ratingModule, stateModule, offlineQueueModule, uiModule] = viteEnv.modules;
});


after(async () => {
  await viteEnv?.close();
});

describe("checkedIds.ts (Gestión de Caché de Películas Consultadas)", () => {
  test("marca IDs como consultados y permite verificar/limpiar el estado", () => {
    checkedIdsModule.clearCheckedUserMovieIds();

    assert.equal(checkedIdsModule.isMovieIdChecked("12345"), false);
    assert.equal(checkedIdsModule.isMovieIdChecked(12345), false);

    checkedIdsModule.markMovieIdAsChecked("12345");
    assert.equal(checkedIdsModule.isMovieIdChecked("12345"), true);
    assert.equal(checkedIdsModule.isMovieIdChecked(12345), true);

    checkedIdsModule.clearCheckedUserMovieIds();
    assert.equal(checkedIdsModule.isMovieIdChecked("12345"), false);
  });
});

describe("rating.ts (Lógica de Valoración y Exclusividad Watchlist)", () => {
  test("resolveNextRating cicla correctamente el nivel 1 (suspenso -> aprobado -> limpiar)", () => {
    // Sin nota previa + Clic en nivel 1 -> 2 (suspenso)
    assert.equal(ratingModule.resolveNextRating(null, 1), 2);

    // Nota actual = 2 + Clic en nivel 1 -> 5 (aprobado)
    assert.equal(ratingModule.resolveNextRating(2, 1), 5);

    // Nota actual = 5 + Clic en nivel 1 -> null (desmarcar)
    assert.equal(ratingModule.resolveNextRating(5, 1), null);
  });

  test("resolveWatchlistMutationOnRate elimina automáticamente de watchlist al valorar", () => {
    // Al asignar una nota (ej. 8), se desmarca de watchlist (retorna false)
    assert.equal(ratingModule.resolveWatchlistMutationOnRate(8), false);

    // Al quitar la nota (null), no altera la watchlist (retorna undefined)
    assert.equal(ratingModule.resolveWatchlistMutationOnRate(null), undefined);
  });

  test("resolveRatingMutationOnWatchlist borra la nota asignada al añadir a la lista de pendientes", () => {
    // Al marcar como pendiente (true), borra automáticamente la nota (retorna null)
    assert.equal(ratingModule.resolveRatingMutationOnWatchlist(true), null);

    // Al desmarcar de pendientes (false), no muta la nota (retorna undefined)
    assert.equal(ratingModule.resolveRatingMutationOnWatchlist(false), undefined);
  });

  test("handleRatingClick sin usuario logueado emite toast 'Identifícate para votar' y no abre modal de autenticación", async () => {
    const { setupGlobalDom, createMockDomElement } = await import("./helpers/mock-dom.mjs");
    const toastContainer = createMockDomElement("div", { id: "toast-container" });
    const authModal = createMockDomElement("div", { id: "auth-modal" });
    authModal.hidden = true;

    const { teardown } = setupGlobalDom({
      elementMap: {
        "toast-container": toastContainer,
        "auth-modal": authModal,
      },
      fallbackCreate: true,
    });

    try {
      globalThis.document.body.classList.remove("is-logged-in");

      const mockStar = createMockDomElement("svg");
      mockStar.classList.add("star-icon");
      mockStar.dataset.ratingLevel = "1";
      mockStar.closest = (sel) => {
        if (sel.includes("star-icon")) return mockStar;
        return null;
      };

      const mockEvent = {
        target: mockStar,
        preventDefault: () => {},
        stopPropagation: () => {},
      };

      const mockCard = createMockDomElement("article");
      mockCard.classList.add("movie-card");
      mockCard.dataset.movieId = "101";

      const handled = ratingModule.handleRatingClick(mockEvent, mockCard);
      assert.equal(handled, true, "El evento de clic debe ser interceptado y manejado");

      // Comprobar que se ha insertado el mensaje emergente en el toastContainer
      assert.ok(toastContainer.children.length > 0, "Debe crearse un elemento toast en el contenedor");
      const toastEl = toastContainer.children[0];
      assert.ok(toastEl.classList.contains("toast--info"), "El toast debe ser de tipo info");
      const textSpan = toastEl.children[0];
      assert.equal(textSpan.textContent, "Identifícate para votar", "El texto debe ser exactamente 'Identifícate para votar'");

      // Comprobar que la modal de autenticación permanece cerrada
      assert.equal(uiModule.isAuthModalOpen(), false, "La modal de autenticación NO debe abrirse");
    } finally {
      teardown();
    }
  });
});

describe("offlineQueue.ts (Background Sync y Cola Offline)", () => {
  test("expone las funciones de encolado, sincronización e inicialización", () => {
    assert.equal(typeof offlineQueueModule.enqueueOfflineEntry, "function");
    assert.equal(typeof offlineQueueModule.getPendingEntries, "function");
    assert.equal(typeof offlineQueueModule.removePendingEntry, "function");
    assert.equal(typeof offlineQueueModule.syncPendingEntries, "function");
    assert.equal(typeof offlineQueueModule.initOfflineSync, "function");
    assert.equal(typeof offlineQueueModule.requestBackgroundSync, "function");
  });

  test("initOfflineSync registra y devuelve cleanup idempotentemente", () => {
    const cleanup = offlineQueueModule.initOfflineSync();
    assert.equal(typeof cleanup, "function");
    cleanup();
  });
});

describe("Badging API y Contador de Watchlist", () => {
  test("getWatchlistCount calcula el total de películas en watchlist con precisión", () => {
    stateModule.clearUserMovieData();
    assert.equal(stateModule.getWatchlistCount(), 0);

    stateModule.updateUserDataForMovie(101, { onWatchlist: true, rating: null });
    stateModule.updateUserDataForMovie(102, { onWatchlist: false, rating: 8 });
    stateModule.updateUserDataForMovie(103, { onWatchlist: true, rating: null });

    assert.equal(stateModule.getWatchlistCount(), 2);

    stateModule.updateUserDataForMovie(101, { onWatchlist: false });
    assert.equal(stateModule.getWatchlistCount(), 1);

    stateModule.clearUserMovieData();
    assert.equal(stateModule.getWatchlistCount(), 0);
  });

  test("updateAppBadge y clearAppBadge se ejecutan con degradación segura sin romper en SSR/Node", async () => {
    assert.equal(typeof uiModule.updateAppBadge, "function");
    assert.equal(typeof uiModule.clearAppBadge, "function");

    // Ejecución segura en Node sin navigator.setAppBadge
    await uiModule.updateAppBadge();
    await uiModule.clearAppBadge();

    let lastSetBadge = null;
    let clearedBadge = false;

    Object.defineProperty(globalThis.navigator, "setAppBadge", {
      value: async (count) => { lastSetBadge = count; },
      configurable: true,
      writable: true
    });
    Object.defineProperty(globalThis.navigator, "clearAppBadge", {
      value: async () => { clearedBadge = true; },
      configurable: true,
      writable: true
    });

    try {
      stateModule.clearUserMovieData();
      stateModule.updateUserDataForMovie(201, { onWatchlist: true });
      stateModule.updateUserDataForMovie(202, { onWatchlist: true });

      await uiModule.updateAppBadge();
      assert.equal(lastSetBadge, 2);

      stateModule.clearUserMovieData();
      await uiModule.updateAppBadge();
      assert.equal(clearedBadge, true);

      clearedBadge = false;
      await uiModule.clearAppBadge();
      assert.equal(clearedBadge, true);
    } finally {
      delete globalThis.navigator.setAppBadge;
      delete globalThis.navigator.clearAppBadge;
    }
  });
});

describe("ui.ts (Notificaciones Toast y Utilidades de UI)", () => {
  test("showToast se ejecuta de forma segura con degradación en SSR/Node", () => {
    assert.equal(typeof uiModule.showToast, "function");
    assert.doesNotThrow(() => {
      uiModule.showToast("Nueva versión disponible", "info", {
        label: "Actualizar",
        onClick: () => {}
      });
    });
  });
});

