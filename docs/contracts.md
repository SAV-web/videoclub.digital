# Contratos de Datos - VIDEOCLUB.DIGITAL

Este documento define las fronteras de datos que debe respetar la aplicación. El contrato ejecutable vive en `src/js/contracts.ts` y `src/js/types.ts`; este archivo explica su intención para mantenimiento.

## 1. Estado Global

El estado público de la aplicación tiene esta forma:

```ts
{
  currentPage: number,
  totalMovies: number,
  activeFilters: ActiveFilters,
  userMovieData: Record<number, UserMovieEntry>
}
```

Reglas:

- `currentPage` siempre es un entero positivo. Si entra un valor inválido, vuelve a `1`.
- `totalMovies` siempre es un entero mayor o igual que `-1`. El valor `-1` significa "total desconocido".
- `activeFilters` siempre contiene todas sus claves; ningún consumidor debe asumir filtros parciales.
- `userMovieData` se indexa por `movieId` numérico convertido a clave de objeto.

## 2. Filtros

`ActiveFilters` (definido en `src/js/types.ts`) tiene esta forma:

```ts
{
  searchTerm: string,
  genre: string | null,
  year: string | null,
  country: string | null,
  director: string | null,
  actor: string | null,
  selection: string | null,
  studio: string | null,
  sort: string,
  mediaType: "all" | "movies" | "series",
  excludedGenres: string[],
  excludedCountries: string[],
  myList: null | "rated" | "watchlist" | "mixed"
}
```

Reglas:

- Los textos se recortan con `trim`; textos vacíos pasan a `null`, salvo `searchTerm`, que pasa a `""`.
- `year` acepta `YYYY`, `YYYY-` (hasta el año máximo), `-YYYY` (desde 1900) o `YYYY-YYYY` y se limita al rango `CONFIG.YEAR_MIN` - `CONFIG.YEAR_MAX`. Si el rango abarca el periodo completo por defecto, se omite de la URL (`null`). La función pura de parseo `parseYearRangeRaw` reside de forma única en `contracts.ts` para evitar duplicidades o dependencias circulares.
- `sort` solo acepta valores presentes en el selector de ordenación de `index.html`.
- `mediaType` solo acepta `all`, `movies` o `series`.
- `excludedGenres` y `excludedCountries` son arrays únicos, sin valores vacíos.
- `myList` solo acepta `rated`, `watchlist`, `mixed` o `null`.
- **Exclusividad de Personas y Notificación de Filtros Eliminados**: `director` y `actor` son mutuamente excluyentes entre sí y excluyentes con `genre`, `country`, `selection`, `studio`, `excludedGenres`, `excludedCountries` y `year`. Al activar una persona (desde autocompletado, enlaces de tarjeta, vista rápida o insignia de rol), el sistema evalúa los filtros incompatibles activos y notifica al usuario mediante un mensaje informativo contextual (`notifyRemovedPersonIncompatibleFilters`, ej: `"Eliminados filtros de género, país y estudio."`).
- **Exclusividad de Selección y Estudio**: `selection` y `studio` son mutuamente excluyentes entre sí (ambos representan entidades VIP de grupo y ocupan la cabecera destacada de catálogo). Al seleccionar una saga/colección se limpia el estudio activo, y al seleccionar un estudio se limpia la selección activa.
- **Banderas de País Interactivas**: Todas las banderas de país (en tarjetas, tarjetas VIP y modal) se generan como enlaces interactivos (`<a>` con `[data-country-name]`) que emiten `filter:apply` con `{ type: "country", value: countryName }`, permitiendo filtrado instantáneo por país.
- **Línea Informativa del Header (*Status Bar*)**: Sigue estrictamente la jerarquía canónica de las URLs:
  $$\text{Total títulos} \to \text{Persona VIP} \to \text{Género} \to \text{País} \to \text{Selección/Estudio} \to \text{Búsqueda} \to \text{Mi Lista} \to \text{Año} \to \text{Orden} \to \text{Tipo}$$
