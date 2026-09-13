# VIDEOCLUB.DIGITAL - Project Context & Architecture

## 📌 Visión General

**videoclub.digital** es una Progressive Web App (PWA) móvil-first diseñada para explorar, filtrar y descubrir películas y series. Actúa como un "oráculo cinéfilo" con un motor de búsqueda y filtrado extremadamente rápido, integración de cuentas de usuario, y un enfoque obsesivo en el rendimiento web (60-120 FPS, optimización de CPU/GPU, y prevención de re-renders innecesarios).

## 🛠️ Stack Tecnológico

- **Frontend:** TypeScript (ES2022+), HTML5 Semántico, CSS3 (Variables, Grid, Flexbox, Container Queries).
- **Build Tool:** Vite (con esbuild y TypeScript para minificación y type-checking estricto).
- **Backend/Database:** Supabase (PostgreSQL 15+, PL/pgSQL RPC `search_movies_offset`, RLS, Trigram Indexes), Supabase Auth, Supabase Storage.
- **Edge SSR & CDN:** Cloudflare Worker (`cloudflare/worker.js`) con ESM bundle vía esbuild, proxy inmutable de imágenes (`/posters/*`, `/vips/*`), Edge SSR para SEO y negociación Markdown para agentes de IA.
- **PWA & Offline:** Service Worker propio (`sw.js`) inyectado dinámicamente con versión por timestamp en build time vía Vite, con estrategias de caché `CACHE_STATIC` y `CACHE_DYNAMIC` y `manifest.webmanifest`.
- **Arquitectura Local-First:** `localStore.ts` y `syncManager.ts` con estado de sincronización (`dirty`, `synced`, `deleted`), cola offline y resolución determinista *Last-Write-Wins* (LWW).
- **Dependencias Externas Clave:** `@supabase/supabase-js`, `lru-cache` (caché en memoria para búsquedas/filtros).

## 📂 Estructura del Proyecto

### 1. Archivos Raíz y Configuración

- `index.html`: Punto de entrada. Contiene el CSS crítico (_Above the Fold_), preloads, meta tags SEO, política CSP ajustada (sin directivas exclusivas de cabecera como `frame-ancestors`) y los `<template>` de los componentes para instanciación rápida.
- `vite.config.js`: Configurado para generar código moderno (`es2022`), minificación de CSS, separación de chunks (vendor, supabase) e inyección automática de versión de Service Worker (`injectSwVersion`).
- `public/404.html`: Fallback SPA para GitHub Pages. Intercepta rutas directas y recargas (`F5`) no coincidentes y redirige a la raíz preservando la ruta y query string mediante `?_p=` y `?_q=`.
- `public/sw.js`: Service Worker interceptor con versión inyectada dinámicamente (`vYYYYMMDDHHMM`), aislamiento estricto por origen (`url.origin === self.location.origin`) y estrategias:
  - _Network First_ (`CACHE_STATIC` para navegación HTML y App Shell).
  - _Stale-While-Revalidate_ (`CACHE_DYNAMIC` para assets estáticos JS/CSS con precacheo de `./index.html` y `./manifest.webmanifest` en `CRITICAL_ASSETS`; los iconos SVG viajan inlined en el DOM).
  - _Cache First_ (`CACHE_DYNAMIC` para pósters y fotos VIP proxyeadas con límite FIFO).
  - _Aislamiento de Origen Cruzado_: Los recursos alojados en `*.supabase.co` (fuentes Inter, Auth, RPC) fluyen directamente por red nativa sin ser interceptados por el SW, previniendo advertencias de colisión con `<link rel="preload">`.
  - Estrategia de invalidación documentada en `docs/service_worker_invalidation.md`.
- `cloudflare/worker.js`: Capa perimetral (*Edge Optimizer & Reverse Proxy*) desplegada delante de GitHub Pages:
  - Inyección de `Cache-Control: public, max-age=31536000, immutable` en bundles de Vite (`/assets/*`).
  - Proxy perimetral de imágenes (`/posters/*` y `/vips/*`) con reescritura hacia Supabase Storage para evitar consumo de egress.
  - Negociación de contenido Markdown (`Accept: text/markdown` $\to$ `/llms.txt`) y cabeceras de descubrimiento para agentes de IA (`Link: </llms.txt>; rel="alternate"`). Documentado en `cloudflare/README.md`.
  - Endpoint de purga selectiva perimetral (`POST /internal/purge`) protegido estrictamente mediante variable de entorno secreta `PURGE_SECRET` (sin fallbacks hardcodeados en código; devuelve `500 Server misconfigured` si el secreto no está configurado).

