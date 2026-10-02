import assert from "node:assert/strict";
import { test, describe, before, after, beforeEach } from "node:test";
import { startViteSsrServer } from "./helpers/vite-ssr.mjs";
import { createMockDomElement, setupGlobalDom } from "./helpers/mock-dom.mjs";

let domTeardown;
let viteEnv;
let apiModule;
let renderEngineModule;
let stateModule;
let constantsModule;
let contractsModule;
let utilsModule;

// Contenedores simulados para renderEngine y UI
let gridContainer;
let paginationContainer;
let headerPrevBtn;
let headerNextBtn;

before(async () => {
  gridContainer = createMockDomElement("main", { id: "grid-container" });
  paginationContainer = createMockDomElement("nav", { id: "pagination-container" });
  headerPrevBtn = createMockDomElement("button", { id: "header-prev-btn" });
  headerNextBtn = createMockDomElement("button", { id: "header-next-btn" });

  const cardTemplate = createMockDomElement("template", { id: "movie-card-template" });
  const cardNode = createMockDomElement("div", { className: "movie-card" });
  cardTemplate.content.appendChild(cardNode);

  const domSetup = setupGlobalDom({
    elementMap: {
      "grid-container": gridContainer,
      "#grid-container": gridContainer,
      "pagination-container": paginationContainer,
      "#pagination-container": paginationContainer,
      "header-prev-btn": headerPrevBtn,
      "#header-prev-btn": headerPrevBtn,
      "header-next-btn": headerNextBtn,
      "#header-next-btn": headerNextBtn,
      "movie-card-template": cardTemplate,
      "#movie-card-template": cardTemplate,
    },
    fallbackCreate: true,
  });
  domTeardown = domSetup.teardown;

  // Insertar en document.body para satisfacer document.body.contains(container)
  globalThis.document.body.appendChild(gridContainer);
  globalThis.document.body.appendChild(paginationContainer);

  // Mock de scrollTo para window
  globalThis.window.scrollTo = () => {};

  viteEnv = await startViteSsrServer([
    "/src/js/constants.ts",
    "/src/js/contracts.ts",
    "/src/js/utils.ts",
    "/src/js/state.ts",
    "/src/js/api.ts",
    "/src/js/renderEngine.ts",
  ]);

  [
    constantsModule,
    contractsModule,
    utilsModule,
    stateModule,
    apiModule,
    renderEngineModule,
  ] = viteEnv.modules;
});

after(async () => {
  utilsModule?.createAbortableRequest("movie-grid-load")?.abort();
  await new Promise((r) => setTimeout(r, 20));
  await viteEnv?.close();
  // No llamamos domTeardown para evitar null pointers con timers residuales de Node
});

beforeEach(() => {
  utilsModule?.createAbortableRequest("movie-grid-load")?.abort();
  stateModule.resetFiltersState();
  stateModule.setCurrentPage(1);
  stateModule.setTotalMovies(0);
  apiModule.queryCache.clear();
  gridContainer.textContent = "";
  gridContainer.className = "grid-container";
  gridContainer.removeAttribute("aria-busy");
  paginationContainer.textContent = "";
  headerPrevBtn.disabled = true;
  headerNextBtn.disabled = true;
});

function createRpcPromise(data) {
  const p = Promise.resolve(data);
  p.abortSignal = () => p;
  return p;
}