- **Exclusividad Estricta de Géneros y Países con sus Exclusiones**:
  - `genre` y `excludedGenres` son **mutuamente excluyentes** y NUNCA pueden coexistir interactuando con la UI ni en las URLs (no debe poder elegirse `/drama/no-animacion/`). Al activar un género positivo se eliminan todas las exclusiones de género, y al activar una exclusión de género se anula cualquier género positivo activo.
  - `country` y `excludedCountries` son **mutuamente excluyentes** y NUNCA pueden coexistir interactuando con la UI ni en las URLs (no debe poder elegirse `/uk/no-espana/`). Al activar un país positivo se eliminan todas las exclusiones de país, y al activar una exclusión de país se anula cualquier país positivo activo.

---

## 2.1. Contrato Canónico de URLs (*URL Contract Specification*)

El sistema de enrutamiento y serialización de filtros (blindado de forma automatizada en [`tests/url-contract.test.mjs`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/tests/url-contract.test.mjs)) sigue una estricta separación entre segmentos de ruta semánticos (*pathname*) y parámetros de consulta técnicos (*query string*).

### A. Segmentos de Ruta (*Pathname*) — Jerarquía Posicional y Lectura Agnóstica

1. **Jerarquía Canónica de Escritura (`buildPrettyPath`)**:
   La generación de URLs siempre escribe los segmentos en este orden determinista:
   $$\text{URL} = \text{/}\{\text{género}\}\text{/}\{\text{país}\}\text{/}\{\text{estudio-o-selección}\}\text{/}\{\text{no-género}\}\text{/}\{\text{no-país}\}\text{/}$$
2. **Lectura Agnóstica al Orden (`parsePrettyPath`)**:
   Al leer una URL entrante, la función no asume posiciones fijas. Clasifica cada segmento analizando a qué diccionario cerrado pertenece. De este modo, `/eeuu/drama/` y `/drama/eeuu/` son semánticamente equivalentes y producen el mismo estado de filtros.
3. **Vocabularios Cerrados vs. Texto Libre**:
   - **Persona**: `/director/{slug}/` o `/actor/{slug}/`. Prioridad absoluta. Texto libre (sin lista blanca), se envía tal cual al backend tras decodificar.
   - **Género**: 1 segmento de una lista cerrada de **21 géneros canónicos** (`GENRE_SLUG_MAP`).
   - **País**: 1 segmento de lista cerrada (`COUNTRY_SLUG_MAP`), que incluye ~120 países y 2 grupos regionales agregados (`/latam/`, `/nordic/`).
   - **Estudio o Selección**: 1 segmento. Mutuamente excluyentes entre sí (`STUDIO_SLUGS`: 15 estudios mnemónicos; `SELECTION_SLUGS`: 10 selecciones).
   - **Exclusiones**: Prefijo `no-` antepuesto al slug de género o país (`/no-animacion/`, `/no-eeuu/`).

### B. Parámetros de Query String y Alias Soportados

| Parámetro Canónico | Alias Aceptados | Formato / Valores Permitidos | Comportamiento |
| :--- | :--- | :--- | :--- |
| `year` | — | `"1995"`, `"1990-2005"`, `"2011-"`, `"-1970"` | Recortado a límites `[CONFIG.YEAR_MIN, CONFIG.YEAR_MAX]`. |
| `sort` | `orden` | Slugs amigables (`recientes`, `antiguas`, `nota-fa`, `nota-imdb`, `votos-fa`, `votos-imdb`) o valores crudos (`year,desc`, `fa_rating,desc`...) | Si el valor es desconocido, cae a `DEFAULTS.SORT`. |
| `search` | `buscar`, `q` | Texto libre | Se normaliza con `.trim()`. |
| `type` | — | `all`, `movies`, `series` | Si es ajeno a este conjunto, cae a `DEFAULTS.MEDIA_TYPE`. |
| `p` | `page` | Entero finito $\ge 1$ | Valores $\le 0$ o no numéricos caen a página `1`. |
| `exg` | — | Slugs de géneros separados por comas | Parseado a `excludedGenres: string[]`. |
| `exc` | — | Slugs de países separados por comas | Parseado a `excludedCountries: string[]`. |
| `list` | — | `rated`, `watchlist`, `mixed` (o `true` $\to$ `mixed`) | Normalizado mediante `normalizeMyList`. |