### 2. Módulos Compartidos SSOT (`src/shared/`)

- **`slugs.ts`**: Fuente Única de Verdad para slugs canónicos. Mapea y normaliza los 21 géneros canónicos oficiales (`GENRE_SLUG_MAP`), el catálogo oficial de países (`COUNTRY_SLUG_MAP`), estudios, colecciones y personas. La resolución de sinónimos temáticos y multilingües de búsqueda se delega dinámicamente a PostgreSQL (`genres.synonyms`).
- **`constants.ts`**: Constantes globales compartidas, límites de años dinámicos y taxonomías.
- **`formatters.ts`**: Funciones puras de formateo, puntuación y normalización de texto.

### 3. Frontend TS (`src/js/`)

Arquitectura modular con tipado estricto (TypeScript), funciones puras, delegación de eventos y sincronización local-first.

- **`main.ts`**: Orquestador principal. Maneja el scroll global (Batched Reads/Writes para evitar _Layout Thrashing_), hidratación inicial y la orquestación de la carga de la cuadrícula (`loadAndRenderMovies`) con secuencia determinista (Estado $\to$ URL $\to$ SEO $\to$ Fetch $\to$ Render).
- **`state.ts`**: Gestor de estado global inmutable. Sincroniza la URL (_Pretty Paths_ y QueryParams) con el estado de la aplicación (`activeFilters`, `currentPage`, `userMovieData`), y ejecuta `canonicalizeCurrentUrl()` para garantizar URLs canónicas estrictas.
- **`contracts.ts`**: Definición central de contratos de datos, códigos de error (`ERROR_CODES`), detección unificada del base path (`getAppBasePath()`), generación de URLs canónicas de filtros (`buildFilterUrl`), guardas de tipos y normalizadores puros de bajo nivel (`parseYearRangeRaw`, `normalizeMovieId`).
- **`api.ts`**: Capa de acceso a datos. Implementa deduplicación de peticiones (_In-flight requests_), `AbortController` para cancelar consultas obsoletas, memoria LRU (`queryCache`, `suggestionsCache`, `personCache`) y normalización de parámetros para el RPC `search_movies_offset`.
- **`localStore.ts`**: Almacenamiento local-first para notas y watchlist con marcas de estado (`dirty`, `synced`, `deleted`) y resolución determinista *Last-Write-Wins* (LWW) en reconciliación.
- **`syncManager.ts`**: Gestor de sincronización bidireccional en segundo plano entre el almacenamiento local y Supabase (`user_movie_entries`), con soporte offline y reintentos ante reconexión.
- **`offlineQueue.ts` / `checkedIds.ts`**: Cola persistente de mutaciones pendientes sin conexión y control de deduplicación de IDs sincronizados.
- **`ui.ts`**: Controladores genéricos del DOM. Maneja Toasts, esqueletos de carga (_Skeletons_), paginación y las trampas de foco (_Focus Trap_) para modales.
- **`seo.ts`**: Generador dinámico de `JSON-LD` (Schema.org), títulos, breadcrumbs, `og:url` y canonical tags siempre referenciados a la URL canónica pura vía `getCanonicalUrl()`.
- **`utils.ts`**: Herramientas puras de alto rendimiento. Incluye creadores de nodos DOM veloces (`createElement` vía `Object.assign`), normalización de texto (eliminación de acentos), formateadores y gestión segura de `localStorage`.
- **`constants.ts`**: Fuente única de la verdad. Almacena mapeos de clases CSS, selectores del DOM, SVG sprites integrados (`ICONS`), límites de paginación y mapeos de plataformas (Netflix, HBO, etc).
- **`auth.ts`**: Lógica de registro y login delegada a Supabase Auth.
- **`types.ts`**: Interfaces TypeScript centralizadas (`MappedMovie`, `ActiveFilters`, `UserMovieEntry`, `PersonDetails`, `VipData`).

### 4. Componentes TS (`src/js/components/`)