describe("RenderEngine & API: Matriz VIP / Personas y Paginación", () => {
  test("persona VIP + página 1: determina hasVip=true, pide firstPageLimit-1 y offset 0", async () => {
    const supabase = await apiModule.getSupabase();
    let rpcCalls = [];

    // Mock de supabase.from('people') retornando persona VIP (vip = 1)
    supabase.from = (table) => {
      if (table === "people") {
        const queryObj = {
          select: () => queryObj,
          in: () => queryObj,
          or: () => queryObj,
          ilike: () => queryObj,
          limit: () =>
            Promise.resolve({
              data: [
                {
                  id: 101,
                  name: "Quentin Tarantino",
                  name_norm: "quentin tarantino",
                  slug: "quentin-tarantino",
                  type: "D",
                  vip: 1,
                  birthday: "1963-03-27",
                  thumbhash_st: "data:image/png;base64,dummy",
                },
              ],
              error: null,
            }),
        };
        return queryObj;
      }
      return { select: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) };
    };

    // Mock de supabase.rpc interceptando search_movies_offset
    supabase.rpc = (name, params) => {
      rpcCalls.push({ name, params });
      return createRpcPromise({
        data: {
          total: -1,
          items: Array.from({ length: 41 }, (_, i) => ({
            id: i + 1,
            title: `Pelicula ${i + 1}`,
            slug: `pelicula-${i + 1}`,
            year: 2000 + i,
          })),
        },
        error: null,
      });
    };

    stateModule.setFilter("director", "Quentin Tarantino");

    await renderEngineModule.loadAndRenderMovies(1);

    // Debe haberse llamado a search_movies_offset con límite dinámico - 1 (firstPageLimit - 1) y offset 0
    assert.equal(rpcCalls.length >= 1, true, "Debe llamar al catálogo");
    const firstCall = rpcCalls[0];
    const expectedVipLimit = constantsModule.CONFIG.DYNAMIC_PAGE_SIZE_LIMIT - 1;
    assert.equal(firstCall.params.page_limit, expectedVipLimit, `En pág 1 para VIP el page_limit debe ser ${expectedVipLimit} (firstPageLimit - 1)`);
    assert.equal(firstCall.params.page_offset, 0, "En pág 1 el offset debe ser 0");
    assert.equal(firstCall.params.get_count, false, "En camino crítico get_count debe ser false");
  });

  test("persona NO VIP + página 1: determina hasVip=false, pide firstPageLimit completo (42) y offset 0", async () => {
    const supabase = await apiModule.getSupabase();
    let rpcCalls = [];

    // Mock de supabase.from('people') retornando persona NO VIP (vip = 0, sin birthday)
    supabase.from = (table) => {
      if (table === "people") {
        const queryObj = {
          select: () => queryObj,
          in: () => queryObj,
          or: () => queryObj,
          ilike: () => queryObj,
          limit: () =>
            Promise.resolve({
              data: [
                {
                  id: 202,
                  name: "Director Novel",
                  name_norm: "director novel",
                  slug: "director-novel",
                  type: "D",
                  vip: 0,
                  birthday: null,
                  thumbhash_st: null,
                },
              ],
              error: null,
            }),
        };
        return queryObj;
      }
      return { select: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) };
    };

    supabase.rpc = (name, params) => {
      rpcCalls.push({ name, params });
      return createRpcPromise({
        data: {
          total: -1,
          items: Array.from({ length: 42 }, (_, i) => ({
            id: i + 100,
            title: `Pelicula Indie ${i + 1}`,
            slug: `pelicula-indie-${i + 1}`,
            year: 2010 + i,
          })),
        },
        error: null,
      });
    };

    stateModule.setFilter("director", "Director Novel");

    await renderEngineModule.loadAndRenderMovies(1);

    assert.equal(rpcCalls.length >= 1, true, "Debe llamar al catálogo");
    const firstCall = rpcCalls[0];
    const expectedNoVipLimit = constantsModule.CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;
    assert.equal(firstCall.params.page_limit, expectedNoVipLimit, `En pág 1 para NO VIP el page_limit debe ser ${expectedNoVipLimit} completo`);
    assert.equal(firstCall.params.page_offset, 0, "En pág 1 el offset debe ser 0");
    assert.equal(firstCall.params.get_count, false, "En camino crítico get_count debe ser false");
  });

  test("persona VIP + página 2: calcula offset con decremento -1 ((page - 1) * basePageSize - 1)", async () => {
    const supabase = await apiModule.getSupabase();
    let rpcCalls = [];

    supabase.from = (table) => {
      if (table === "people") {
        const queryObj = {
          select: () => queryObj,
          in: () => queryObj,
          or: () => queryObj,
          ilike: () => queryObj,
          limit: () =>
            Promise.resolve({
              data: [
                {
                  id: 101,
                  name: "Christopher Nolan",
                  name_norm: "christopher nolan",
                  slug: "christopher-nolan",
                  type: "D",
                  vip: 1,
                  birthday: "1970-07-30",
                },
              ],
              error: null,
            }),
        };
        return queryObj;
      }
      return { select: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) };
    };

    supabase.rpc = (name, params) => {
      rpcCalls.push({ name, params });
      return createRpcPromise({
        data: {
          total: -1,
          items: Array.from({ length: 44 }, (_, i) => ({
            id: i + 200,
            title: `Nolan P2 ${i}`,
            slug: `nolan-p2-${i}`,
          })),
        },
        error: null,
      });
    };

    stateModule.setFilter("director", "Christopher Nolan");

    await renderEngineModule.loadAndRenderMovies(2);

    assert.equal(rpcCalls.length >= 1, true, "Debe llamar al catálogo");
    const firstCall = rpcCalls[0];
    // Con basePageSize = 42: (2 - 1) * 42 - 1 = 41
    assert.equal(firstCall.params.page_offset, 41, "En pág 2 VIP el offset debe tener el -1 (41)");
    assert.equal(firstCall.params.page_limit, 44, "fetchLimit en página 2 incluye margen +2 (42 + 2 = 44)");
  });

  test("persona NO VIP + página 2: calcula offset sin decremento ((page - 1) * basePageSize) evitando duplicados", async () => {
    const supabase = await apiModule.getSupabase();
    let rpcCalls = [];

    supabase.from = (table) => {
      if (table === "people") {
        const queryObj = {
          select: () => queryObj,
          in: () => queryObj,
          or: () => queryObj,
          ilike: () => queryObj,
          limit: () =>
            Promise.resolve({
              data: [
                {
                  id: 303,
                  name: "Actor Secundario",
                  name_norm: "actor secundario",
                  slug: "actor-secundario",
                  type: "A",
                  vip: 0,
                  birthday: null,
                },
              ],
              error: null,
            }),
        };
        return queryObj;
      }
      return { select: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) };
    };

    supabase.rpc = (name, params) => {
      rpcCalls.push({ name, params });
      return createRpcPromise({
        data: {
          total: -1,
          items: Array.from({ length: 44 }, (_, i) => ({
            id: i + 300,
            title: `Secundario P2 ${i}`,
            slug: `secundario-p2-${i}`,
          })),
        },
        error: null,
      });
    };

    stateModule.setFilter("actor", "Actor Secundario");

    await renderEngineModule.loadAndRenderMovies(2);

    assert.equal(rpcCalls.length >= 1, true, "Debe llamar al catálogo");
    const firstCall = rpcCalls[0];
    // Con basePageSize = 42: (2 - 1) * 42 = 42 (sin el -1)
    assert.equal(firstCall.params.page_offset, 42, "En pág 2 NO VIP el offset debe ser exactamente 42 sin restar 1");
    assert.equal(firstCall.params.page_limit, 44, "fetchLimit en página 2 incluye margen +2 (42 + 2 = 44)");
  });
});