### C. Contrato de Personas y Compensación Backend (Lossy Slugs)

`slugToPersonQuery` convierte todos los guiones en espacios (`"daniel-day-lewis"` $\to$ `"daniel day lewis"`). Esta transformación delega contractualmente en el backend de PostgreSQL:
1. **Reconstrucción de slug**: Reconvierte espacios a guiones contra el índice `slug` (`directors.slug`, `actors.slug`).
2. **Fallback Alfanumérico Estricto (Fases 3.6 y 3.7 de `search_movies_offset`)**:
   Empareja `regexp_replace(name_norm, '[^a-z0-9]', '', 'g')`, de modo que `"danieldaylewis"` casa con `"Daniel Day-Lewis"` sin importar discrepancias de guiones en el cliente.
3. **Expansión de colectivos/dúos**: Expansión vía `directors.components` (ej. Hermanos Russo $\leftrightarrow$ Joe y Anthony Russo).

### D. Tabla de URLs Prohibidas, Rechazadas o Normalizadas

Esta matriz está verificada por pruebas automatizadas de regresión en CI:

| URL o Entrada | Causa de Rechazo / Análisis | Comportamiento del Contrato |
| :--- | :--- | :--- |
| `/ciencia-ficcion/` | No es un slug de `GENRE_SLUG_MAP` (el canónico oficial es `sci-fi`). | `slugToGenre` devuelve `null`; el segmento se ignora en silencio. |
| `/w/` (letra única) | Código legado de 1 letra. `STUDIO_SLUGS` exige pertenencia a los 15 mnemónicos oficiales. | Se descarta; `studio: null`. |
| `?sort=nota-negativa` | Valor inventado no presente en `SORT_SLUG_MAP` ni `SORT_VALUES`. | `normalizeSort` cae a `DEFAULTS.SORT` (`"relevance,desc"`). |
| `?type=documentales` | No contemplado en `MEDIA_TYPES` (`all`, `movies`, `series`). | `normalizeMediaType` cae a `DEFAULTS.MEDIA_TYPE` (`"all"`). |
| `?p=-3` o `?p=abc` | No cumple la exigencia de entero finito > 0. | `normalizePageNumber` cae a página `1`. |
| `?year=3000` / `?year=1800` | Años fuera del intervalo real histórico y de producción. | Recortado con `Math.min`/`Math.max` a `CONFIG.YEAR_MIN` (1900) y `YEAR_MAX`. |
| `/drama/no-drama/` | Coexistencia de género positivo con su propia exclusión. | La regla de exclusividad anula el positivo: queda `excludedGenres: ["Drama"]` y `genre: null`. |
| `?list=true` | Booleano legado, no es valor de `MY_LIST_MODES`. | Se traduce especialmente a `"mixed"` antes de validar. |
| `/Drama/`, `/EEUU/`, `/ drama /` | Mayúsculas, espacios accidentales o falta de trim. | `parsePrettyPath` aplica `.trim().toLowerCase()` a cada segmento; se resuelve idéntico a la versión canónica. |
| Segmento desconocido (`/estrenos/`, typos) | No pertenece a ningún diccionario ni tiene prefijo reconocido. | Se ignora silenciosamente; no se interpreta como comodín. |

### E. Contrato del Criterio por Defecto 'ORDEN' (Daily Showcase Adaptativo - Alternativa 2)

Cuando el usuario navega con el orden por defecto (`sort: "relevance,asc"`, visualizado como **"Orden"** en la interfaz), el backend aplica un algoritmo híbrido de serendipia y relevancia estricta mediante `hashtext(id || fecha_madrid)`:

