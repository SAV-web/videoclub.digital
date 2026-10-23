-- =================================================================
-- FUNCIÓN RPC: search_movies_offset (Motor de Búsqueda y Catálogo)
-- VIDEOCLUB.DIGITAL - Script Autocontenido e Idempotente
-- =================================================================
-- Puede ejecutarse de forma independiente en el SQL Editor de Supabase
-- para actualizar o desplegar la lógica de búsqueda en cualquier entorno.
-- =================================================================

-- 1. HABILITACIÓN DE EXTENSIONES Y ESPACIO DE BÚSQUEDA
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  SCHEMA extensions;

SET search_path = pg_catalog, public, extensions;

-- 2. FUNCIÓN AUXILIAR INMUTABLE (WRAPPER PARA UNACCENT)
-- Requerida para evaluaciones insensibles a diacríticos dentro de la RPC.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS
$$ SELECT extensions.unaccent('extensions.unaccent', $1); $$;

-- 3. FUNCIÓN DE BÚSQUEDA PRINCIPAL
CREATE OR REPLACE FUNCTION public.search_movies_offset(
    search_term text DEFAULT NULL::text,
    genre_name text DEFAULT NULL::text,
    p_year_start integer DEFAULT NULL::integer,
    p_year_end integer DEFAULT NULL::integer,
    country_name text DEFAULT NULL::text,
    p_country_codes text[] DEFAULT NULL::text[],
    director_name text DEFAULT NULL::text,
    actor_name text DEFAULT NULL::text,
    media_type text DEFAULT 'all'::text,
    p_selection_code text DEFAULT NULL::text,
    p_studio_code text DEFAULT NULL::text,
    excluded_genres text[] DEFAULT NULL::text[],
    excluded_countries text[] DEFAULT NULL::text[],
    sort_field text DEFAULT 'relevance'::text,
    sort_direction text DEFAULT 'asc'::text,
    page_limit integer DEFAULT 50,
    page_offset integer DEFAULT 0,
    get_count boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    v_query TEXT;
    v_order_clause TEXT;
    v_outer_order_clause TEXT;
    v_count_cte TEXT;
    v_count_select TEXT;
    v_json_result JSON;
    v_country_ids INT[];
    v_excluded_country_ids INT[];
    v_safe_sort_direction TEXT;
    v_safe_sort_field TEXT;
    v_limit INT;
    v_offset INT;
    v_genre_tsquery tsquery;
    v_director_tsquery tsquery;
    v_director_names text[];
    v_actor_tsquery tsquery;
    v_selection_tsquery tsquery;
    v_studio_tsquery tsquery;
    v_excluded_genres_tsquery tsquery;
    v_enable_daily_showcase BOOLEAN := FALSE;
    v_has_filters BOOLEAN := FALSE;
    v_showcase_limit INT := 378;
    v_threshold_expr TEXT := '';
    v_outer_threshold_expr TEXT := '';
    v_include_total_matches BOOLEAN := FALSE;
    v_sort_col_select TEXT := '';
    v_bm_sort_col_select TEXT := '';
    v_type_col_select TEXT := '';
    v_bm_type_col_select TEXT := '';
    v_media_type_filter TEXT := 'TRUE';
BEGIN
    -- FASE 1: VALIDACIÓN Y ORDENACIÓN
    IF sort_direction IS NULL OR lower(sort_direction) NOT IN ('asc', 'desc') THEN
        v_safe_sort_direction := 'ASC';
    ELSE
        v_safe_sort_direction := upper(sort_direction);
    END IF;

    v_safe_sort_field := lower(coalesce(sort_field, 'relevance'));
    IF v_safe_sort_field NOT IN ('relevance', 'year', 'fa_rating', 'imdb_rating', 'fa_votes', 'imdb_votes', 'avg_rating') THEN
        v_safe_sort_field := 'relevance';
    END IF;

    v_order_clause := CASE v_safe_sort_field
        WHEN 'year' THEN format('ORDER BY m.year %s, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        WHEN 'fa_rating' THEN format('ORDER BY m.fa_rating %s NULLS LAST, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        WHEN 'imdb_rating' THEN format('ORDER BY m.imdb_rating %s NULLS LAST, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        WHEN 'fa_votes' THEN format('ORDER BY m.fa_votes %s NULLS LAST, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        WHEN 'imdb_votes' THEN format('ORDER BY m.imdb_votes %s NULLS LAST, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        WHEN 'avg_rating' THEN format('ORDER BY m.avg_rating %s NULLS LAST, m.relevance ASC, m.id ASC', v_safe_sort_direction)
        ELSE 'ORDER BY m.relevance ASC, m.id ASC'
    END;

    -- Optimización de Proyección: Solo incluir columnas de ordenación secundaria si son necesarias en CTEs intermedias
    -- En portada limpia (relevance y media_type 'all'), permite que PostgreSQL realice un Index Only Scan sobre idx_movies_relevance_id
    IF v_safe_sort_field = 'year' THEN
        v_sort_col_select := ', m.year';
        v_bm_sort_col_select := ', bm.year';
    ELSIF v_safe_sort_field = 'fa_rating' THEN
        v_sort_col_select := ', m.fa_rating';
        v_bm_sort_col_select := ', bm.fa_rating';
    ELSIF v_safe_sort_field = 'imdb_rating' THEN
        v_sort_col_select := ', m.imdb_rating';
        v_bm_sort_col_select := ', bm.imdb_rating';
    ELSIF v_safe_sort_field = 'fa_votes' THEN
        v_sort_col_select := ', m.fa_votes';
        v_bm_sort_col_select := ', bm.fa_votes';
    ELSIF v_safe_sort_field = 'imdb_votes' THEN
        v_sort_col_select := ', m.imdb_votes';
        v_bm_sort_col_select := ', bm.imdb_votes';
    ELSIF v_safe_sort_field = 'avg_rating' THEN
        v_sort_col_select := ', m.avg_rating';
        v_bm_sort_col_select := ', bm.avg_rating';
    ELSE
        v_sort_col_select := '';
        v_bm_sort_col_select := '';
    END IF;

    -- Incluir columna type solo si se filtra explícitamente por 'movies' o 'series'
    IF lower(coalesce(media_type, 'all')) = 'movies' THEN
        v_type_col_select := ', m.type';
        v_bm_type_col_select := ', bm.type';
        v_media_type_filter := '(bm.type IS NULL OR bm.type NOT ILIKE ''S%'')';
    ELSIF lower(coalesce(media_type, 'all')) = 'series' THEN
        v_type_col_select := ', m.type';
        v_bm_type_col_select := ', bm.type';
        v_media_type_filter := 'bm.type ILIKE ''S%''';
    ELSE
        v_type_col_select := '';
        v_bm_type_col_select := '';
        v_media_type_filter := 'TRUE';
    END IF;

    -- FASE 1.1: DETECCIÓN DE FILTROS TEMÁTICOS ACTIVOS
    v_has_filters := (genre_name IS NOT NULL AND TRIM(genre_name) <> '')
                  OR (country_name IS NOT NULL AND TRIM(country_name) <> '')
                  OR (p_country_codes IS NOT NULL AND array_length(p_country_codes, 1) > 0)
                  OR (p_selection_code IS NOT NULL AND TRIM(p_selection_code) <> '')
                  OR (p_studio_code IS NOT NULL AND TRIM(p_studio_code) <> '')
                  OR (p_year_start IS NOT NULL)
                  OR (p_year_end IS NOT NULL)
                  OR (excluded_genres IS NOT NULL AND array_length(excluded_genres, 1) > 0)
                  OR (excluded_countries IS NOT NULL AND array_length(excluded_countries, 1) > 0)
                  OR (media_type IS NOT NULL AND lower(media_type) IN ('movies', 'series'));

    -- FASE 1.2: EVALUACIÓN DE DAILY SHOWCASE (Escaparate Diario Dinámico de Portada Limpia)
    -- Aplica en relevancia por defecto EXCLUSIVAMENTE en la portada general limpia:
    -- Sin filtros temáticos, sin búsqueda por texto y sin filtro de personas VIP (director/actor).
    -- Los filtros temáticos, búsquedas y filmografías se ordenan estrictamente por mérito canónico (relevance ASC, id ASC)
    -- para desbloquear parada temprana por índice (Early Stop) y latencia ultra-baja (~3 ms).
    IF v_safe_sort_field = 'relevance' 
       AND NOT v_has_filters
       AND (search_term IS NULL OR TRIM(search_term) = '')
       AND (director_name IS NULL OR TRIM(director_name) = '')
       AND (actor_name IS NULL OR TRIM(actor_name) = '') THEN
        
        v_enable_daily_showcase := TRUE;
        v_showcase_limit := 378;
        v_threshold_expr := v_showcase_limit::text;
        v_outer_threshold_expr := v_showcase_limit::text;
        v_include_total_matches := get_count;

        v_order_clause := format('
            ORDER BY 
                CASE WHEN m.natural_rank <= (%s) THEN 0 ELSE 1 END ASC,
                CASE WHEN m.natural_rank <= (%s) 
                     THEN hashtext(m.id::text || (CURRENT_TIMESTAMP AT TIME ZONE ''Europe/Madrid'')::date::text) 
                END ASC,
                m.natural_rank ASC
        ', v_threshold_expr, v_threshold_expr);

        v_outer_order_clause := format('
            ORDER BY 
                CASE WHEN fm.natural_rank <= (%s) THEN 0 ELSE 1 END ASC,
                CASE WHEN fm.natural_rank <= (%s) 
                     THEN hashtext(fm.id::text || (CURRENT_TIMESTAMP AT TIME ZONE ''Europe/Madrid'')::date::text) 
                END ASC,
                fm.natural_rank ASC
        ', v_outer_threshold_expr, v_outer_threshold_expr);
    ELSE
        v_enable_daily_showcase := FALSE;
        v_include_total_matches := FALSE;
        v_outer_order_clause := v_order_clause;
    END IF;

    -- Validación de límites de paginación (evita valores negativos o abusivos)
    v_limit := LEAST(GREATEST(COALESCE(page_limit, 50), 1), 100);
    v_offset := GREATEST(COALESCE(page_offset, 0), 0);

    -- FASE 1.3: VALIDACIÓN DE TAMAÑO MÁXIMO DE ARRAYS Y BÚSQUEDA (INPUT INFLATION DOS)
    -- Evita el consumo abusivo de CPU por desanidado (unnest), lematización lingüística (plainto_tsquery)
    -- o normalización (unaccent) de colecciones o cadenas sobredimensionadas.
    IF (p_country_codes IS NOT NULL AND array_length(p_country_codes, 1) > 10)
       OR (excluded_genres IS NOT NULL AND array_length(excluded_genres, 1) > 10)
       OR (excluded_countries IS NOT NULL AND array_length(excluded_countries, 1) > 10)
       OR (search_term IS NOT NULL AND length(search_term) > 100) THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;

    -- FASE 1.4: MITIGACIÓN DE ABUSO POR PAGINACIÓN PROFUNDA (DEEP PAGINATION DOS)
    -- El catálogo completo contiene ~15.000 títulos. Un offset superior a 15.000 excede el volumen total
    -- de la plataforma y representa un vector de consumo abusivo de CPU/IOPS mediante ordenación y descarte masivo.
    -- Cortocircuitamos inmediatamente devolviendo un conjunto vacío sin evaluar CTEs, ordenaciones ni conteos.
    IF v_offset > 15000 THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;

    -- FASE 1.5: VALIDACIÓN DE LONGITUD MÍNIMA DE TÉRMINO DE BÚSQUEDA
    IF search_term IS NOT NULL AND length(TRIM(search_term)) > 0 AND length(TRIM(search_term)) < 3 THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;

    -- FASE 1.6: FAST-PATH QUIRÚRGICO DE PORTADA LIMPIA (DAILY SHOWCASE)
    -- Si la consulta es para el escaparate limpio de portada, dentro de los 378 títulos del pool
    -- y no requiere conteo, cortocircuitamos con Index-Only Scan sobre idx_movies_relevance_id (~1.5 ms).
    IF v_enable_daily_showcase 
       AND NOT v_has_filters 
       AND v_showcase_limit = 378 
       AND (v_offset + v_limit <= 378) 
       AND NOT get_count THEN

        WITH raw_showcase AS (
            SELECT id
            FROM public.movies
            ORDER BY relevance ASC, id ASC
            LIMIT 378
        ),
        showcase_pool AS (
            SELECT id,
                   ROW_NUMBER() OVER () AS natural_rank
            FROM raw_showcase
        ),
        paged_ids AS (
            SELECT sp.id, sp.natural_rank,
                   hashtext(sp.id::text || (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date::text) AS hash_val
            FROM showcase_pool sp
            ORDER BY hash_val ASC, sp.natural_rank ASC
            LIMIT v_limit OFFSET v_offset
        )
        SELECT json_build_object(
            'total', -1,
            'items', COALESCE(
                (
                    SELECT json_agg(rows)
                    FROM (
                        SELECT
                            m.id, m.title, 
                            CASE WHEN lower(m.original_title) = lower(m.title) THEN NULL ELSE m.original_title END as original_title,
                            m.year, 
                            CASE WHEN m.type ILIKE 'S%' THEN m.year_end ELSE NULL END as year_end,
                            m.type, 
                            m.genres_list AS genres,
                            m.directors_list AS directors, 
                            m.actors_list AS actors, 
                            c.name AS country,
                            c.code AS country_code, 
                            m.minutes, m.fa_id, 
                            m.fa_rating, m.fa_votes,
                            m.imdb_id, m.imdb_rating, m.imdb_votes, 
                            m.avg_rating,
                            m.synopsis, m.thumbhash_st,
                            EXTRACT(EPOCH FROM m.last_synced_at)::INT as last_synced_at,
                            CASE WHEN m.type ILIKE 'S%' THEN m.episodes ELSE NULL END as episodes,
                            m.wikipedia,
                            m.selections_list, m.studios_list, m.justwatch, m.slug
                        FROM paged_ids fm
                        JOIN public.movies m ON fm.id = m.id
                        LEFT JOIN public.countries c ON m.country_id = c.id
                        ORDER BY fm.hash_val ASC, fm.natural_rank ASC
                    ) as rows
                ),
                '[]'::json
            )
        )
        INTO v_json_result;

        RETURN v_json_result;
    END IF;

    -- FASE 2: PRE-PROCESAMIENTO DE PAÍSES Y GRUPOS REGIONALES
    IF p_country_codes IS NOT NULL AND array_length(p_country_codes, 1) > 0 THEN
        SELECT array_agg(c.id) INTO v_country_ids FROM public.countries c WHERE lower(c.code) = ANY(SELECT lower(x) FROM unnest(p_country_codes) x);
        IF v_country_ids IS NULL THEN v_country_ids := '{}'; END IF;
    ELSIF country_name IS NOT NULL AND country_name != '' THEN
        SELECT array_agg(c.id) INTO v_country_ids FROM public.countries c 
        WHERE lower(c.region) = ANY(SELECT lower(trim(x)) FROM unnest(string_to_array(country_name, ',')) x)
           OR c.name_norm = ANY(SELECT public.unaccent_immutable(lower(trim(x))) FROM unnest(string_to_array(country_name, ',')) x)
           OR c.code = ANY(SELECT upper(trim(x)) FROM unnest(string_to_array(country_name, ',')) x);
        IF v_country_ids IS NULL THEN
            v_country_ids := '{}';
        END IF;
    END IF;

    IF excluded_countries IS NOT NULL AND array_length(excluded_countries, 1) > 0 THEN
        SELECT array_agg(c.id) INTO v_excluded_country_ids FROM public.countries c 
        WHERE lower(c.region) = ANY(SELECT lower(trim(x)) FROM unnest(excluded_countries) x)
           OR c.name_norm = ANY(SELECT public.unaccent_immutable(lower(trim(x))) FROM unnest(excluded_countries) x)
           OR c.code = ANY(SELECT upper(trim(x)) FROM unnest(excluded_countries) x);
    END IF;

    -- FASE 3: LÓGICA CONDICIONAL DE CONTEO (Pintar Primero -> Contar Después)
    IF get_count THEN
        IF v_include_total_matches THEN
            -- Reutiliza el total calculado por la función de ventana sin re-escanear la tabla
            v_count_cte := '';
            v_count_select := 'COALESCE((SELECT total_matches FROM paged_ids LIMIT 1), (SELECT count(*) AS value FROM filtered_movies))';
        ELSE
            v_count_cte := ', total AS (SELECT count(*) AS value FROM filtered_movies)';
            v_count_select := '(SELECT value FROM total)';
        END IF;
    ELSE
        v_count_cte := '';
        v_count_select := '-1';
    END IF;

    -- FASE 3.5: RESOLUCIÓN DE GÉNEROS Y SINÓNIMOS A TSQUERY (PRECOMPUTADO O(1))
    -- Cruza directamente contra `genres.genre_tsquery` precompilado, evitando lematizaciones en caliente
    IF genre_name IS NOT NULL AND TRIM(genre_name) <> '' THEN
        SELECT string_agg(COALESCE(g.genre_tsquery, plainto_tsquery('spanish', terms.g_term))::text, ' | ')::tsquery
        INTO v_genre_tsquery
        FROM (
            SELECT replace(public.unaccent_immutable(lower(trim(x))), 'sci-fi', 'scifi') AS g_term
            FROM unnest(string_to_array(genre_name, ',')) x
            WHERE trim(x) <> ''
        ) terms
        LEFT JOIN public.genres g 
          ON g.name_norm = terms.g_term 
          OR terms.g_term = ANY(g.synonyms);
    END IF;

    -- FASE 3.6: RESOLUCIÓN DE DIRECTORES (SLUGS, PAREJAS / COLECTIVOS Y ALFANUMÉRICO)
    IF director_name IS NOT NULL AND TRIM(director_name) != '' THEN
        SELECT string_agg(websearch_to_tsquery('simple', '"' || public.unaccent_immutable(d_name) || '"')::text, ' | ')::tsquery,
               array_agg(lower(public.unaccent_immutable(trim(d_name))))
        INTO v_director_tsquery, v_director_names
        FROM (
            SELECT d.name AS d_name
            FROM public.people d
            WHERE d.type IN ('D', 'DA', 'AD')
              AND (
                   d.slug = public.unaccent_immutable(lower(regexp_replace(regexp_replace(director_name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '')))
                OR d.name_norm = public.unaccent_immutable(lower(director_name))
                OR regexp_replace(d.name_norm, '[^a-z0-9]', '', 'g') = regexp_replace(public.unaccent_immutable(lower(director_name)), '[^a-z0-9]', '', 'g')
              )
            UNION
            SELECT d.name AS d_name
            FROM public.people d
            WHERE d.type IN ('D', 'DA', 'AD')
              AND d.components IS NOT NULL
              AND EXISTS (
                  SELECT 1 
                  FROM unnest(string_to_array(d.components, ',')) comp(name)
                  WHERE public.unaccent_immutable(lower(trim(comp.name))) = public.unaccent_immutable(lower(director_name))
                     OR regexp_replace(public.unaccent_immutable(lower(trim(comp.name))), '[^a-z0-9]', '', 'g') = regexp_replace(public.unaccent_immutable(lower(director_name)), '[^a-z0-9]', '', 'g')
              )
            UNION
            SELECT director_name
        ) alias_dirs;
    END IF;

    -- FASE 3.7: RESOLUCIÓN DE ACTOR (SLUGS, ALFANUMÉRICA Y DE NOMBRE CANÓNICO)
    IF actor_name IS NOT NULL AND TRIM(actor_name) != '' THEN
        SELECT string_agg(websearch_to_tsquery('simple', '"' || public.unaccent_immutable(a_name) || '"')::text, ' | ')::tsquery
        INTO v_actor_tsquery
        FROM (
            SELECT a.name AS a_name
            FROM public.people a
            WHERE a.type IN ('A', 'AD', 'DA')
              AND (
                   a.slug = public.unaccent_immutable(lower(regexp_replace(regexp_replace(actor_name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '')))
                OR a.name_norm = public.unaccent_immutable(lower(actor_name))
                OR regexp_replace(a.name_norm, '[^a-z0-9]', '', 'g') = regexp_replace(public.unaccent_immutable(lower(actor_name)), '[^a-z0-9]', '', 'g')
              )
            UNION
            SELECT actor_name
        ) alias_acts;
    END IF;

    -- FASE 3.8: PREPARACIÓN DE SELECCIÓN, ESTUDIO Y GÉNEROS EXCLUIDOS A TSQUERY
    IF p_selection_code IS NOT NULL AND TRIM(p_selection_code) <> '' THEN
        v_selection_tsquery := plainto_tsquery('simple', p_selection_code);
    END IF;

    IF p_studio_code IS NOT NULL AND TRIM(p_studio_code) <> '' THEN
        v_studio_tsquery := plainto_tsquery('simple', p_studio_code);
    END IF;

    IF excluded_genres IS NOT NULL AND array_length(excluded_genres, 1) > 0 THEN
        SELECT string_agg(COALESCE(g.genre_tsquery, plainto_tsquery('spanish', terms.g_term))::text, ' | ')::tsquery
        INTO v_excluded_genres_tsquery
        FROM (
            SELECT replace(public.unaccent_immutable(lower(trim(g))), 'sci-fi', 'scifi') AS g_term
            FROM unnest(excluded_genres) g
            WHERE trim(g) <> ''
        ) terms
        LEFT JOIN public.genres g 
          ON g.name_norm = terms.g_term 
          OR terms.g_term = ANY(g.synonyms);
    END IF;

    -- FASE 4: CONSTRUCCIÓN DINÁMICA DE LA CONSULTA SQL
    v_query := '
        WITH base_movies AS (
            SELECT m.id, m.relevance' || v_sort_col_select || v_type_col_select || '
            FROM public.movies m
            WHERE
                ($1 IS NULL OR $1 = '''' OR m.title_norm LIKE ''%'' || public.unaccent_immutable(lower($1)) || ''%'')
                AND ($2 IS NULL OR m.genres_tsv @@ $2)
                AND ($3 IS NULL OR m.year >= $3)
                AND ($4 IS NULL OR m.year <= $4)
                AND ($5 IS NULL OR m.country_id = ANY($5))
                AND ($6 IS NULL OR (
                    m.directors_tsv @@ $6
                    AND (
                        $13 IS NULL OR EXISTS (
                            SELECT 1 FROM unnest(string_to_array(m.directors_list, '','')) d_elem
                            WHERE lower(public.unaccent_immutable(trim(d_elem))) = ANY($13)
                        )
                    )
                ))
                AND ($7 IS NULL OR m.actors_tsv @@ $7)
                AND ($9 IS NULL OR m.selections_tsv @@ $9)
                AND ($10 IS NULL OR m.studios_tsv @@ $10)
                AND ($11 IS NULL OR NOT (m.genres_tsv @@ $11))
                AND ($12 IS NULL OR NOT (m.country_id = ANY($12)))
        ),
        filtered_movies AS (
            SELECT bm.id, bm.relevance' || v_bm_sort_col_select || v_bm_type_col_select || 
            CASE 
                WHEN v_enable_daily_showcase AND v_include_total_matches THEN ', ROW_NUMBER() OVER (ORDER BY bm.relevance ASC, bm.id ASC) AS natural_rank, COUNT(*) OVER () AS total_matches'
                WHEN v_enable_daily_showcase THEN ', ROW_NUMBER() OVER (ORDER BY bm.relevance ASC, bm.id ASC) AS natural_rank'
                ELSE '' 
            END || '
            FROM base_movies bm
            WHERE ' || v_media_type_filter || '
        )' || v_count_cte || ',
        paged_ids AS (
            SELECT m.id' || 
            CASE 
                WHEN v_enable_daily_showcase AND v_include_total_matches THEN ', m.natural_rank, m.total_matches'
                WHEN v_enable_daily_showcase THEN ', m.natural_rank'
                ELSE '' 
            END || ' 
            FROM filtered_movies m
            ' || v_order_clause || '
            LIMIT ' || v_limit || ' OFFSET ' || v_offset || '
        )
        SELECT json_build_object(
            ''total'', ' || v_count_select || ',
            ''items'', COALESCE(
                (
                    SELECT json_agg(rows)
                    FROM (
                        SELECT
                            m.id, m.title, 
                            CASE WHEN lower(m.original_title) = lower(m.title) THEN NULL ELSE m.original_title END as original_title,
                            m.year, 
                            CASE WHEN m.type ILIKE ''S%'' THEN m.year_end ELSE NULL END as year_end,
                            m.type, 
                            m.genres_list AS genres,
                            m.directors_list AS directors, 
                            m.actors_list AS actors, 
                            c.name AS country,
                            c.code AS country_code, 
                            m.minutes, m.fa_id, 
                            m.fa_rating, m.fa_votes,
                            m.imdb_id, m.imdb_rating, m.imdb_votes, 
                            m.avg_rating,
                            m.synopsis, m.thumbhash_st,
                            EXTRACT(EPOCH FROM m.last_synced_at)::INT as last_synced_at,
                            CASE WHEN m.type ILIKE ''S%'' THEN m.episodes ELSE NULL END as episodes,
                            m.wikipedia,
                            m.selections_list, m.studios_list, m.justwatch, m.slug
                        FROM paged_ids fm
                        JOIN public.movies m ON fm.id = m.id
                        LEFT JOIN public.countries c ON m.country_id = c.id
                        ' || v_outer_order_clause || '
                    ) as rows
                ),
                ''[]''::json
            )
        );
    ';
    
    -- FASE 5: EJECUCIÓN Y RETORNO JSON
    EXECUTE v_query
    INTO v_json_result
    USING
        search_term, v_genre_tsquery, p_year_start, p_year_end, v_country_ids, -- $1..$5
        v_director_tsquery, v_actor_tsquery, media_type, v_selection_tsquery, v_studio_tsquery, -- $6..$10
        v_excluded_genres_tsquery, v_excluded_country_ids, v_director_names; -- $11..$13
        
    RETURN v_json_result;
END;
$function$;

-- 4. HARDENING Y CONCESIÓN DE PERMISOS (Principio de Menor Privilegio)
REVOKE ALL ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) TO anon, authenticated, service_role;