- **`card.ts`**: Renderizador masivo de la cuadrícula (_Grid_). Utiliza `yieldToMain` y fragmentos del DOM para instanciar el HTML por lotes y no congelar el hilo principal. Implementa **Getters Perezosos (*Lazy Getters*)** para resolver las plantillas `<template>` bajo demanda y prevenir condiciones de carrera en arranques limpios (*cold boot*). Controla interacciones hápticas y de _hover/flip_. Intercepta el botón de Watchlist exigiendo autenticación activa (`body.user-logged-in`); si no hay sesión, alerta con toast y despliega la modal de login (`openAuthModal()`). En el reverso, la jerarquía secuencial sitúa el título original (`.back-original-title-wrapper`) bajo las puntuaciones y la cabecera meta (duración, Wikipedia, JustWatch), unificando el criterio con la modal y renderizándolo **de forma incondicional** (siempre visible incluso si coincide con el título traducido). Cuenta con un **ritmo vertical e interlineado armónico** (`margin: 7px;`, separación de 13px respecto a IMDb mediante `margin-bottom: 4px` en ratings y `margin-top: 9px` en título, `padding-top: 7px;` en líneas divisorias, `line-height: 1.25` en título, `1.35` en detalles y `1.38` en sinopsis) que evita cualquier aglomeración de líneas. Los botones circulares `+` de reparto (`.actors-expand-btn`) y de sinopsis (`.expand-content-btn`) están alineados milimétricamente en la vertical derecha a 8px del margen. Al pulsar `+` en reparto se despliega el panel superpuesto (`.actors-scrollable-content`) con **Géneros interactivos arriba** y **Reparto de actores abajo**. Incorpora tarjetas especiales VIP para personas con soporte de **Insignias de Doble Rol** (`(D)` en ficha de actor, `(A)` en ficha de director) que permiten alternar su filmografía entre roles con un solo clic. El formato de edad para personas fallecidas sigue estrictamente la convención `"✝ (edad)"` (ej. `"✝ (74)"`). En desktop, las tarjetas VIP comparten la micro-animación de elevación primaveral (`transform: translateY(-4px) scale(1.01)`) suprimiendo el recuadro perimetral (*outline*). Las banderas de país son interactivas (`<a>` con `[data-country-name]`) y aplican el filtro de país directamente.
- **`modal.ts`**: Vista rápida (_Quick View_). Implementa modal flotante en dos columnas con scroll vertical independiente en escritorio y móvil apaisado (_landscape_), y formato _Bottom Sheet_ en móviles verticales con física de arrastre (_swipe-to-dismiss_) y _View Transitions API_ para el efecto _Hero_ desde la tarjeta. Los enlaces dentro de la modal (géneros, países, directores, actores, año, insignias de rol cruzado) son interactivos y cierran automáticamente la modal al aplicarse.
- **`profile.ts`**: Panel de perfil de usuario y estadísticas cinemáticas en tiempo real. Procesa catálogos masivos (>2.500 entradas), calculando media sobre 10 y sobre 3 estrellas, desglose por franjas de valoración, distribución por géneros, exportación de datos en formato CSV/JSON y baja de cuenta vía RPC.
- **`sidebar.ts`**: Menú lateral de filtrado avanzado. Incluye autocompletado en tiempo real con guardias de longitud mínima (`>= 2`), debouncing y soporte bidireccional para **colectivos y dúos cinematográficos** (ej. buscar "Hermanos Russo" sugiere a Joe y Anthony Russo, y viceversa), control de rango con slider, acordeones CSS nativos y gestos de _swipe_ para abrir/cerrar. Los ítems seleccionados en los 4 desplegables (género, país, director, actor) se destacan con **alto contraste** en modo claro (`#1e293b`) y modo oscuro (`#334155`) con texto blanco `#ffffff !important` y borde acentuado. Implementa reconciliación de píldoras DOM y exclusiones visuales (`(NO País) x`).
- **`rating.ts`**: Lógica visual del sistema de puntuación por estrellas y lógica de votación de usuario (optimista), manteniendo la exclusividad mutua con la Watchlist. Exige inicio de sesión previo (`body.user-logged-in`) para cualquier interacción o mutación (ratón, teclado, foco o nota en muro): en ausencia de sesión, no previsualiza el llenado ni anima en hover/active, bloquea la mutación local/remota, notifica vía toast informativo e invoca automáticamente la modal de autenticación (`openAuthModal()`).
- **`yearSlider.ts`**: Componente nativo de control de rango de años doble (_DualRangeSlider_) con soporte táctil, arrastre fluido de pivotes, cálculos precisos de porcentaje y sin dependencias externas.

