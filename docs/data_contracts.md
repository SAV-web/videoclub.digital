# 🛡️ Contratos de Calidad de Datos y Disciplina de Testing (DataOps)

> **Filosofía**: En lugar de comprobaciones puntuales o alertas informativas (`RAISE NOTICE`) que no detienen la base de datos, este framework adopta la disciplina declarativa estandarizada por **dbt** (*Data Build Tool*), implementada de forma **nativa en PostgreSQL sin añadir librerías externas**.

---

## 1. El Principio de Aserción dbt

Cada prueba de datos sigue una regla matemática binaria:
$$\text{Test}(\text{Query}) = \begin{cases} \mathbf{PASS} & \text{si } \text{COUNT}(*) = 0 \\ \mathbf{FAIL} & \text{si } \text{COUNT}(*) > 0 \end{cases}$$

La consulta de cada test está diseñada para **aislar únicamente los registros que violan la regla**. Si la consulta no devuelve ninguna fila, el test se supera; si devuelve una o más filas, el test falla y devuelve el recuento exacto junto con la consulta SQL de depuración para aislar las filas infractoras.

---

## 2. Modos de Ejecución de `public.run_data_tests()`

La función [`docs/data_tests.sql`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/docs/data_tests.sql) admite un parámetro booleano de control de fallos:

### Modo Auditoría / Diagnóstico (`p_fail_fast = false`, Por Defecto)
Ejecuta la suite completa, no aborta transacciones y genera un informe tabular con el estado de salud del catálogo:

```sql
SELECT * FROM public.run_data_tests();
```

*Salida de ejemplo*:
| test_name | category | severity | status | failed_records | sample_query |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `movies_title_slug_not_null` | `not_null` | `ERROR` | **PASS** | `0` | `SELECT id, title...` |
| `movies_slug_unique` | `unique` | `ERROR` | **PASS** | `0` | `SELECT slug, count(*)...` |
| `movie_directors_orphans` | `relationships` | `ERROR` | **PASS** | `0` | `SELECT md.* FROM...` |
| `movies_ratings_in_bounds` | `accepted_values` | `ERROR` | **PASS** | `0` | `SELECT id, title...` |

### Modo Fail-Fast / Pipeline Transaccional (`p_fail_fast = true`)
Diseñado para integrarse al final del pipeline de ingestión ETL (`process_staging_data()`). Si cualquier aserción con severidad `ERROR` detecta aunque sea un único registro inválido, lanza un `RAISE EXCEPTION`:
$$\implies \quad \text{PostgreSQL ejecuta un \textbf{ROLLBACK} atómico inmediato.}$$
Ninguna corrupción de datos procedente de un CSV o proceso externo contamina las tablas públicas del catálogo.

```sql
-- Ejecución en modo estricto:
SELECT public.run_data_tests(p_fail_fast => true);
```

---

## 3. Matriz de Pruebas Declarativas

### A. Categoría: `not_null`
Garantiza la presencia de datos en columnas estructurales indispensables para el catálogo y la navegación.

| Test | Tabla | Columnas Evaluadas | Severidad | Razón de Negocio |
| :--- | :--- | :--- | :--- | :--- |
| `movies_title_slug_not_null` | `public.movies` | `title`, `slug` | `ERROR` | Toda película requiere título legible y slug para URLs públicas. |
| `movies_relevance_not_null` | `public.movies` | `relevance` | `ERROR` | Vital para el orden natural de catálogo y el *Daily Showcase*. |
| `directors_name_slug_not_null`| `public.directors`| `name`, `slug` | `ERROR` | Los directores sin slug rompen las rutas `/director/{slug}/`. |
| `actors_name_slug_not_null` | `public.actors` | `name`, `slug` | `ERROR` | Los actores sin slug rompen las rutas `/actor/{slug}/`. |

---

### B. Categoría: `unique`
Garantiza la ausencia de duplicados que provoquen ambigüedad en búsquedas o colisiones en enrutamiento.

| Test | Tabla | Columnas Evaluadas | Severidad | Razón de Negocio |
| :--- | :--- | :--- | :--- | :--- |
| `movies_slug_unique` | `public.movies` | `slug` | `ERROR` | Las páginas estáticas SEO de Astro y la SPA requieren relación 1:1 estricta. |
| `movies_fa_id_unique` | `public.movies` | `fa_id` | `ERROR` | Evita registros duplicados procedentes de sincronizaciones sucesivas. |
| `directors_slug_unique` | `public.directors`| `slug` | `ERROR` | Garantiza unicidad en páginas canónicas de realizadores. |
| `actors_slug_unique` | `public.actors` | `slug` | `ERROR` | Garantiza unicidad en páginas canónicas de intérpretes. |

---

### C. Categoría: `relationships` (Integridad Referencial)
Verifica que las claves foráneas y las tablas de relación N:M no contengan registros huérfanos.

| Test | Tablas Involucradas | Condición de Fallo | Severidad |
| :--- | :--- | :--- | :--- |
| `movies_country_id_fk_countries` | `movies` $\to$ `countries` | `m.country_id IS NOT NULL AND c.id IS NULL` | `ERROR` |
| `movie_directors_orphans` | `movie_directors` $\leftrightarrow$ `movies`, `directors` | Registros donde `movie_id` o `director_id` no existen. | `ERROR` |
| `movie_actors_orphans` | `movie_actors` $\leftrightarrow$ `movies`, `actors` | Registros donde `movie_id` o `actor_id` no existen. | `ERROR` |
| `movie_genres_orphans` | `movie_genres` $\leftrightarrow$ `movies`, `genres` | Registros donde `movie_id` o `genre_id` no existen. | `ERROR` |

---

### D. Categoría: `accepted_values` y Reglas de Negocio
Audita la coherencia lógica de las métricas numéricas y temporales cinematográficas.

| Test | Tabla | Regla de Validación | Severidad |
| :--- | :--- | :--- | :--- |
| `movies_year_range_valid` | `movies` | `year BETWEEN 1888 AND 2100` | `ERROR` |
| `series_year_end_gte_year` | `movies` | `year_end IS NULL OR year_end >= year` | `ERROR` |
| `movies_ratings_in_bounds` | `movies` | Calificaciones en rango `[0.0, 10.0]` | `ERROR` |
| `movies_minutes_positive` | `movies` | `minutes > 0` | `WARN` |
| `people_dates_order_valid` | `directors`, `actors` | `deathday IS NULL OR deathday >= birthday` | `WARN` |
| `countries_region_valid` | `countries` | `region IS NULL OR region IN ('nordic', 'latam')` | `WARN` |

---

## 4. Integración en el Flujo de Trabajo

### Paso 1: Instalación de la Suite
Copia y ejecuta una sola vez el contenido de [`docs/data_tests.sql`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/docs/data_tests.sql) en el SQL Editor de Supabase.

### Paso 2: Protocolo Post-Ingesta
En [`docs/ingest.sql`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/docs/ingest.sql), tras procesar el staging y refrescar las vistas materializadas, se ejecuta la suite completa para certificar el estado del catálogo:

```sql
-- 4. Certificación de Calidad de Datos (DataOps Tests)
SELECT * FROM public.run_data_tests();
```
