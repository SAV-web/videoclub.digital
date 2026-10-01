# VIDEOCLUB.DIGITAL — Arquitectura de Seguridad y Auditoría Forense

Este documento recoge la auditoría forense integral de seguridad, el mapa de superficie de ataque, el modelo de amenazas y la resolución técnica de las **Debilidades Estructurales** y la **Deuda de Seguridad** implementadas en **VIDEOCLUB.DIGITAL**.

---

## 1. Mapa de Superficie de Ataque y Límites de Confianza

La arquitectura de VIDEOCLUB.DIGITAL opera sobre tres fronteras de confianza bien delimitadas:

```
[ Navegador / Cliente (Untrusted) ]
           │
           │ HTTPS / WSS
           ▼
[ Cloudflare Edge (Worker & CDN) ]  ─── Inyección de Cabeceras HTTP de Seguridad
           │                                 (CSP, XFO, HSTS, Nosniff, Referrer)
           ├──────────────────────────────┐
           │ REST (apikey anon)          │ REST (Internal RPC)
           ▼                             ▼
[ Supabase Storage ]             [ Supabase PostgreSQL (PostgREST) ]
(Pósters y Fotos VIP)            - RLS (auth.uid() en user_movie_entries)
                                 - DCL: REVOKE en vistas y funciones sensibles
```