1. **Sin Búsqueda de Texto ni Personas VIP**:
   - Las búsquedas libres (`search_term`) y las filmografías de directores/actores **nunca se barajan**: siempre se ordenan 100% por relevancia pura para no desvirtuar los resultados de búsqueda ni las carreras cinematográficas.
2. **Portada General (Home limpia sin filtros)**:
   - Se barajan las **378 mejores películas** del catálogo (o **377** si hay una tarjeta VIP en cabecera), garantizando 9 páginas completas y variadas cada mañana sin perder el canon cualitativo.
3. **Filtros Específicos (País, Género, Estudio, Selección, Años, Tipo)**:
   La ventana de barajado se adapta automáticamente al volumen total de títulos que superan el filtro (`total_matches`):
   - **Subcatálogos pequeños (`< 50` títulos)**: Se barajan únicamente las **Top 12** mejores películas.
   - **Subcatálogos medianos (`50..200` títulos)**: Se barajan únicamente las **Top 24** mejores películas.
   - **Subcatálogos grandes (`> 200` títulos)**: Se barajan únicamente las **Top 42** mejores películas (exactamente la primera página).
   - **A partir del corte adaptativo**: A partir de la película 13, 25 o 43 en adelante, el catálogo continúa ordenado de forma **100% estricta por mérito y relevancia natural** (`relevance ASC, id ASC`).

---

## 3. Respuestas de API

La respuesta estándar de películas (`ApiResponse`) es:

```ts
{
  total: number,
  items: MappedMovie[],
  aborted?: true
}
```

Reglas:

- `total` debe ser un entero. `-1` significa "total desconocido".
- `items` siempre es un array.
- Cada película debe tener al menos `id` válido y `title` string antes de mapearse para UI mediante `shapeRawMovieRow` y `mapMoviePayload`.
- Una petición cancelada devuelve `{ aborted: true, total: -1, items: [] }` y no debe mostrarse como error al usuario.

## 4. Datos de Usuario

`UserMovieEntry` tiene esta forma:

```ts
{
  rating: number | null,
  onWatchlist: boolean
}
```

Reglas:

- `rating` solo acepta enteros de `1` a `10`; cualquier otro valor pasa a `null`.
- `onWatchlist` siempre es booleano.
- Las mutaciones optimistas deben pasar por `updateUserDataForMovie`.
- Las escrituras remotas deben pasar por `setUserMovieDataAPI`.
- Al puntuar una película, la mutación elimina la película de la Watchlist (`resolveWatchlistMutationOnRate`). De forma recíproca, al añadir una película a la Watchlist, se borra la puntuación existente (`resolveRatingMutationOnWatchlist`).

## 5. Entidades de Personas y Doble Rol (VIPs)

`PersonDetails` y `VipData` (definidos en `src/js/types.ts`):

```ts
interface PersonDetails {
  name: string;
  slug?: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  country_name: string | null;
  country_flag: string | null;
  titulo_bio: string | null;
  biography: string | null;
  components?: string | null;
  role: 'director' | 'actor';
  otherRoleCount?: number;
}
```

Reglas:
- Si una persona tiene títulos computados tanto como actor como director, `otherRoleCount` refleja el total de obras en el rol alternativo.
- Si `otherRoleCount > 0`, la UI renderiza la insignia interactiva `(D)` (en fichas de actor) o `(A)` (en fichas de director), permitiendo alternar la filmografía instantáneamente.
- Para directores colectivos o dúos (ej. Hermanos Russo), `components` almacena los nombres individuales separados por coma, activando el autocompletado y búsqueda bidireccional.
- **Formato Canónico de Edad (`computePersonAgeInfo`)**:
  - Personas vivas: `(edad)` (ej. `(54)`).
  - Personas fallecidas: `✝ (edad)` (ej. `✝ (74)`), con fechas cronológicas `YYYY-YYYY` (o `YYYY-` si vive).

## 6. Errores

Los errores de aplicación usan `AppError`:

```ts
{
  name: "AppError",
  code: ERROR_CODES.*,
  message: string,
  cause?: unknown
}
```

Códigos permitidos (`ERROR_CODES` en `contracts.ts`):