describe("RenderEngine & API: Desacoplamiento de Conteo (Pintar Primero → Contar Después)", () => {
  test("count=false → render inmediato y liberación de estado visual sin esperar al count", async () => {
    const supabase = await apiModule.getSupabase();

    let countResolve;
    const countPromise = new Promise((resolve) => {
      countResolve = resolve;
    });

    supabase.from = () => ({
      select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });

    supabase.rpc = (name, params) => {
      if (params.get_count === false) {
        // Respuesta inmediata del catálogo (página completa para activar conteo secundario)
        return createRpcPromise({
          data: {
            total: -1,
            items: Array.from({ length: constantsModule.CONFIG.DYNAMIC_PAGE_SIZE_LIMIT }, (_, i) => ({
              id: i + 500,
              title: `Rápida ${i}`,
              slug: `rapida-${i}`,
            })),
          },
          error: null,
        });
      } else {
        // Conteo secundario diferido
        const p = countPromise.then(() => ({
          data: {
            total: 1250,
            items: [],
          },
          error: null,
        }));
        p.abortSignal = () => p;
        return p;
      }
    };

    stateModule.setFilter("genre", "accion");

    // loadAndRenderMovies debe resolver inmediatamente tras pintar el catálogo sin esperar a countPromise
    const loadPromise = renderEngineModule.loadAndRenderMovies(1);
    await loadPromise;

    // Verificar que el grid ya está pintado y que is-fetching y aria-busy se retiraron de inmediato
    assert.equal(gridContainer.children.length > 0, true, "El grid debe contener tarjetas pintadas");
    assert.equal(gridContainer.classList.contains("is-fetching"), false, "is-fetching NO debe estar activo en el grid");
    assert.equal(gridContainer.getAttribute("aria-busy"), "false", "aria-busy debe ser 'false'");
    assert.equal(globalThis.document.body.classList.contains("is-fetching"), false, "body no debe tener is-fetching");

    // Liberamos el conteo en background
    countResolve();
    await new Promise((r) => setTimeout(r, 20));
  });

  test("count posterior → actualización atómica de totales y paginación sin reconstruir el grid", async () => {
    const supabase = await apiModule.getSupabase();
    let countResolve;

    supabase.from = () => ({
      select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });

    supabase.rpc = (name, params) => {
      if (params.get_count === false) {
        return createRpcPromise({
          data: {
            total: -1,
            items: Array.from({ length: constantsModule.CONFIG.DYNAMIC_PAGE_SIZE_LIMIT }, (_, i) => ({
              id: i + 600,
              title: `Catálogo ${i}`,
              slug: `catalogo-${i}`,
            })),
          },
          error: null,
        });
      } else {
        const p = new Promise((resolve) => {
          countResolve = () =>
            resolve({
              data: {
                total: 840,
                items: [],
              },
              error: null,
            });
        });
        p.abortSignal = () => p;
        return p;
      }
    };

    stateModule.setFilter("genre", "drama");

    await renderEngineModule.loadAndRenderMovies(1);

    // Guardamos referencia al primer elemento de tarjeta antes de que se resuelva el count
    const firstCardBefore = gridContainer.children[0];
    const initialCardsCount = gridContainer.children.length;

    // Estado antes de resolver count: total provisional = -1
    assert.equal(stateModule.getTotalMovies(), -1, "El total inicial es provisional (-1)");

    // Disparamos la resolución del conteo secundario
    countResolve();

    // Damos una vuelta al bucle de eventos para procesar el .then del camino secundario
    await new Promise((r) => setTimeout(r, 50));

    // Comprobamos que el total se ha actualizado correctamente en el estado
    assert.equal(stateModule.getTotalMovies(), 840, "El total debe actualizarse a 840");

    // Comprobamos que las tarjetas en el DOM NO se reconstruyeron (cero flicker, misma referencia)
    assert.equal(gridContainer.children.length, initialCardsCount, "El número de tarjetas debe permanecer intacto");
    assert.equal(gridContainer.children[0], firstCardBefore, "La referencia al elemento card debe ser idéntica (cero re-render)");

    // Comprobamos que la paginación se ha dibujado para 840 películas (840 / 42 = 20 páginas)
    assert.equal(paginationContainer.children.length > 0, true, "La paginación debe haberse renderizado tras el count");
  });
});

