# Contratos del Sistema - VIDEOCLUB.DIGITAL

Este documento formaliza los **10 Contratos Normativos del Sistema**. Define las fronteras de datos, interfaces y reglas de negocio invariantes que deben respetar todas las capas de la aplicación: cliente SPA, capa perimetral Edge SSR (Cloudflare Workers) y backend relacional (PostgreSQL en Supabase).

> [!NOTE]
> La implementación ejecutable de estos contratos reside en [`src/js/contracts.ts`](file:///src/js/contracts.ts), [`src/js/types.ts`](file:///src/js/types.ts) y [`src/shared/`](file:///src/shared/).
> Para la evolución histórica y especificaciones de micro-interacciones previas, consultar [`docs/archive/CHANGELOG_MILESTONES.md`](file:///docs/archive/CHANGELOG_MILESTONES.md).

---

## 1. Contrato de Estado Global y Reactividad Canónica

El estado central de la aplicación (`AppState`) sigue esta estructura estricta:

```ts
interface AppState {
  currentPage: number;
  totalMovies: number;
  activeFilters: ActiveFilters;
  userMovieData: Record<number, UserMovieEntry>;
}
```

### Reglas Invariantes
1. **Normalización Defensiva:**
   - `currentPage` es siempre un entero positivo $\ge 1$. Si entra un valor inválido o $\le 0$, se normaliza a `1`.
   - `totalMovies` es siempre un entero $\ge -1$. El valor `-1` representa contractualmente *"total desconocido o en cómputo asíncrono"*.
   - `activeFilters` contiene siempre la totalidad de sus claves inicializadas; ningún consumidor asume filtros parciales.
2. **Inmutabilidad y Caché de Proxies (`state.ts`):**
   - `userMovieData` se indexa por `movieId` numérico.
   - Cada entrada `UserMovieEntry` se congela con `Object.freeze({ rating: number | null, onWatchlist: boolean })` mediante `normalizeUserMovieEntry`.
   - El motor reactivo (`makeReactive`) utiliza un `WeakMap` interno (`proxyCache`) para reutilizar referencias en $O(1)$, evitando la instanciación redundante de proxies durante iteraciones masivas de catálogo.
3. **Manejo Estándar de Errores (`AppError`):**
   - Todo error del sistema encapsula `{ name: "AppError", code: ERROR_CODES.*, message: string, cause?: unknown }`.
   - El código `ABORTED` identifica peticiones canceladas por concurrencia; el sistema descarta su propagación visual sin alertar al usuario.

---

## 2. Contrato Canónico de URLs y Jerarquía de Facetas

Toda URL en **videoclub.digital** responde a un estándar semántico legible (*Pretty URLs*) y predecible:

$$\text{https://videoclub.digital/}\{\text{persona}\}\text{/}\{\text{género}\}\text{/}\{\text{país}\}\text{/}\{\text{estudio o selección}\}\text{/}\{\text{no-género}\}\text{/}\{\text{no-país}\}\text{/}$$

### Reglas Invariantes
1. **Lectura Agnóstica al Orden (`parsePrettyPath`):**
   Los segmentos de ruta no exigen posiciones fijas. Cada segmento se contrasta contra los diccionarios cerrados del SSOT (`GENRE_SLUG_MAP`, `COUNTRY_SLUG_MAP`, `STUDIO_SLUGS`, `SELECTION_SLUGS`). Las rutas `/eeuu/drama/` y `/drama/eeuu/` son semánticamente equivalentes.
2. **Parámetros de Búsqueda y Alias Soportados:**
   - `year`: Rango numérico (`"1995"`, `"1990-2005"`, `"2011-"`, `"-1970"`), acotado a `[CONFIG.YEAR_MIN, CONFIG.YEAR_MAX]`.
   - `sort` (alias `orden`): Slugs amigables (`recientes`, `antiguas`, `nota-fa`, `nota-imdb`, `votos-fa`, `votos-imdb`) o crudos (`year,desc`...). Si es desconocido, cae a `relevance,desc`.
   - `search` (alias `buscar`, `q`): Cadena de texto libre normalizada con `.trim()`.
   - `type`: Modo de medio restringido a `'all' | 'movies' | 'series'`.
   - `p` (alias `page`): Entero finito $\ge 1$.
   - `list`: Modo de lista privada (`'rated' | 'watchlist' | 'mixed'`).
3. **Purga de Parámetros en Rutas SEO Perimetrales:**
   Cualquier acceso directo a rutas indexables (`/titulo/:slug/`, `/genero/:slug/`, `/:vip-slug/`) acompañado de query strings innecesarias ejecuta una redirección HTTP 301 en el Edge hacia la URL canónica limpia con barra final.
4. **Directivas Robots Deterministas:**
   - Vistas públicas y canónicas: `index, follow, max-image-preview:large`.
   - Vistas privadas (`?list=...`) o búsquedas libres (`?search=...`): `noindex, follow`.

---

## 3. Contrato de Filtros de Catálogo y Menú Lateral (Sidebar)

### Reglas Invariantes
1. **Exclusividad Semántica:**
   - `director` y `actor` son mutuamente excluyentes entre sí y excluyentes con filtros de género, país, selección, estudio, exclusiones y año. Activar un autor purga las facetas incompatibles y notifica al usuario (`notifyRemovedPersonIncompatibleFilters`).
   - `selection` y `studio` son mutuamente excluyentes entre sí (ambos compiten por la cabecera VIP destacada).
2. **Piscinas Curadas Estáticas a 0 ms (Zero Network Discovery):**
   Los acordeones de sugerencias de directores y actores en el menú lateral se alimentan de listas estáticas normativas (`CURATED_DIRECTORS` y `CURATED_ACTORS`) en `src/shared/constants.ts` (100 cineastas mundiales consolidados). No se emiten consultas RPC de descubrimiento dinámico en la apertura del menú.
3. **Tolerancia Diacrítica e Iniciales sin Punto:**
   El motor de búsqueda y autocompletado normaliza las entradas retirando acentos y permitiendo búsquedas de nombres compuestos tanto con puntos como con espacios (`"j. j. abrams"` $\equiv$ `"j j abrams"`).
4. **Recomendación Aleatoria Global ("Sorpréndeme"):**
   El botón `#play-button` ("Sorpréndeme") selecciona una obra aleatoria entre el total de resultados coincidentes con los filtros activos (`appState.totalMovies`). Si el resultado está pintado en la cuadrícula actual, ejecuta un *fast-path* a 0 ms con scroll y auto-apertura del modal. Si está en una página remota, realiza una consulta RPC ligera con offset aleatorio (`getMoviesPage({ page: randomPage, pageSize: 1 })`), abriendo inmediatamente la ficha sin vibraciones ni latencias intrusivas.

---

## 4. Contrato de Daily Showcase y Barajado Determinista

La ordenación por defecto del catálogo (*"Orden"* / `relevance,desc`) implementa serendipia rotativa controlada mediante la función PL/pgSQL `search_movies_offset`.

### Reglas Invariantes
1. **Semilla Temporal Canónica:**
   $$\text{seed} = (\text{CURRENT\_TIMESTAMP AT TIME ZONE 'Europe/Madrid'})::\text{date}::\text{text}$$
   La rotación se actualiza a las 00:00:00 hora peninsular española, garantizando paridad global instantánea.
2. **Dispersión Pseudoaleatoria Uniforme:**
   $$\text{rank\_hash}(m) = \operatorname{hashtext}(m.\text{id}::\text{text} \mathbin{\Vert} \text{seed})$$
3. **Ordenación Bi-Nivel (Two-Tier SQL Order):**
   - **Tier 0 (Ventana de Excelencia - 378 títulos):** Barajado diario determinista entre las 378 mejores películas (`threshold = 378`, mínimo común múltiplo de cuadrículas de 42 y 54 ítems).
   - **Tier 1 (Catálogo General):** Los títulos restantes preservan orden riguroso por mérito natural (`natural_rank ASC`).
4. **Paginación Determinista sin Estado (*Stateless*):**
   La navegación entre páginas consecutivas (`0..42`, `42..84`...) no requiere sesiones ni almacenamiento temporal; garantiza cero duplicados y cero omisiones.

---

## 5. Contrato de Respuestas de API y Conteo Desacoplado

Las respuestas del catálogo cumplen la interfaz `ApiResponse`:

```ts
interface ApiResponse {
  total: number;
  items: MappedMovie[];
  aborted?: true;
}
```

### Reglas Invariantes
1. **Desacoplamiento de Conteo (Pintar Primero → Contar Después):**
   La carga inicial de catálogo se ejecuta con `get_count = false`. La API entrega inmediatamente las películas de la primera página con `total = -1`. La interfaz retira `.is-fetching` y `aria-busy` devolviendo el control al usuario de inmediato, mientras una segunda solicitud no bloqueante calcula y actualiza el total atómicamente (`applyResolvedTotal`).
2. **Fast-Path de Portada Limpia (~1.5 ms):**
   Cuando el catálogo se consulta sin filtros ni búsquedas en orden de relevancia, la función SQL ejecuta un atajo mediante *Index-Only Scan*, devolviendo el total global (`SELECT count(*) FROM public.movies`) en ~2 ms sin escanear las 14.500 filas.
3. **Carga Diferida del SDK de Supabase (Lazy Auth):**
   Visitantes anónimos interactúan con el catálogo mediante el endpoint HTTP nativo `/api/rpc/search_movies_offset`. El SDK pesado de Supabase (`@supabase/supabase-js`) no se descarga ni inicializa hasta que el usuario pulsa *"Entrar"* o interactúa con acciones autenticadas.

---

## 6. Contrato de Datos de Usuario y Sincronización Local-First (SWR)

Los datos de seguimiento y notas personales del usuario se rigen por la arquitectura *Local-First*:

### Reglas Invariantes
1. **Latencia Cero en Escritura:**
   Toda acción (valorar con estrellas, añadir a Watchlist) muta sincrónicamente el estado en memoria (`state.userMovieData`) y la base de datos local IndexedDB (`localStore.ts`).
2. **Sincronización en Segundo Plano:**
   Las mutaciones encolan tareas de sincronización asíncrona hacia Supabase (`syncManager.ts`). Si el usuario carece de conexión, las operaciones persisten con estado `dirty` hasta su reanudación.
3. **Reconciliación Suave en Caliente (SWR Revalidation):**
   En "Mi Lista", la interfaz se pinta inmediatamente desde IndexedDB. Si la revalidación en segundo plano detecta diferencias remotas reales (películas añadidas/eliminadas desde otro dispositivo), actualiza la caché y emite `userDataUpdated` / `myListReconciled` para refrescar suavemente el grid sin bloquear la navegación.
4. **Exclusividad Mutua entre Nota y Watchlist:**
   Puntuar una película la retira automáticamente de la Watchlist (`resolveWatchlistMutationOnRate`). Añadir una película a la Watchlist elimina su puntuación previa (`resolveRatingMutationOnWatchlist`).
5. **Retención Local Segura (MAX_CACHED_MOVIES = 3500 y Escudo de Inmunidad):**
   El almacén `cached_movies` en IndexedDB purga títulos mediante política LRU al superar las 3.500 fichas. Las obras pertenecientes a la colección activa del usuario (`user_entries` con valoración o en watchlist) cuentan con un *Escudo de Inmunidad* permanente (*Pinning Shield*), impidiendo su desalojo de la memoria local y garantizando resolución a 0 ms y modo offline para usuarios cinéfilos con miles de títulos.
6. **Importación y Exportación Bidireccional de Colección (CSV):**
   El modal de Perfil permite tanto la exportación como la importación atómica en lote de la colección del usuario (`movie_id, rating, on_watchlist`). La ingesta valida los esquemas mediante `parseCsvRows`, persiste atómicamente en IndexedDB en lote (`saveLocalEntriesBatch`) con estado `dirty`, actualiza sincrónicamente el estado reactivo (`state.setUserMovieData`) y programa la sincronización asíncrona hacia Supabase (`scheduleSync()`), garantizando la regla de exclusividad mutua entre valoración y watchlist.

---

## 7. Contrato de Entidades VIP (Personas, Colecciones, Estudios)

### Reglas Invariantes
1. **Inyección en Posición 0:**
   Al filtrar por una entidad VIP, la ficha biográfica o corporativa se inserta en el índice `0` de la primera página, empujando la primera película a la posición `1`.
2. **Cálculo de Paginación y Offset Seguro:**
   La condición VIP de un autor se resuelve con certeza antes de solicitar el catálogo. Si la persona no es VIP, el tamaño de página y offset operan de forma estándar, impidiendo saltos o duplicaciones de películas entre la página 1 y 2.
3. **Soporte de Doble Rol (Director / Actor):**
   Si una persona cuenta con obras en ambos roles (`people.type` `'AD'` o `'DA'`), se presenta la insignia interactiva `(D)` o `(A)`. La alternancia permuta la filmografía en el cliente mediante CSS (`display: contents` / `display: none`) con URL canónica única y 0 ms de latencia.
4. **Paridad Cromática y Coherencia Corporativa (*Quiet Luxury*):**
   Las fichas VIP (`.person-card`, `.collection-card`, `.studio-card`) comparten exactamente el mismo fondo de superficie que las fichas de película (`background-color: var(--color-surface-1)`) y perfilan su contorno con el acento corporativo de la marca (`var(--color-accent)`), eliminando oros discordantes.

---

## 8. Contrato de Paridad Perimetral Edge SSR ↔ SPA

El Cloudflare Worker (`cloudflare/worker.js`) y el cliente SPA comparten paridad visual y de marcado 1:1.

### Reglas Invariantes
1. **Coherencia Cromática en Arranque:**
   El HTML generado en el Edge evalúa la preferencia de color (`theme=dark/light` en cookie o `prefers-color-scheme`) e inyecta la clase `dark-mode` en `<html>` antes de entregar el documento, erradicando destellos de modo claro/oscuro (Anti-FOUC).
2. **Marcado Estructurado JSON-LD Aislado:**
   Durante la navegación SPA, no se regeneran esquemas JSON-LD masivos en cada filtro para no saturar el hilo principal. La inyección de metadatos estructurados en cliente se programa en periodos de inactividad (`requestIdleCallback`).
3. **Proxy Perimetral Inmutable de Imágenes:**
   Las rutas `/posters/*` y `/vips/*` se sirven desde el Worker con cabeceras `Cache-Control: public, max-age=31536000, immutable`, descargando el egress de Supabase Storage.

---

## 9. Contrato de Vista Rápida (Modal) y Ficha Técnica

La modal de detalle cinemático (`src/js/components/modal/`) implementa una experiencia inmersiva adaptada a tres modos de pantalla:

```
- Escritorio (> 768px): Modal flotante centrada con columna multimedia fija y ficha técnica en scroll nativo.
- Móvil Vertical (<= 768px): Bottom Sheet a pantalla completa con gesto táctil de cierre (swipe down).
- Móvil Apaisado (Landscape): Disposición horizontal con columnas desacopladas y scroll independiente.
```

### Reglas Invariantes
1. **Tipografía del Año sin Punto:**
   El año cinematográfico se formatea siempre como bloque numérico limpio de cuatro dígitos (`1994`) sin puntos de millar, conforme al estándar de catálogos cinematográficos y directrices ortográficas de la RAE.
2. **Espaciado No Colapsable en Miniseries `(M)`:**
   Cuando una obra es miniserie, el indicador `(M)` (ej. `2019 (M)`) mantiene un espacio garantizado respecto al año. Para evitar el colapso de espacios en Flexbox (`[data-template="year"]`), el renderizador inyecta obligatoriamente un espacio no divisible (`\u00A0(M)` en DOM, `&nbsp;(M)` en SSR) y la regla CSS `white-space: pre`.
3. **Rótulos de Metadatos en Versalitas:**
   Los encabezados de datos conservan tipografía editorial en versalitas (`font-variant: small-caps; letter-spacing: 0.12em;`) y punto ortográfico (`Género.`, `Reparto.`, `Sinopsis.`).
4. **Rendimiento de Scroll GPU y Cero Enmascaramiento:**
   En dispositivos móviles se desactiva `backdrop-filter` para evitar sobrecarga en GPU durante gestos táctiles, empleando fondos sólidos de alta densidad (`rgba(0, 0, 0, 0.68)`).

---

## 10. Contrato de Rendimiento Geométrico, Modo Muro y Delegación de Eventos

### Reglas Invariantes
1. **Estabilidad Geométrica Absoluta (CLS = 0):**
   Los esqueletos de carga (`.skeleton-card`) y las tarjetas renderizadas (`.movie-card`) poseen idéntica relación de aspecto matemática:
   - Modo Exploración normal: `aspect-ratio: 500 / 950`.
   - Modo Muro 2D (`body.rotation-disabled`): `aspect-ratio: 2 / 3`.
2. **Aplanamiento 2D en Modo Muro:**
   Al desactivar la rotación manual (Modo Muro), las tarjetas eliminan sus caras traseras del árbol de renderizado (`display: none !important`), declaran `perspective: none` y `transform-style: flat`. La GPU gestiona el grid como un lienzo 2D plano, garantizando 60-120 FPS estables.
3. **Delegación Global de Eventos (Event Bubbling):**
   Las tarjetas no registran escuchadores individuales `click` ni de puntuación. `#grid-container` y `#quick-view-content` gestionan todas las interacciones de forma centralizada mediante delegación en el contenedor raíz, permitiendo reciclar nodos DOM con `replaceChildren` sin fugas de memoria.
4. **Indicador Minimalista de Orden en Subheader Móvil:**
   En vista móvil, la barra de estado bajo la cabecera sustituye el texto `"orden"` por la flecha direccional `↓` (`renderStatusBar` en `ui.ts`), optimizando el espacio horizontal sin saturar la línea de metadatos de recuento.