### 5. Capa Perimetral y Edge SSR (`cloudflare/`)

- **Propósito**: Renderizado en el servidor perimetral (*Edge SSR*) y optimización de entrega sin latencia de origen ni consumo de egress.
- **Tecnología**: Cloudflare Workers (ESM bundle vía esbuild).
- **Rutas Servidas en Edge SSR**:
  - `/titulo/:slug/`: Ficha completa accesible con modal nativo, enlaces canónicos en géneros (`/genero/:slug/`), directores y reparto, Schema.org Movie/TVSeries, Breadcrumbs y normalización case-insensitive 301.
  - `/:vip-slug/`: Ficha VIP oficial de director o actor con tarjeta dedicada `#0`, foto `/vips/:slug.webp`, biografía con giro 3D y filmografía destacada en cuadrícula (evaluación perezosa *lazy* de tarjetas por rol).
  - `/genero/:slug/`, `/pais/:slug/`, `/estudio/:slug/`, `/seleccion/:slug/`: Muros de taxonomía cerrada con 42 tarjetas oficiales.
  - Reverso de tarjeta en Edge SSR: idéntico visualmente a la SPA; el título original se ubica bajo las puntuaciones y actúa como enlace a la ficha (`.back-original-title-link`), la sinopsis fluye con degradado hasta la base, los botones `+` se alinean milimétricamente a 8px del margen derecho y el botón `−` permite cerrar tanto el panel de reparto como la sinopsis expandida elevándose a `z-index: 60`.
- **Coherencia de Tema Claro / Oscuro**: Script anti-flicker síncrono en `<head>` (0 ms) que sincroniza `localStorage` y cookie `theme=...`, junto al botón interactivo `#theme-toggle` en todas las cabeceras perimetrales.
- **Filosofía VIP = Fuente Editorial**: `VIP_SLUGS` actúa estrictamente como filtro de enrutamiento perimetral en tiempo constante $O(1)$ para decidir si una ruta raíz intenta resolverse como ficha SEO VIP; los datos editoriales siempre proceden de Supabase (SSOT), quedando terminantemente prohibido almacenar fichas dentro del manifiesto.
- **Pipeline de Preparación de Artefactos**: `npm run prepare:worker` genera deterministamente el manifiesto VIP (`generate-vip-manifest.mjs`) y el CSS perimetral en memoria (`build-seo-css.mjs`), integrándose de forma atómica en `build:worker` y `deploy:worker`.

### 6. Scripts de Automatización y Generación (`scripts/`)

- **`build-seo-css.mjs`**: Compila y minifica el CSS perimetral unificado (`public/seo-card-v7.min.css` y `cloudflare/seo/seo-card-css.js`).
- **`generate-vip-manifest.mjs`**: Genera el índice en memoria de personas VIP (`cloudflare/seo/vip-manifest.js`) a partir de `people.vip = 1` en Supabase.
- **`generate-sitemap.mjs`**: Genera sitemaps canónicos (`public/sitemap.xml` y `public/sitemap-index.xml`) con más de 15.000 URLs indexables.
- **`generate-llms.mjs`**: Genera especificaciones canónicas para agentes de IA (`public/llms.txt` y `public/llms-full.txt`).
- **`run-data-tests.mjs`**: Runner de auditoría declarativa DataOps contra PostgreSQL (`run_data_tests`).
- **`sync-sprites.mjs`**: Herramienta de sincronización de SVG sprites hacia `public/sprite.svg`.

### 7. Estilos (`src/css/`)

- **`variables.css`**: Design tokens. Fuentes (Inter), paleta de colores adaptable (Tema Claro/Oscuro dinámico con tokens como `--color-rating-star` y `--color-accent-darker`) y duraciones de animación (_Quiet Luxury easing_).
- **`globals.css`**: Reset, utilidades generales y scrollbars personalizados.
- **`layout.css`**: Estructura macro basada en Container Queries (`container-type: inline-size`), cabecera fija elástica (`position: sticky; top: 0;`) y CSS Grid para la cuadrícula principal adaptativa.
- **`components/*.css`**: CSS scopeado a componentes. Uso intensivo de `contain: layout paint style` y `content-visibility: auto` para máximo rendimiento. Evita transicionar propiedades pesadas (`width`, `padding`) en móviles, priorizando `transform` y `opacity` (GPU).

