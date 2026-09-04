import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

describe("Panel de Perfil de Usuario y Estadísticas Cinemáticas (profile.ts)", () => {
  let viteEnv;
  let profileModule;

  before(async () => {
    viteEnv = await startViteSsrServer(["/src/js/components/profile.ts"]);
    [profileModule] = viteEnv.modules;
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
});
