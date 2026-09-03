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
- **Estructura Canónica de URLs (*Pretty Paths*)**:
  - Los filtros de catálogo principales (`genre` o `excludedGenres`, `country` o `excludedCountries`, `selection`/`studio`) se serializan en los segmentos del `pathname`: `/{genre_o_no_exg}/{country_o_no_exc}/{studio_or_selection}/`. Si una URL externa incluye ambos simultáneamente, la exclusión tiene precedencia y el positivo es anulado de forma canónica.
  - Las entidades de personas se serializan con prefijo canónico dedicado: `/director/{slug}/` o `/actor/{slug}/` (ej. `/director/brian-de-palma/`, `/actor/clint-eastwood/`).
  - Los parámetros técnicos, temporales y de paginación se serializan en el `query string` usando slugs amigables para el orden: `?year=2011-&sort=votos-fa&p=3`.
  - Parámetro canónico de búsqueda: `?search={termino}` (con compatibilidad de lectura para `?buscar=` y `?q=`).
  - Slugs de ordenación: `recientes` (`year,desc`), `antiguas` (`year,asc`), `nota-fa` (`fa_rating,desc`), `nota-imdb` (`imdb_rating,desc`), `votos-fa` (`fa_votes,desc`), `votos-imdb` (`imdb_votes,desc`).
  - **Catálogo Canónico de 21 Géneros**: Definido de forma compartida en `src/shared/slugs.ts` (`GENRE_SLUG_MAP`) con relación estricta 1:1 para URLs públicas (`/accion/`, `/belico/`, `/sci-fi/`, etc.). La resolución de sinónimos temáticos y multilingües para búsqueda se delega dinámicamente a la base de datos (`genres.synonyms`).
  - **Resolución de Base Path**: La función `getAppBasePath()` centraliza la detección del prefijo de entorno (ej: `/videoclub.digital` en GitHub Pages o `""` en dominio raíz).
  - **Fallback SPA**: `public/404.html` intercepta peticiones directas y recargas (`F5`) en GitHub Pages y las reconduce a la SPA mediante `?_p=` y `?_q=`.

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