- `ABORTED`: petición cancelada; no se muestra toast.
- `AUTH_REQUIRED`: el usuario debe iniciar sesión.
- `CONFIGURATION`: faltan credenciales o configuración obligatoria.
- `DATABASE`: fallo de Supabase/PostgreSQL.
- `NETWORK`: fallo de conexión.
- `VALIDATION`: datos inválidos antes de llamar a la API.
- `UNKNOWN`: error no clasificado.

## 7. Regla de Arquitectura

Las fronteras obligatorias son:

1. URL hacia estado: `syncStateWithUrlParams`.
2. UI hacia estado: setters de `state.ts`.
3. Estado hacia Supabase: `fetchMovies` y `setUserMovieDataAPI`.
4. Supabase hacia UI: `normalizeMoviesResponse`, `shapeRawMovieRow` y `mapMoviePayload`.
5. Errores técnicos hacia usuario: `getFriendlyErrorMessage`.

No se deben consumir datos externos directamente desde componentes sin pasar por estas fronteras.

---

## 8. Coherencia de Modo Claro / Oscuro (SPA ↔ SEO Edge)

Para garantizar cero parpadeos (*zero-flicker*) e idéntica experiencia visual al navegar entre la SPA y las páginas servidas desde el Edge de Cloudflare:

1. **Persistencia Dual Sincronizada**:
   - `localStorage.setItem("theme", "dark" | "light")`.
   - `document.cookie = "theme=" + ("dark" | "light") + "; path=/; max-age=31536000; SameSite=Lax"`.
2. **Script Anti-Flicker Síncrono en `<head>` (0 ms)**:
   Presente en `index.html` y en todos los renderizadores perimetrales (`render-taxonomy.js`, `render-person.js`, `render-movie.js`). Evalúa en orden:
   $$\text{Preferencia guardada (localStorage o Cookie)} \implies \text{Preferencia del SO (prefers-color-scheme)}$$
   Garantiza que la clase `dark-mode` o `light-mode` esté aplicada en `<html>` antes del primer fotograma del navegador.
3. **Control Interactivo en Cabeceras SEO**:
   Todas las vistas estáticas del Edge incluyen el botón `#theme-toggle` con animación de iconos Sol/Luna, permitiendo alternar el tema sin necesidad de regresar a la SPA.

---

## 9. Especificación de Fichas y Tarjetas en Edge SSR y SPA

