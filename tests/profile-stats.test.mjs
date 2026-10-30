import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

import { createMockDomElement, setupGlobalDom } from "./helpers/mock-dom.mjs";
import { createMockIndexedDB } from "./helpers/mock-indexeddb.mjs";

function setupMockProfileDom() {
  const domMap = {};
  const ids = [
    "profile-overlay", "profile-modal", "profile-modal-close", "profile-avatar-large", "profile-modal-title",
    "profile-stat-watchlist-count", "profile-stat-rated-count", "profile-stat-average-stars",
    "profile-breakdown-container", "profile-btn-explore-watchlist", "profile-btn-explore-rated", "profile-password-form",
    "profile-new-password", "profile-password-toggle", "profile-password-strength", "profile-security-message",
    "profile-password-submit-btn", "profile-sync-dot", "profile-sync-text", "profile-btn-force-sync",
    "profile-btn-export-csv", "profile-btn-import-csv", "profile-csv-file-input", "profile-btn-logout", "profile-btn-delete-account", "profile-danger-zone",
    "profile-btn-cancel-delete", "profile-btn-confirm-delete", "profile-delete-message",
  ];
  ids.forEach((id) => {
    domMap[id] = createMockDomElement("div", {
      id,
      hidden: true,
      reset: () => {},
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
  let authModule;

  before(async () => {
    viteEnv = await startViteSsrServer([
      "/src/js/components/profile.ts",
      "/src/js/state.ts",
      "/src/js/api.ts",
      "/src/js/localStore.ts",
      "/src/js/auth.ts"
    ]);
    [profileModule, stateModule, apiModule, localStoreModule, authModule] = viteEnv.modules;
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

  test("exportUserDataCsv está disponible como función de exportación", () => {
    assert.equal(typeof profileModule.exportUserDataCsv, "function");
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

  test("updatePassword delega en supabase.auth.updateUser con la contraseña indicada", async () => {
    const supabase = await apiModule.getSupabase();
    const originalUpdateUser = supabase.auth.updateUser;
    let capturedParam = null;

    supabase.auth.updateUser = async (param) => {
      capturedParam = param;
      return { data: { user: { id: "test-user-id" } }, error: null };
    };

    try {
      const res = await authModule.updatePassword("nueva-clave-segura-123");
      assert.deepEqual(capturedParam, { password: "nueva-clave-segura-123" });
      assert.equal(res.error, null);
      assert.equal(res.data.user.id, "test-user-id");
    } finally {
      supabase.auth.updateUser = originalUpdateUser;
    }
  });

  test("setupProfileModal: rechaza contraseñas menores de 8 caracteres antes de invocar a Supabase", async () => {
    const { domMap, teardown } = setupMockProfileDom();
    const supabase = await apiModule.getSupabase();
    const originalUpdateUser = supabase.auth.updateUser;
    let updateUserCalled = false;

    supabase.auth.updateUser = async () => {
      updateUserCalled = true;
      return { data: null, error: null };
    };

    try {
      const cleanup = profileModule.setupProfileModal();

      domMap["profile-new-password"].value = "12345"; // < 8 caracteres
      domMap["profile-password-form"].dispatchEvent({ type: "submit", preventDefault: () => {} });

      assert.equal(updateUserCalled, false, "No debe invocar updateUser si la contraseña tiene menos de 8 caracteres");
      assert.equal(domMap["profile-security-message"].hidden, false);
      assert.equal(domMap["profile-security-message"].textContent, "La contraseña debe tener al menos 8 caracteres.");
      assert.ok(domMap["profile-security-message"].className.includes("auth-message--error"));

      cleanup();
    } finally {
      supabase.auth.updateUser = originalUpdateUser;
      teardown();
    }
  });

  test("setupProfileModal: actualiza la contraseña con éxito y limpia el formulario", async () => {
    const { domMap, teardown } = setupMockProfileDom();
    const supabase = await apiModule.getSupabase();
    const originalUpdateUser = supabase.auth.updateUser;
    let updatedPayload = null;

    supabase.auth.updateUser = async (payload) => {
      updatedPayload = payload;
      return { data: { user: { id: "user-123" } }, error: null };
    };

    try {
      const cleanup = profileModule.setupProfileModal();

      domMap["profile-new-password"].value = "ContraseñaValida!2026";
      let formResetCalled = false;
      domMap["profile-password-form"].reset = () => {
        formResetCalled = true;
      };

      domMap["profile-password-form"].dispatchEvent({ type: "submit", preventDefault: () => {} });

      // Esperar resolución de microtareas asíncronas
      await new Promise((r) => setTimeout(r, 30));

      assert.deepEqual(updatedPayload, { password: "ContraseñaValida!2026" });
      assert.equal(domMap["profile-security-message"].hidden, false);
      assert.equal(domMap["profile-security-message"].textContent, "¡Contraseña actualizada con éxito!");
      assert.ok(domMap["profile-security-message"].className.includes("auth-message--success"));
      assert.equal(formResetCalled, true, "El formulario debe resetearse tras actualizar la contraseña");
      assert.equal(domMap["profile-password-submit-btn"].disabled, false);
      assert.equal(domMap["profile-password-submit-btn"].textContent, "Actualizar Contraseña");

      cleanup();
    } finally {
      supabase.auth.updateUser = originalUpdateUser;
      teardown();
    }
  });

  test("setupProfileModal: gestiona errores devueltos por Supabase y muestra mensaje descriptivo", async () => {
    const { domMap, teardown } = setupMockProfileDom();
    const supabase = await apiModule.getSupabase();
    const originalUpdateUser = supabase.auth.updateUser;

    supabase.auth.updateUser = async () => {
      return { data: null, error: new Error("Sesión expirada. Inicia sesión de nuevo.") };
    };

    try {
      const cleanup = profileModule.setupProfileModal();

      domMap["profile-new-password"].value = "NuevaPassValida888";
      domMap["profile-password-form"].dispatchEvent({ type: "submit", preventDefault: () => {} });

      await new Promise((r) => setTimeout(r, 30));

      assert.equal(domMap["profile-security-message"].hidden, false);
      assert.equal(domMap["profile-security-message"].textContent, "Sesión expirada. Inicia sesión de nuevo.");
      assert.ok(domMap["profile-security-message"].className.includes("auth-message--error"));
      assert.equal(domMap["profile-password-submit-btn"].disabled, false);
      assert.equal(domMap["profile-password-submit-btn"].textContent, "Actualizar Contraseña");

      cleanup();
    } finally {
      supabase.auth.updateUser = originalUpdateUser;
      teardown();
    }
  });

  test("setupProfileModal: medidor de fuerza de contraseñas aplica reglas NIST y actualiza DOM", () => {
    const { domMap, teardown } = setupMockProfileDom();
    try {
      // 1. Contrato directo de evaluatePasswordStrength (NIST SP 800-63B)
      assert.deepEqual(authModule.evaluatePasswordStrength(""), { score: 0, label: "" });
      assert.deepEqual(authModule.evaluatePasswordStrength("corta"), { score: 1, label: "Muy corta (mín. 8)" });
      
      const robust = authModule.evaluatePasswordStrength("Xk9#mP$2026!zWqL");
      assert.equal(robust.score, 4);
      assert.equal(robust.label, "Muy robusta");

      const penalized = authModule.evaluatePasswordStrength("videoclub12345");
      assert.ok(penalized.score <= 2);

      // 2. Comportamiento interactivo en el DOM del modal de perfil
      const cleanup = profileModule.setupProfileModal();
      const input = domMap["profile-new-password"];
      const meter = domMap["profile-password-strength"];
      const labelEl = createMockDomElement("span", { className: "strength-label" });
      const progressEl = createMockDomElement("div", { className: "strength-bars" });
      meter.children = [labelEl, progressEl];
      meter.querySelector = (sel) => {
        if (sel === ".strength-label") return labelEl;
        if (sel === ".strength-bars") return progressEl;
        return null;
      };

      // Input con contraseña corta
      input.value = "abc";
      input.dispatchEvent({ type: "input" });
      assert.equal(meter.hidden, false);
      assert.equal(meter.getAttribute("data-strength"), "1");
      assert.equal(labelEl.textContent, "Muy corta (mín. 8)");
      assert.equal(progressEl.getAttribute("aria-valuenow"), "1");

      // Input con contraseña robusta
      input.value = "Xk9#mP$2026!zWqL";
      input.dispatchEvent({ type: "input" });
      assert.equal(meter.getAttribute("data-strength"), "4");
      assert.equal(labelEl.textContent, "Muy robusta");
      assert.equal(progressEl.getAttribute("aria-valuenow"), "4");

      // Input vaciado
      input.value = "";
      input.dispatchEvent({ type: "input" });
      assert.equal(meter.hidden, true);
      assert.equal(meter.getAttribute("data-strength"), null);
      assert.equal(labelEl.textContent, "");
      assert.equal(progressEl.getAttribute("aria-valuenow"), "0");

      cleanup();
    } finally {
      teardown();
    }
  });

  test("setupProfileModal: bindBottomSheetSwipeToDismiss conecta gestos táctiles de arrastre y desmonta limpiamente", () => {
    const { domMap, teardown } = setupMockProfileDom();
    try {
      const cleanup = profileModule.setupProfileModal();
      const modal = domMap["profile-modal"];
      
      // Simulación de interacción táctil móvil
      modal.dispatchEvent({ type: "touchstart", touches: [{ clientX: 100, clientY: 100 }] });
      modal.dispatchEvent({ type: "touchmove", touches: [{ clientX: 100, clientY: 250 }], cancelable: true, preventDefault: () => {} });
      modal.dispatchEvent({ type: "touchend" });

      // Verificación de desmontaje sin fugas
      cleanup();
    } finally {
      teardown();
    }
  });

  test("parseCsvRows: parsea correctamente cabeceras, valores entrecomillados y saltos CRLF", () => {
    const csv = '\uFEFFID,Título,Mi Valoración (1-10),En Pendientes\r\n101,"Pulp Fiction",10,No\r\n102,"Alien, el octavo pasajero",,Sí\r\n103,"Dune: Parte ""Dos""",8,No';
    const rows = profileModule.parseCsvRows(csv);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ["ID", "Título", "Mi Valoración (1-10)", "En Pendientes"]);
    assert.equal(rows[1][0], "101");
    assert.equal(rows[1][1], "Pulp Fiction");
    assert.equal(rows[1][2], "10");
    assert.equal(rows[1][3], "No");

    assert.equal(rows[2][0], "102");
    assert.equal(rows[2][1], "Alien, el octavo pasajero");
    assert.equal(rows[2][2], "");
    assert.equal(rows[2][3], "Sí");

    assert.equal(rows[3][0], "103");
    assert.equal(rows[3][1], 'Dune: Parte "Dos"');
    assert.equal(rows[3][2], "8");
    assert.equal(rows[3][3], "No");
  });

  test("importUserDataCsv: procesa archivo CSV nativo, respeta exclusividad e hidrata estado de usuario", async () => {
    const { teardown } = setupMockProfileDom();
    try {
      const csvContent = [
        "ID,Título,Mi Valoración (1-10),En Pendientes",
        '501,"Ciudadano Kane",10,No',
        '502,"Vértigo",,Sí',
        '503,"Centauros del desierto",9,Sí',
        'invalid,"Película rota",10,No',
      ].join("\r\n");

      const file = {
        name: "videoclub-coleccion-2026-10-28.csv",
        type: "text/csv",
        size: csvContent.length,
        text: async () => csvContent,
      };

      await profileModule.importUserDataCsv(file);

      const all = stateModule.getAllUserMovieData();
      assert.deepEqual(all["501"], { rating: 10, onWatchlist: false });
      assert.deepEqual(all["502"], { rating: null, onWatchlist: true });
      assert.deepEqual(all["503"], { rating: 9, onWatchlist: false }, "Debe excluir de pendientes si tiene nota");
      assert.equal(all["invalid"], undefined, "No debe importar filas con ID inválido");
    } finally {
      teardown();
    }
  });
});