### 8. Suite de Tests (`tests/`)

- Ejecución centralizada mediante el test runner nativo de Node.js (`node --test`), totalizando **162 tests automatizados en 30 suites** sin dependencias externas pesadas.
- **`tests/helpers/vite-ssr.mjs`**: Helper unificado `startViteSsrServer()` que arranca el entorno Vite en modo SSR de forma aislada para evaluar módulos TypeScript directamente.
- **Batería de Pruebas (10 suites de test activas)**:
  - `url-contract.test.mjs`: Test formal del contrato de URLs (jerarquía canónica, lectura agnóstica al orden, reglas de exclusividad semántica y las 10 filas de la Tabla 4 de URLs prohibidas/normalizadas).
  - `worker.test.mjs`: Smoke test exhaustivo del Cloudflare Worker (Edge SSR de títulos con enlaces de género, taxonomías, personas VIP en la raíz, normalización case-insensitive 301, proxy perimetral de imágenes con `immutable`, inyección de cabecera `Link rel="alternate"` y negociación Markdown para agentes).
  - `profile-stats.test.mjs`: Panel de perfil, estadísticas cinemáticas, cálculo de notas/estrellas, exportación CSV/JSON y reconciliación de sesión (`openProfileModal` con `mergeOnLogin`).
  - `contracts-state-utils.test.mjs`: Contratos de datos, formato canónico de edad de fallecidos `✝ (74)`, tipos de error, paridad de slugs y normalizadores puros.
  - `api-rating-critical.test.mjs`: Normalización de parámetros RPC, claves de caché canónicas, discriminación de directores y conversión de notas a estrellas en tarjetas.
  - `pure-functions.test.mjs`: Funciones puras de formateo, puntuación y equivalencia SPA vs. SSR.
  - `shared-and-events.test.mjs`: Integridad del SSOT de constantes, taxonomías compartidas y ciclo de vida del bus de eventos sin fugas de memoria.
  - `lifecycle-dispose.test.mjs`: Ciclo de vida y funciones de desmontaje explícito (`disposeApp`, `disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`) para prevenir memory leaks.
  - `local-first-sync.test.mjs`: Arquitectura local-first (`localStore.ts`, `syncManager.ts`), resolución LWW, persistencia de estados (`dirty`/`synced`/`deleted`) y reconciliación remota.
  - `llms-spec.test.mjs`: Verificación de la especificación de rutas canónicas en `llms.txt` y `llms-full.txt` frente a las taxonomías oficiales.

## 💾 Backend y Base de Datos (PostgreSQL / Supabase)

### Tablas Principales

- `movies`: Núcleo central. Identificador inmutable `id` (`PRIMARY KEY`), metadatos, valoraciones (FA, IMDb, y `avg_rating` calculada automáticamente) y campos de vectores de texto (`_tsv`) para búsqueda rápida.
- `actors`, `directors`: Entidades de los VIPs.
- Relaciones N:M: `movie_actors`, `movie_directors`, `movie_genres`, `movie_selections`, `movie_studios`.
- `user_movie_entries`: Almacena las valoraciones (1-10) y la Watchlist (boolean) por usuario con exclusividad mutua.
- Tablas `_staging`: Usadas para el proceso ETL (ingesta masiva desde CSV con datos consolidados completos) mediante la función diferencial `process_staging_data()`. La columna `show IS TRUE` actúa como filtro de admisión (gatekeeper) para la carga al catálogo consolidado cruzando por clave primaria inmutable `id`.

### Lógica Avanzada SQL (`docs/script.sql`, `docs/schema.sql` y `docs/data_tests.sql`)

- **Columnas Generadas (`GENERATED ALWAYS AS ... STORED`)**: Usadas para calcular campos `tsvector` de búsqueda en tiempo de inserción, descargando al procesador durante las consultas `SELECT`. También se usa para normalizar textos (`unaccent`).
- **Índices y Operadores Cualificados**:
  - Índices GIN con Trigramas cualificados (`extensions.gin_trgm_ops`) para autocompletado ultra-rápido en nombres de actores, directores y componentes de colectivos.
  - Índices compuestos para consultas habituales (Ej: `country_id, type, year DESC`).