1. **Reverso de Tarjeta Canónico (Paridad Total SPA / Edge SSR)**:
   - Se elimina por completo el botón `"Ficha completa →"`.
   - **Jerarquía Secuencial del Reverso**: Siguiendo el criterio unificado de la modal, el orden de elementos es:
     $$\text{1. Meta Header (duración, Wikipedia, JustWatch)} \to \text{2. Puntuaciones (FA / IMDb)} \to \text{3. Título Original} \to \text{4. Géneros y Reparto} \to \text{5. Sinopsis}$$
   - **Presencia Incondicional del Título Original**: El título original se renderiza **siempre** en la cara trasera (tanto en la SPA como en Edge SSR), incluso si coincide exactamente con el título en castellano/traducido, garantizando que el usuario disponga en todo momento de la referencia original y el enlace interactivo hacia la ficha completa.
   - El acceso a la ficha completa se realiza pulsando sobre el título original (`.back-original-title-link`), ubicado inmediatamente debajo de las puntuaciones con `pointer-events: auto !important`, `z-index: 20` y cursor interactivo.
   - **Alineación Milimétrica de Iconos `+`**:
     - El contenedor `.flip-card-back` posee un padding perimetral de `var(--space-xs, 8px)`.
     - El botón de reparto `.actors-expand-btn` está fijado a `bottom: 0; right: 0;` dentro de su contenedor (`padding-right: 20px`), situando su borde derecho a exactamente 8px del filo de la tarjeta.
     - El botón flotante de sinopsis `.expand-content-btn` está anclado a `bottom: 8px; right: var(--space-xs, 8px);`.
     - Ambos botones circulares de $18 \times 18\text{ px}$ comparten idéntica coordenada vertical milimétrica a 8px del margen derecho.
   - **Ritmo Vertical e Interlineado Armónico (Separación de Líneas)**:
     - Para prevenir aglomeración visual (*amontonamiento*) y asegurar una lectura limpia en la cara trasera:
       - `.back-meta-header`: `margin-bottom: 6px` para separar la duración y enlaces externos de los ratings.
       - `.flip-card-back .ratings-container`: `gap: 5px` entre barras de FA e IMDb, con `margin-bottom: 4px` para crear una separación neta respecto al título original.
       - `.back-original-title-wrapper`: márgenes equilibrados `margin-top: 9px; margin-bottom: 7px;` (~13px de distancia efectiva respecto al icono y barra de IMDb) e interlineado de título `line-height: 1.25` (evitando colisión entre líneas).
       - `.details-list`: `margin: 7px 0; padding-top: 7px; border-top: 1px solid var(--color-border);` con `gap: 6px` entre géneros y reparto, y `line-height: 1.35`.
       - `.plot-summary-final`: `padding-top: 7px; border-top: 1px solid var(--color-border);` con `line-height: 1.38` y `opacity: 0.85`, proporcionando aire visual antes y después de cada línea divisoria y un interlineado descansado en la sinopsis.
   - **Botón `−` de Cierre de Detalle en SEO Edge**:
     - Al expandir reparto (`.show-actors`) o sinopsis (`.is-expanded`), el botón flotante inferior cambia su glifo a `−` y se eleva a `z-index: 60 !important`, superando tanto la capa de sinopsis (`z-index: 15`) como la de actores/géneros (`.actors-scrollable-content`, `z-index: 40`).
     - El manejador perimetral evalúa si la tarjeta se encuentra en cualquiera de los dos estados expandidos para cerrarla limpiamente y restaurar el icono a `+`.
     - El contenedor `.scrollable-content` se excluye del manejador global de volteo para evitar giros involuntarios durante la lectura o scroll de la sinopsis.
2. **Normalización Case-Insensitive de URLs SEO**:
   - Cualquier petición con mayúsculas (ej. `/titulo/Chernobyl-2019`, `/genero/Sci-Fi`, `/Christopher-Nolan`) se redirige mediante `301 Moved Permanently` a su equivalente en minúsculas con trailing slash (`/titulo/chernobyl-2019/`).
3. **Formato de Series en SEO**:
   - Los episodios se representan con la convención canónica `"x"` (ej. `"5 x"`) en lugar del texto `"ep"`.

---

## 10. Desplegables del Sidebar y Alto Contraste

En los 4 acordeones colapsables del menú lateral (Géneros, Países, Directores, Actores):

1. **Ítems Seleccionados en Lista (`.filter-link.active`, `.bento-grid .filter-link.active`)**:
   - **Modo Claro**: Fondo slate profundo `#1e293b`, borde sutil y texto `#ffffff !important` (`font-weight: 700`), con sombra de elevación `0 2px 6px rgba(0,0,0,0.25)`.
   - **Modo Oscuro**: Fondo acentuado `#334155`, borde `#64748b` y texto `#ffffff !important` (`font-weight: 700`), preservando contraste WCAG AAA superior a 7:1 (evitando el uso de texto oscuro `var(--color-bg)`).
   - En listas verticales (directores/actores), el indicador activo `▶` y el borde izquierdo se resaltan en `#38bdf8`.
2. **Visibilidad Determinista**:
   - Los directores y actores activos no se ocultan de sus listas al seleccionarse, sino que se marcan como activos con la clase `.active`, permitiendo al usuario ver el elemento seleccionado en el propio desplegable.
3. **Autocompletado de Entrada**:
   - Los resultados activos (`.sidebar-autocomplete-item.is-active`, `:hover`) usan fondos contrastados (`#1e293b` en claro, `#334155` en oscuro) y texto blanco con resaltado azul `#38bdf8` en coincidencias (`<strong>`).

