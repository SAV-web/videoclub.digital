import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";

let viteEnv;
let checkedIdsModule;
let ratingModule;
let stateModule;

before(async () => {
  viteEnv = await startViteSsrServer([
    "/src/js/checkedIds.ts",
    "/src/js/components/rating.ts",
    "/src/js/state.js",
  ]);
  [checkedIdsModule, ratingModule, stateModule] = viteEnv.modules;
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
});