- **Vistas Materializadas (`mv_*`)**: Caché pre-calculada de las sugerencias del buscador para no saturar la CPU de la base de datos contando películas. Auto-convergencia segura con `RESTRICT` e índices dedicados.
- **RPC Principal (`search_movies_offset`)**: Función PL/pgSQL responsable de toda la lógica de filtrado del backend.
  - **Late Row Lookup**: Ordena solo IDs y métricas ligeras con **desempate determinista (`m.id ASC`)** para evitar saltos entre páginas, y _luego_ hace JOIN con textos pesados (sinopsis, arrays) y empaqueta en JSON puro (`json_build_object`).
  - **Daily Showcase Adaptativo (Alternativa 2)**: Para el orden `"relevance,asc"`, baraja 378 películas en la portada limpia, y en filtros específicos aplica una ventana proporcional según el volumen de títulos: Top 12 (< 50 títulos), Top 24 (50..200 títulos) o Top 42 (> 200 títulos), ordenando el resto de forma 100% estricta por `relevance ASC`. Búsquedas y personas VIP quedan excluidas de barajado.
  - **Compensación de Personas con Guiones (Fases 3.6 y 3.7)**: Al recibir nombres transformados a espacios desde el frontend (`slugToPersonQuery`), el SQL compensa mediante reconstrucción contra el índice `slug` y un fallback alfanumérico estricto (`regexp_replace(name_norm, '[^a-z0-9]', '', 'g')`), garantizando que nombres como "Daniel Day-Lewis" o "Jean-Luc Godard" casen siempre sin importar la pérdida del guion en URL.
- **ETL Diferencial de Alto Rendimiento (`process_staging_data`)**: Pipeline transaccional con tabla temporal en memoria (`tmp_affected_staging`), cruce por clave primaria inmutable `id` (`ON CONFLICT (id) DO UPDATE`), admisión por `show IS TRUE` y **pre-agregación lineal $O(N_1 + N_2 + ...)$** que elimina la multiplicación por producto cartesiano en relaciones N:M.
- **DataOps Quality Gate (`run_data_tests`)**: Suite declarativa inspirada en dbt ejecutada nativamente en PostgreSQL, integrada en GitHub Actions ([`.github/workflows/deploy.yml`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/.github/workflows/deploy.yml)) mediante [`scripts/run-data-tests.mjs`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/scripts/run-data-tests.mjs).
- **Seguridad (RLS & DCL)**: Row Level Security habilitado en todas las tablas. Lectura pública general; `user_movie_entries` protegida con política unificada `FOR ALL` al `auth.uid()`; tablas de staging restringidas exclusivamente a `service_role` mediante DCL (`REVOKE ALL`).
- **`search_path` Seguro**: Fijado estrictamente en todas las funciones `SECURITY DEFINER` (`SET search_path = pg_catalog, public, extensions, pg_temp;`).

## ⚡ Patrones de Rendimiento y Arquitectura (Performance)

1. **Prevención de Layout Thrashing:**
   Separación estricta de las lecturas del DOM (ej. `.offsetHeight`, `.scrollY`) de las escrituras del DOM (ej. `.classList.add`). Se orquesta con `requestAnimationFrame` en el scroll.
2. **DOM Lazy Loading:**
   Las secciones pesadas como el listado completo de actores en la parte trasera de una tarjeta no se renderizan al crear la tarjeta. Se insertan dinámicamente mediante `DocumentFragment` solo cuando el usuario pulsa "Ver Reparto".
3. **In-Flight Deduplication & AbortControllers:**
   Si el usuario pulsa repetidamente un filtro, las peticiones HTTP previas se abortan automáticamente para evitar sobrecarga de red y _race conditions_ visuales.
4. **View Transitions API:**
   Animaciones nativas para transicionar del grid a la vista de detalle, con fallback seguro para navegadores antiguos.
5. **Aislamiento de Renderizado CSS:**
   Uso intensivo de la propiedad `contain` y `will-change: transform` para evitar que las animaciones locales provoquen recálculos globales en la pantalla.
6. **Gestión de Ciclo de Vida y Limpieza de Memoria (Teardown):**
   Todos los módulos (`card.ts`, `modal.ts`, `sidebar.ts`, `main.ts`) implementan funciones de desmontaje explícito (`disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`, `disposeMainEvents`, `disposeApp`) y un bus de eventos global con desuscripción limpia (`appEvents.off`, `appEvents.clearAll`) para prevenir _memory leaks_ y listeners huérfanos.
