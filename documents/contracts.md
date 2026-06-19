# Contratos de Datos - VIDEOCLUB.DIGITAL

Este documento define las fronteras de datos que debe respetar la aplicación. El contrato ejecutable vive en `src/js/contracts.js`; este archivo explica su intención para mantenimiento.

## 1. Estado Global

El estado público de la aplicación tiene esta forma:

```js
{
  currentPage: number,
  totalMovies: number,
  activeFilters: ActiveFilters,
  userMovieData: Record<movieId, UserMovieEntry>
}
```

Reglas:

- `currentPage` siempre es un entero positivo. Si entra un valor inválido, vuelve a `1`.
- `totalMovies` siempre es un entero mayor o igual que `-1`. El valor `-1` significa "total desconocido".
- `activeFilters` siempre contiene todas sus claves; ningún consumidor debe asumir filtros parciales.
- `userMovieData` se indexa por `movieId` numérico convertido a clave de objeto.

## 2. Filtros

`ActiveFilters` tiene esta forma:

```js
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
- `year` acepta `YYYY` o `YYYY-YYYY` y se limita al rango `CONFIG.YEAR_MIN` - `CONFIG.YEAR_MAX`.
- `sort` solo acepta valores presentes en el selector de ordenación de `index.html`.
- `mediaType` solo acepta `all`, `movies` o `series`.
- `excludedGenres` y `excludedCountries` son arrays únicos, sin valores vacíos.
- `myList` solo acepta `rated`, `watchlist`, `mixed` o `null`.

## 3. Respuestas de API

La respuesta estándar de películas es:

```js
{
  total: number,
  items: Movie[],
  aborted?: true
}
```

Reglas:

- `total` debe ser un entero. `-1` significa "total desconocido".
- `items` siempre es un array.
- Cada película debe tener al menos `id` válido y `title` string antes de mapearse para UI.
- Una petición cancelada devuelve `{ aborted: true, total: -1, items: [] }` y no debe mostrarse como error al usuario.

## 4. Datos de Usuario

`UserMovieEntry` tiene esta forma:

```js
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

## 5. Errores

Los errores de aplicación usan `AppError`:

```js
{
  name: "AppError",
  code: ERROR_CODES.*,
  message: string,
  cause?: unknown
}
```

Códigos permitidos:

- `ABORTED`: petición cancelada; no se muestra toast.
- `AUTH_REQUIRED`: el usuario debe iniciar sesión.
- `CONFIGURATION`: faltan credenciales o configuración obligatoria.
- `DATABASE`: fallo de Supabase/PostgreSQL.
- `NETWORK`: fallo de conexión.
- `VALIDATION`: datos inválidos antes de llamar a la API.
- `UNKNOWN`: error no clasificado.

## 6. Regla de Arquitectura

Las fronteras obligatorias son:

1. URL hacia estado: `syncStateWithUrlParams`.
2. UI hacia estado: setters de `state.js`.
3. Estado hacia Supabase: `fetchMovies` y `setUserMovieDataAPI`.
4. Supabase hacia UI: `normalizeMoviesResponse` y `mapMoviePayload`.
5. Errores técnicos hacia usuario: `getFriendlyErrorMessage`.

No se deben consumir datos externos directamente desde componentes sin pasar por estas fronteras.