1. **Cliente / SPA (`src/js/`):**
   - Entrada de datos: URL (*Pretty Paths* y query strings), almacenamiento local (`localStorage`), interacciones de usuario (ratings, watchlist, búsqueda).
   - Renderizado en DOM: Uso sistemático de `textContent`, `createElement` y plantillas `<template>` clonadas, eliminando de raíz la inyección clásica por `innerHTML`.
   - Hipervínculos salientes: Sanitizados mediante [`sanitizeExternalUrl`](#32-sanitización-canónica-de-hipervínculos-externos-sanitizeexternalurl).
2. **Perímetro / Edge (`cloudflare/worker.js`):**
   - Origen autoritativo de producción para HTML, SSR dinámico y assets.
   - Gobierna las cabeceras HTTP de seguridad para todas las respuestas navegables.
   - Normalización estricta de rutas (301 canónico, case-insensitive, trailing slash y depuración de query strings).
   - Fail-closed ante falta de credenciales de backend (500 controlado sin fugas).
3. **Backend / Base de Datos (`Supabase PostgreSQL`):**
   - Políticas RLS activas en todas las tablas con datos de usuario (`user_movie_entries`).
   - Hardening DCL: Privilegios restringidos en vistas de observabilidad y funciones de pruebas masivas.

---

## 2. Resolución de Debilidades Estructurales

### 2.1. Gobernanza Anti-Clickjacking en la Frontera HTTP (Edge)

* **Problema Original:**
  La protección contra clickjacking residía exclusivamente en un script cliente en `index.html`:
  ```javascript
  if (window.self !== window.top) { window.top.location = window.self.location; }
  ```
  Un atacante podía anular este script embebiendo el sitio en un iframe malicioso con:
  ```html
  <iframe src="https://videoclub.digital" sandbox="allow-scripts allow-forms"></iframe>
  ```
  Al omitir la bandera `allow-top-navigation`, el navegador bloqueaba la asignación a `top.location` levantando una excepción silenciosa de seguridad, permitiendo ataques de *UI Redressing* sobre formularios y botones interactivos. Adicionalmente, las páginas Edge SSR carecían por completo de este script.

* **Solución Arquitectónica:**
  Se trasladó la defensa de forma autoritativa a nivel de cabeceras HTTP inyectadas por Cloudflare Worker ([`cloudflare/worker.js`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/cloudflare/worker.js)):
  - `X-Frame-Options: DENY`: Bloqueo inmediato en motores de renderizado.
  - `Content-Security-Policy: ... frame-ancestors 'none'`: Estándar W3C moderno que actúa antes del parseo del DOM, impidiendo que el documento sea incrustado en cualquier marco (`<iframe>`, `<frame>`, `<embed>`, `<object>`).
  - El script cliente en `index.html` se mantiene exclusivamente como mecanismo de defensa en profundidad de contingencia para entornos locales sin Worker.

---

### 2.2. Simetría de Seguridad entre SPA y Edge SSR

* **Problema Original:**
  Existía una asimetría defensiva: la SPA disponía de una meta-etiqueta CSP parcial, mientras que las respuestas HTML servidas mediante Edge SSR (`/titulo/:slug/`, `/genero/:slug/`, `/pais/:slug/`, `/:vip-slug/` y páginas semánticas de error) no contenían cabeceras de seguridad.

* **Solución Arquitectónica:**
  Se introdujo la función centralizada [`applySecurityHeaders(headers)`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/cloudflare/worker.js) en el Worker perimetral:

  ```javascript
  export function applySecurityHeaders(headers) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    headers.set("X-XSS-Protection", "0");

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://videoclub.digital",
      "font-src 'self' data: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ];
    headers.set("Content-Security-Policy", cspDirectives.join("; "));

    return headers;
  }
  ```

  **Garantías implementadas:**
  1. Se inyecta de forma idéntica en:
     - Fichas de película en Edge SSR.
     - Muros de taxonomía en Edge SSR.
     - Fichas VIP de directores y actores en Edge SSR.
     - Respuestas de error semántico HTTP (404, 500, 502) en `createErrorResponse`.
     - Navegación y rutas SPA servidas desde `env.ASSETS`.
  2. Persistencia en Edge Cache: Al crearse los objetos `Response` con las cabeceras antes de llamar a `cache.put()`, los aciertos de caché (*Cache HIT*) sirven directamente todas las cabeceras de seguridad con latencia cero.
  3. Protección MIME: Se añade `X-Content-Type-Options: nosniff` a todos los assets estáticos versionados (`/assets/*`, `/seo-card*.css`).

---

## 3. Resolución de la Deuda de Seguridad

### 3.1. Endurecimiento de PostgreSQL (Principio de Menor Privilegio)

* **Vulnerabilidad 1 — Vistas de Telemetría Expuestas ([`docs/script.sql`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/docs/script.sql)):**
  - *Diagnóstico:* Las vistas `public.view_slow_queries` y `public.view_top_cpu_queries` otorgaban `SELECT` a `service_role` pero no revocaban los privilegios por defecto concedidos a `PUBLIC`. PostgREST exponía estas vistas públicamente en `/rest/v1/view_slow_queries`.
  - *Remediación:*
    ```sql
    REVOKE ALL ON public.view_slow_queries FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON public.view_top_cpu_queries FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.view_slow_queries TO service_role;
    GRANT SELECT ON public.view_top_cpu_queries TO service_role;
    ```

* **Vulnerabilidad 2 — Función de Auditoría Invocable Anónimamente ([`docs/data_tests.sql`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/docs/data_tests.sql)):**
  - *Diagnóstico:* La función `public.run_data_tests(BOOLEAN)` otorgaba permisos a `authenticated` y `service_role` sin revocar el `EXECUTE` implícito de `PUBLIC`. Cualquier cliente anónimo podía ejecutar `POST /rest/v1/rpc/run_data_tests`, escaneando tablas completas y causando denegación de servicio por agotamiento de CPU.
  - *Remediación:*
    ```sql
    REVOKE EXECUTE ON FUNCTION public.run_data_tests(BOOLEAN) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.run_data_tests(BOOLEAN) TO authenticated, service_role;
    ```

* **Vulnerabilidad 3 — Agotamiento de Recursos por Paginación Profunda (Deep Pagination DoS / CWE-400) en `public.search_movies_offset` ([`docs/script.sql`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/docs/script.sql)):**
  - *Diagnóstico:* La RPC pública `public.search_movies_offset` acotaba el parámetro `page_limit` entre 1 y 100 (`LEAST(GREATEST(COALESCE(page_limit, 50), 1), 100)`), pero `page_offset` carecía de cota superior (`v_offset := GREATEST(COALESCE(page_offset, 0), 0);`), admitiendo valores hasta `2.147.483.647` (máximo de entero con signo en PostgreSQL). Al ser invocable directamente por el rol público `anon` vía PostgREST, un actor malicioso podía forzar la materialización, ordenación y descarte secuencial de millones de filas en memoria (`work_mem`) y disco, agravado por la ejecución de `count(*)` si se adjuntaba `get_count = true`. Esto creaba un vector severo de denegación de servicio (DoS) por agotamiento de CPU e IOPS.
  - *Remediación (Cortocircuito Preventivo de Fase 1.4):*
    Dado que el catálogo completo comprende ~15.000 títulos, cualquier offset superior a 15.000 excede la totalidad de la plataforma. Se añadió una cláusula de cortocircuito inmediata previa al preprocesamiento de países, resolución de *tsqueries* y ejecución de CTEs:
    ```sql
    -- FASE 1.4: MITIGACIÓN DE ABUSO POR PAGINACIÓN PROFUNDA (DEEP PAGINATION DOS / RESOURCE EXHAUSTION)
    IF v_offset > 15000 THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;
    ```
    Si el offset supera la cota física de la plataforma, la función responde de forma instantánea un objeto JSON vacío (`{ "total": 0, "items": [] }`), garantizando complejidad temporal $O(1)$ y consumo nulo de CPU/IOPS en el motor de base de datos.

* **Vulnerabilidad 4 — Inflación de Arrays y Parámetros (Input Size Inflation / CWE-400) en `public.search_movies_offset` ([`docs/script.sql`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/docs/script.sql)):**
  - *Diagnóstico:* Los parámetros vectoriales `p_country_codes text[]`, `excluded_genres text[]` y `excluded_countries text[]` no poseían restricción de cardinalidad. Un cliente anónimo podía transmitir payloads JSON con miles de elementos, forzando a PostgreSQL a ejecutar bucles masivos de `unnest` y funciones de coste no despreciable (`plainto_tsquery('spanish', ...)`, `public.unaccent_immutable(...)`) por cada elemento, provocando saturación computacional. De igual modo, `search_term` carecía de cota de longitud máxima.
  - *Remediación (Cortocircuito Preventivo de Fase 1.3):*
    Considerando que el dominio de la plataforma cuenta con ~25 géneros y <100 países, se definió un umbral estricto de 50 elementos y 100 caracteres para la búsqueda:
    ```sql
    -- FASE 1.3: VALIDACIÓN DE TAMAÑO MÁXIMO DE ARRAYS Y BÚSQUEDA (INPUT INFLATION DOS)
    IF (p_country_codes IS NOT NULL AND array_length(p_country_codes, 1) > 50)
       OR (excluded_genres IS NOT NULL AND array_length(excluded_genres, 1) > 50)
       OR (excluded_countries IS NOT NULL AND array_length(excluded_countries, 1) > 50)
       OR (search_term IS NOT NULL AND length(search_term) > 100) THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;
    ```

* **Deuda Técnica Aceptada — Funciones Auxiliares Puras del Esquema `public`:**
  - *Funciones identificadas:* `unaccent_immutable(text)`, `to_integer_safe(text)`, `to_real_safe(text)`, `to_date_safe(text)` y `handle_updated_at()`.
  - *Evaluación de Riesgo:* **Bajo / Sin riesgo operacional**. Son funciones puras deterministas de conversión o triggers internos que no leen datos de usuario, no alteran estado ni exponen información sensible. Además, `handle_updated_at()` al retornar tipo `trigger` es descartada por diseño por PostgREST y no se publica como endpoint HTTP.
  - *Decisión Arquitectónica:* **No aplicar `REVOKE ALL` global a ciegas**. `unaccent_immutable` está vinculada a índices funcionales por expresión (`people(unaccent_immutable(lower(name)))`) y columnas generadas. Revocar permisos de ejecución a `anon` o `PUBLIC` provocaría errores en tiempo de ejecución (`42501 permission denied for function unaccent_immutable`) al resolver consultas del catálogo o búsquedas mediante `search_movies_offset`.
  - *Estrategia a Futuro:* En una refactorización de esquemas, migrar estas utilidades a un esquema técnico desacoplado (`CREATE SCHEMA IF NOT EXISTS internal;` o `util;`) no expuesto en la configuración `db-schemas` de PostgREST, aislándolas de la superficie HTTP sin fricción de privilegios en el motor SQL.

---

### 3.2. Sanitización Canónica de Hipervínculos Externos (`sanitizeExternalUrl`)

* **Problema:**
  Los enlaces a plataformas externas (JustWatch, Wikipedia, FilmAffinity, IMDb) procedentes de la base de datos se asignaban sin validación previa de protocolo a la propiedad `el.href` o a atributos HTML en plantillas SSR. Si un valor almacenado contenía un URI malicioso (`javascript:`, `data:`), al hacer clic el usuario se disparaba la ejecución de scripts arbitrarios en el contexto del origen (*Stored DOM XSS*).

* **Implementación en la Fuente Única de Verdad ([`src/shared/formatters.ts`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/src/shared/formatters.ts) y [`cloudflare/seo/seo-types.js`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/cloudflare/seo/seo-types.js)):**
  ```typescript
  export function sanitizeExternalUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (_) {
      // Descarta esquemas inválidos o URLs malformadas
    }

    return null;
  }
  ```

* **Puntos de Aplicación:**
  1. **Tarjeta SPA ([`src/js/components/card/cardElement.ts`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/src/js/components/card/cardElement.ts)):** Si la URL no es segura, se elimina el atributo `href` y se añade la clase `.disabled`.
  2. **Modal de Película ([`src/js/components/modal/renderer.ts`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/src/js/components/modal/renderer.ts)):** Validación idéntica en la apertura de fichas interactivas.
  3. **Edge SSR ([`cloudflare/seo/render-movie.js`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/cloudflare/seo/render-movie.js)):** Validación estricta previa a la interpolación en cadenas HTML de JustWatch, Wikipedia, FilmAffinity e IMDb.

---

## 4. Falsos Positivos Descartados en la Auditoría

Durante la auditoría forense se analizaron varios escenarios que fueron descartados tras verificar el flujo real de datos:

1. **Exposición de `SUPABASE_ANON_KEY` en el cliente:**
   - *Evaluación:* **Público por diseño**. La clave `anon` de Supabase está diseñada para distribuirse al frontend. La seguridad no depende del secreto de esta clave, sino de las políticas RLS (*Row Level Security*) evaluadas en PostgreSQL en cada consulta.
2. **Inyección SQL en `search_movies_offset`:**
   - *Evaluación:* **Descartado**. Todos los parámetros recibidos por la función PL/pgSQL son tratados como variables escalares tipadas o procesados mediante funciones integradas seguras (`unaccent`, `to_tsquery`), sin concatenación de SQL dinámico (`EXECUTE format(...)`).
3. **Cross-Site Request Forgery (CSRF):**
   - *Evaluación:* **No aplicable al modelo de API**. Las peticiones cliente utilizan el esquema `Authorization: Bearer <JWT>` gestionado en memoria y `localStorage`, no autenticación automática basada en cookies de sesión implícitas.
4. **Manipulación de votos/watchlist entre usuarios (IDOR / BOLA):**
   - *Evaluación:* **Mitigado en base de datos**. Las mutaciones en `user_movie_entries` son evaluadas por la política RLS `user_movie_entries_policy` mediante `auth.uid() = user_id`, impidiendo que un usuario modifique o consulte entradas ajenas independientemente del payload enviado.

---

## 5. Batería de Pruebas Automatizadas de Seguridad

La cobertura de las mitigaciones se encuentra integrada en la suite de pruebas unitarias:

| Suite de Pruebas | Archivo | Casos Clave Verificados |
| :--- | :--- | :--- |
| **Edge Worker & Proxy** | [`tests/worker.test.mjs`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/tests/worker.test.mjs) | - Inyección de `X-Frame-Options: DENY` y CSP `frame-ancestors 'none'` en SPA, SSR y errores.<br>- Inyección de `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `HSTS`.<br>- Directiva `nosniff` en assets estáticos. |
| **Shared & Formateadores** | [`tests/shared-and-events.test.mjs`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/tests/shared-and-events.test.mjs) | - Aceptación exclusiva del protocolo HTTPS (`https://`).<br>- Rechazo explícito de HTTP (`http://`), vectores XSS (`javascript:`, `data:`, `vbscript:`, `file:`) y esquemas no seguros.<br>- Bloqueo de URLs relativas y esquemas sin protocolo.<br>- Paridad de exportación entre SPA (`utilsModule`) y Edge SSR (`edgeSeoModule`). |
| **Ficha de Tarjeta** | [`tests/card.test.mjs`](file:///c:/Users/sigfr/Documents/AI/VIDEOCLUB.DIGITAL/tests/card.test.mjs) | - Comportamiento de enlaces externos e inhabilitación con clase `.disabled`. |