describe("RenderEngine & API: Concurrencia, In-Flight y AbortSignal", () => {
  test("count en vuelo + segunda petición: solicitud con count=true asciende respuesta sin quedarse en -1", async () => {
    const supabase = await apiModule.getSupabase();
    let rpcCallCount = 0;

    supabase.from = () => ({
      select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });

    supabase.rpc = (name, params) => {
      rpcCallCount++;
      if (params.get_count === false) {
        // Simula respuesta con delay de petición sin count
        const p = new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: {
                total: -1,
                items: [{ id: 701, title: "Test InFlight", slug: "test-inflight" }],
              },
              error: null,
            });
          }, 30);
        });
        p.abortSignal = () => p;
        return p;
      } else {
        // Respuesta con count
        return createRpcPromise({
          data: {
            total: 350,
            items: [{ id: 701, title: "Test InFlight", slug: "test-inflight" }],
          },
          error: null,
        });
      }
    };

    const filters = { genre: "comedia" };

    // Petición 1: se lanza con requestCount = false
    const promiseNoCount = apiModule.fetchMovies(filters, 1, 42, null, false, 0);

    // Petición 2: se lanza para la misma clave con requestCount = true mientras P1 está en vuelo
    const promiseWithCount = apiModule.fetchMovies(filters, 1, 42, null, true, 0);

    const [res1, res2] = await Promise.all([promiseNoCount, promiseWithCount]);

    assert.equal(res1.total, -1, "Petición 1 devuelve total = -1");
    assert.equal(res2.total, 350, "Petición 2 debe detectar total < 0 y ascender a consulta real con count (350)");
  });

  test("navegación mientras count está pendiente: descarta el resultado del count abortado y no muta el nuevo estado", async () => {
    const supabase = await apiModule.getSupabase();
    let countResolve;

    supabase.from = () => ({
      select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });

    supabase.rpc = (name, params) => {
      if (params.get_count === false) {
        return createRpcPromise({
          data: {
            total: -1,
            items: Array.from({ length: constantsModule.CONFIG.DYNAMIC_PAGE_SIZE_LIMIT }, (_, i) => ({
              id: 800 + i,
              title: `Peli Inicial ${i}`,
              slug: `peli-inicial-${i}`,
            })),
          },
          error: null,
        });
      } else {
        const p = new Promise((resolve) => {
          countResolve = () =>
            resolve({
              data: {
                total: 9999, // Conteo obsoleto de la vista previa
                items: [],
              },
              error: null,
            });
        });
        p.abortSignal = () => p;
        return p;
      }
    };

    stateModule.setFilter("genre", "terror");

    // Primera carga (camino crítico se resuelve, conteo queda pendiente)
    await renderEngineModule.loadAndRenderMovies(1);

    // Usuario navega rápidamente a otro filtro, cambiando el estado y abortando la petición previa
    stateModule.setFilter("genre", "animacion");
    stateModule.setTotalMovies(42); // Estado legítimo de la nueva navegación

    // El controlador de abortable request para "movie-grid-load" genera nueva señal y aborta la anterior
    const abortCtrl = utilsModule.createAbortableRequest("movie-grid-load");
    abortCtrl.abort();

    // Ahora se resuelve el conteo que había quedado colgado de la primera petición
    countResolve();
    await new Promise((r) => setTimeout(r, 50));

    // El estado del total NO debe haberse sobreescrito por el conteo obsoleto (9999)
    assert.notEqual(stateModule.getTotalMovies(), 9999, "El conteo abortado NO debe sobreescribir el total");
    assert.equal(stateModule.getTotalMovies(), 42, "El total del estado legítimo debe preservarse");
  });
});
