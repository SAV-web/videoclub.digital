-- =================================================================
-- SCRIPT DE CONSOLIDACIÓN DEFINITIVA Y LIMPIEZA TOTAL EN SUPABASE
-- Archivo: docs/drop_views_and_old_tables.sql
-- =================================================================
-- Ejecuta este script en el SQL Editor de Supabase.
--
-- Acciones:
-- 1. Actualizar la función RPC search_movies_offset para que consulte
--    directamente 'public.people' filtrando por 'type', desacoplándose
--    por completo de las vistas 'directors' y 'actors'.
-- 2. Eliminar las tablas transitorias de respaldo 'old_directors' y 'old_actors'.
-- 3. Eliminar definitivamente las vistas 'public.directors' y 'public.actors'.
-- 4. Eliminar columnas e índices temporales de migración en 'public.people'.
-- 5. Actualizar estadísticas del optimizador (ANALYZE).
-- =================================================================

BEGIN;

-- -----------------------------------------------------------------
-- 1. ACTUALIZACIÓN DE search_movies_offset
-- -----------------------------------------------------------------
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
    v_enable_daily_showcase BOOLEAN := FALSE;
    v_has_filters BOOLEAN := FALSE;
    v_showcase_limit INT := 378;
    v_threshold_expr TEXT := '';
    v_outer_threshold_expr TEXT := '';
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

    -- FASE 1.2: EVALUACIÓN DE DAILY SHOWCASE
    IF v_safe_sort_field = 'relevance' 
       AND (search_term IS NULL OR TRIM(search_term) = '')
       AND (director_name IS NULL OR TRIM(director_name) = '')
       AND (actor_name IS NULL OR TRIM(actor_name) = '') THEN
        
        v_enable_daily_showcase := TRUE;

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

        IF (p_selection_code IS NOT NULL AND TRIM(p_selection_code) <> '') 
           OR (p_studio_code IS NOT NULL AND TRIM(p_studio_code) <> '') THEN
            v_showcase_limit := 377;
        ELSE
            v_showcase_limit := 378;
        END IF;

        IF v_has_filters THEN
            v_threshold_expr := 'CASE WHEN m.total_matches < 50 THEN 12 WHEN m.total_matches <= 200 THEN 24 ELSE 42 END';
            v_outer_threshold_expr := 'CASE WHEN fm.total_matches < 50 THEN 12 WHEN fm.total_matches <= 200 THEN 24 ELSE 42 END';
        ELSE
            v_threshold_expr := v_showcase_limit::text;
            v_outer_threshold_expr := v_showcase_limit::text;
        END IF;

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
        v_outer_order_clause := v_order_clause;
    END IF;

    -- Paginación
    v_limit := LEAST(GREATEST(COALESCE(page_limit, 50), 1), 100);
    v_offset := GREATEST(COALESCE(page_offset, 0), 0);

    -- Validación longitud de búsqueda
    IF search_term IS NOT NULL AND length(TRIM(search_term)) > 0 AND length(TRIM(search_term)) < 3 THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;

    -- FASE 2: PRE-PROCESAMIENTO DE PAÍSES
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

    -- FASE 3: LÓGICA DE CONTEO
    IF get_count THEN
        v_count_cte := ', total AS (SELECT count(*) AS value FROM filtered_movies)';
        v_count_select := '(SELECT value FROM total)';
    ELSE
        v_count_cte := '';
        v_count_select := '-1';
    END IF;

    -- FASE 3.5: RESOLUCIÓN DE GÉNEROS
    IF genre_name IS NOT NULL AND TRIM(genre_name) != '' THEN
        SELECT string_agg(plainto_tsquery('spanish', replace(public.unaccent_immutable(lower(g_term)), 'sci-fi', 'scifi'))::text, ' | ')::tsquery
        INTO v_genre_tsquery
        FROM (
            SELECT DISTINCT g.name_norm AS g_term
            FROM public.genres g
            WHERE g.name_norm = ANY(SELECT replace(public.unaccent_immutable(lower(trim(x))), 'sci-fi', 'scifi') FROM unnest(string_to_array(genre_name, ',')) x)
               OR EXISTS (
                   SELECT 1 FROM unnest(g.synonyms) syn
                   WHERE public.unaccent_immutable(lower(syn)) = ANY(SELECT replace(public.unaccent_immutable(lower(trim(x))), 'sci-fi', 'scifi') FROM unnest(string_to_array(genre_name, ',')) x)
               )
            UNION
            SELECT replace(public.unaccent_immutable(lower(trim(x))), 'sci-fi', 'scifi')
            FROM unnest(string_to_array(genre_name, ',')) x
            WHERE trim(x) <> ''
        ) terms;
    END IF;

    -- FASE 3.6: RESOLUCIÓN DE DIRECTORES DIRECTO SOBRE 'PEOPLE'
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
                OR (
                    d.components IS NOT NULL AND EXISTS (
                        SELECT 1 
                        FROM unnest(string_to_array(d.components, ',')) comp(name)
                        WHERE public.unaccent_immutable(lower(trim(comp.name))) = public.unaccent_immutable(lower(director_name))
                           OR regexp_replace(public.unaccent_immutable(lower(trim(comp.name))), '[^a-z0-9]', '', 'g') = regexp_replace(public.unaccent_immutable(lower(director_name)), '[^a-z0-9]', '', 'g')
                    )
                )
              )
            UNION
            SELECT director_name
        ) alias_dirs;
    END IF;

    -- FASE 3.7: RESOLUCIÓN DE ACTORES DIRECTO SOBRE 'PEOPLE'
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

    -- FASE 4: CONSTRUCCIÓN DINÁMICA DE LA CONSULTA SQL
    v_query := '
        WITH base_movies AS (
            SELECT m.id, m.year, m.fa_rating, m.imdb_rating, m.fa_votes, m.imdb_votes, m.avg_rating, m.relevance, m.type
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
                AND ($9 IS NULL OR m.selections_tsv @@ plainto_tsquery(''simple'', $9))
                AND ($10 IS NULL OR m.studios_tsv @@ plainto_tsquery(''simple'', $10))
                AND ($11 IS NULL OR NOT m.genres_tsv @@ (
                    SELECT string_agg(plainto_tsquery(''spanish'', public.unaccent_immutable(g))::text, '' | '')::tsquery FROM unnest($11) g
                ))
                AND ($12 IS NULL OR NOT (m.country_id = ANY($12)))
        ),
        filtered_movies AS (
            SELECT bm.id, bm.year, bm.fa_rating, bm.imdb_rating, bm.fa_votes, bm.imdb_votes, bm.avg_rating, bm.relevance' || 
            CASE WHEN v_enable_daily_showcase THEN ', ROW_NUMBER() OVER (ORDER BY bm.relevance ASC, bm.id ASC) AS natural_rank, COUNT(*) OVER () AS total_matches' ELSE '' END || '
            FROM base_movies bm
            WHERE
                ($8 IS NULL OR $8 = ''all''
                 OR ($8 = ''movies'' AND (bm.type IS NULL OR bm.type NOT ILIKE ''S%''))
                 OR ($8 = ''series'' AND bm.type ILIKE ''S%''))
        )' || v_count_cte || ',
        paged_ids AS (
            SELECT m.id' || CASE WHEN v_enable_daily_showcase THEN ', m.natural_rank, m.total_matches' ELSE '' END || ' 
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
    
    -- FASE 5: EJECUCIÓN
    EXECUTE v_query
    INTO v_json_result
    USING
        search_term, v_genre_tsquery, p_year_start, p_year_end, v_country_ids,
        v_director_tsquery, v_actor_tsquery, media_type, p_selection_code, p_studio_code,
        excluded_genres, v_excluded_country_ids, v_director_names;
        
    RETURN v_json_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------
-- 2. ELIMINACIÓN DE VISTAS OBSOLETAS 'directors' Y 'actors'
-- -----------------------------------------------------------------
DROP VIEW IF EXISTS public.directors CASCADE;
DROP VIEW IF EXISTS public.actors CASCADE;

-- -----------------------------------------------------------------
-- 3. ELIMINACIÓN DE TABLAS TRANSITORIAS DE RESPALDO
-- -----------------------------------------------------------------
DROP TABLE IF EXISTS public.old_directors CASCADE;
DROP TABLE IF EXISTS public.old_actors CASCADE;

-- -----------------------------------------------------------------
-- 4. ELIMINACIÓN DE COLUMNAS E ÍNDICES TEMPORALES EN 'people'
-- -----------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_people_old_dir_id;
DROP INDEX IF EXISTS public.idx_people_old_act_id;
ALTER TABLE public.people DROP COLUMN IF EXISTS old_director_id;
ALTER TABLE public.people DROP COLUMN IF EXISTS old_actor_id;

-- -----------------------------------------------------------------
-- 5. OPTIMIZACIÓN DE ESTADÍSTICAS
-- -----------------------------------------------------------------
ANALYZE public.people;
ANALYZE public.movies;
ANALYZE public.movie_directors;
ANALYZE public.movie_actors;

COMMIT;
