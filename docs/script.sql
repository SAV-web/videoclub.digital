-- =================================================================
-- SCRIPT MAESTRO DE CONFIGURACIÓN Y MIGRACIÓN - VIDEOCLUB.DIGITAL
-- =================================================================
-- Script idempotente y determinista. Estructura de ejecución:
-- 1. Habilitación de Extensiones y Espacio de Búsqueda
-- 2. Funciones Auxiliares, Esquema Base y Triggers de Staging
-- 3. Función de Búsqueda Principal (search_movies_offset)
-- 4. Tablas de Usuario y Triggers (user_movie_entries)
-- 5. Optimización de Rendimiento (Índices y Vistas Materializadas)
-- 6. Configuración de Seguridad (Row Level Security & Permisos)
-- 7. Ingesta Diferencial ETL (process_staging_data)
-- 8. Protocolo Post-Commit y Mantenimiento de Catálogo
-- =================================================================

-- =================================================================
-- PASO 1: HABILITACIÓN DE EXTENSIONES Y ESPACIO DE BÚSQUEDA
-- =================================================================
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions; -- Búsqueda insensible a diacríticos/acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;  -- Búsqueda por trigramas y similitud de texto

-- Garantiza que las clases de operadores de extensiones se resuelvan en cualquier entorno o instalación limpia
SET search_path = pg_catalog, public, extensions;

-- =================================================================
-- PASO 2: CREACIÓN DE FUNCIONES AUXILIARES Y DE UTILIDAD
-- MODIFICACIONES DE ESQUEMA Y ESTRUCTURA DE TABLAS
-- =================================================================
-- Función "wrapper" inmutable para `unaccent`, necesaria para crear índices funcionales.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS
$$ SELECT extensions.unaccent('extensions.unaccent', $1); $$;

-- Función para convertir texto a INTEGER de forma segura, devolviendo NULL en caso de error.
CREATE OR REPLACE FUNCTION public.to_integer_safe(v_input TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$ 
BEGIN 
    RETURN regexp_replace(v_input, '[^0-9-]', '', 'g')::INTEGER; 
EXCEPTION WHEN OTHERS THEN 
    RETURN NULL; 
END; $$;

-- Función para convertir texto a REAL de forma segura, devolviendo NULL en caso de error.
CREATE OR REPLACE FUNCTION public.to_real_safe(v_input TEXT)
RETURNS REAL LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$ 
BEGIN 
    RETURN replace(v_input, ',', '.')::REAL; 
EXCEPTION WHEN OTHERS THEN 
    RETURN NULL; 
END; $$;

-- Función para convertir texto a DATE de forma segura, soportando seriales Excel y formatos estándar.
CREATE OR REPLACE FUNCTION public.to_date_safe(v_input TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE
    v_clean text := TRIM(v_input);
BEGIN
    IF v_clean IS NULL OR v_clean = '' OR v_clean = '.' THEN
        RETURN NULL;
    END IF;
    IF v_clean ~ '^[0-9]{4,6}$' THEN
        RETURN DATE '1899-12-30' + v_clean::INTEGER;
    END IF;
    IF v_clean ~ '^[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}$' THEN
        RETURN TO_DATE(v_clean, 'DD/MM/YYYY');
    END IF;
    IF v_clean ~ '^[0-9]{4}[/-][0-9]{1,2}[/-][0-9]{1,2}$' THEN
        RETURN TO_DATE(v_clean, 'YYYY-MM-DD');
    END IF;
    RETURN v_clean::DATE;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END; $$;

-- =================================================================
-- 2.1. MODIFICACIONES DE ESQUEMA (Orden, biografías y colectivos)
-- =================================================================
ALTER TABLE public.movie_directors ADD COLUMN IF NOT EXISTS ordinality smallint;
ALTER TABLE public.directors ADD COLUMN IF NOT EXISTS titulo_bio text;
ALTER TABLE public.directors ADD COLUMN IF NOT EXISTS components text;
ALTER TABLE public.actors ADD COLUMN IF NOT EXISTS titulo_bio text;
ALTER TABLE public.people_staging ADD COLUMN IF NOT EXISTS titulo_bio text;
ALTER TABLE public.people_staging ADD COLUMN IF NOT EXISTS biography text;
ALTER TABLE public.people_staging ADD COLUMN IF NOT EXISTS components text;

-- =================================================================
-- 2.2. COLUMNAS GENERADAS (STORED) Y VECTORES DE BÚSQUEDA TSVECTOR
-- =================================================================
ALTER TABLE public.genres ADD COLUMN IF NOT EXISTS synonyms text[] DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'genres_tsv') THEN
        ALTER TABLE public.movies ADD COLUMN genres_tsv tsvector GENERATED ALWAYS AS (to_tsvector('spanish', replace(public.unaccent_immutable(lower(genres_list)), 'sci-fi', 'scifi'))) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'directors_tsv') THEN
        ALTER TABLE public.movies ADD COLUMN directors_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', public.unaccent_immutable(directors_list))) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'actors_tsv') THEN
        ALTER TABLE public.movies ADD COLUMN actors_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', public.unaccent_immutable(actors_list))) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'selections_tsv') THEN
        ALTER TABLE public.movies ADD COLUMN selections_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', public.unaccent_immutable(selections_list))) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'studios_tsv') THEN
        ALTER TABLE public.movies ADD COLUMN studios_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', public.unaccent_immutable(studios_list))) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'movies' AND column_name = 'avg_rating') THEN
        ALTER TABLE public.movies ADD COLUMN avg_rating real GENERATED ALWAYS AS (
            CASE
                WHEN (fa_rating IS NOT NULL AND fa_rating > 0) AND (imdb_rating IS NOT NULL AND imdb_rating > 0) THEN ((fa_rating + 0.5) + (imdb_rating - 0.3)) / 2.0
                ELSE NULL
            END
        ) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'genres' AND column_name = 'name_norm') THEN
        ALTER TABLE public.genres ADD COLUMN name_norm text GENERATED ALWAYS AS (replace(public.unaccent_immutable(lower(name)), 'sci-fi', 'scifi')) STORED;
    END IF;
END $$;

-- =================================================================
-- 2.3. TRIGGERS DE UPSERT EN STAGING (Compatibilidad Supabase CSV Import)
-- =================================================================
-- Intercepta inserciones estándar del importador CSV web y las convierte en UPDATE por clave primaria.

CREATE OR REPLACE FUNCTION public.handle_movies_staging_upsert()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    -- Si ya existe un registro con la misma imagen (PK), lo actualizamos
    IF EXISTS (SELECT 1 FROM public.movies_staging WHERE image = NEW.image) THEN
        UPDATE public.movies_staging SET
            title = NEW.title,
            year = NEW.year,
            year_end = NEW.year_end,
            type = NEW.type,
            fa_rating = NEW.fa_rating,
            fa_votes = NEW.fa_votes,
            imdb_rating = NEW.imdb_rating,
            imdb_votes = NEW.imdb_votes,
            original_title = NEW.original_title,
            country = NEW.country,
            minutes = NEW.minutes,
            directors = NEW.directors,
            actors = NEW.actors,
            genre = NEW.genre,
            synopsis = NEW.synopsis,
            fa_id = NEW.fa_id,
            imdb_id = NEW.imdb_id,
            collection = NEW.collection,
            episodes = NEW.episodes,
            wikipedia = NEW.wikipedia,
            relevance = NEW.relevance,
            studio = NEW.studio,
            justwatch = NEW.justwatch,
            show = NEW.show
        WHERE image = NEW.image;
        
        -- Retornamos NULL para cancelar la inserción original y evitar el error de PK
        RETURN NULL;
    END IF;
    
    -- Si no existe, procedemos con la inserción normal
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_movies_staging_upsert ON public.movies_staging;
CREATE TRIGGER on_movies_staging_upsert
BEFORE INSERT ON public.movies_staging
FOR EACH ROW EXECUTE PROCEDURE public.handle_movies_staging_upsert();

-- Trigger de UPSERT para people_staging
CREATE OR REPLACE FUNCTION public.handle_people_staging_upsert()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.people_staging WHERE id = NEW.id AND type = NEW.type) THEN
        UPDATE public.people_staging SET
            name = NEW.name,
            name_norm = NEW.name_norm,
            photo = NEW.photo,
            birthday = NEW.birthday,
            deathday = NEW.deathday,
            place_of_birth = NEW.place_of_birth,
            country_id = NEW.country_id,
            titulo_bio = NEW.titulo_bio,
            biography = NEW.biography,
            components = NEW.components
        WHERE id = NEW.id AND type = NEW.type;
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_people_staging_upsert ON public.people_staging;
CREATE TRIGGER on_people_staging_upsert
BEFORE INSERT ON public.people_staging
FOR EACH ROW EXECUTE PROCEDURE public.handle_people_staging_upsert();

-- =================================================================
-- PASO 3: FUNCIÓN DE BÚSQUEDA PRINCIPAL (SEARCH_MOVIES_OFFSET)
-- =================================================================
-- Limpieza de sobrecargas de versiones anteriores
DROP FUNCTION IF EXISTS public.search_movies_offset(text, text, integer, integer, text, text, text, text, text, text, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean);

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
    v_actor_tsquery tsquery;
BEGIN
    -- FASE 1: VALIDACIÓN
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

    -- Validación y Blindaje de Paginación (evita límites abusivos o negativos)
    v_limit := LEAST(GREATEST(COALESCE(page_limit, 50), 1), 100);
    v_offset := GREATEST(COALESCE(page_offset, 0), 0);

    -- FASE 1.5: VALIDACIÓN DE TÉRMINO DE BÚSQUEDA
    IF search_term IS NOT NULL AND length(TRIM(search_term)) > 0 AND length(TRIM(search_term)) < 3 THEN
        RETURN json_build_object('total', 0, 'items', '[]'::json);
    END IF;

    -- FASE 2: PRE-PROCESAMIENTO DE PAÍSES
    IF p_country_codes IS NOT NULL AND array_length(p_country_codes, 1) > 0 THEN
        SELECT array_agg(c.id) INTO v_country_ids FROM public.countries c WHERE lower(c.code) = ANY(SELECT lower(x) FROM unnest(p_country_codes) x);
        IF v_country_ids IS NULL THEN v_country_ids := '{}'; END IF;
    ELSIF country_name IS NOT NULL AND country_name != '' THEN
        SELECT array_agg(c.id) INTO v_country_ids FROM public.countries c 
        WHERE c.name_norm = ANY(SELECT public.unaccent_immutable(lower(x)) FROM unnest(string_to_array(country_name, ',')) x)
           OR c.code = ANY(SELECT upper(x) FROM unnest(string_to_array(country_name, ',')) x);
        IF v_country_ids IS NULL THEN
            v_country_ids := '{}';
        END IF;
    END IF;

    IF excluded_countries IS NOT NULL AND array_length(excluded_countries, 1) > 0 THEN
        SELECT array_agg(c.id) INTO v_excluded_country_ids FROM public.countries c WHERE c.name_norm = ANY(
            SELECT public.unaccent_immutable(lower(x)) FROM unnest(excluded_countries) x
        );
    END IF;

    -- FASE 3: LÓGICA CONDICIONAL DE CONTEO
    IF get_count THEN
        v_count_cte := ', total AS (SELECT count(*) AS value FROM filtered_movies)';
        v_count_select := '(SELECT value FROM total)';
    ELSE
        v_count_cte := '';
        v_count_select := '-1';
    END IF;

    -- FASE 3.5: RESOLUCIÓN DE GÉNEROS Y SINÓNIMOS A TSQUERY
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

    -- FASE 3.6: RESOLUCIÓN DE DIRECTORES (INCLUYENDO PAREJAS / COMPONENTES)
    IF director_name IS NOT NULL AND TRIM(director_name) != '' THEN
        SELECT string_agg(websearch_to_tsquery('simple', '"' || public.unaccent_immutable(d_name) || '"')::text, ' | ')::tsquery
        INTO v_director_tsquery
        FROM (
            SELECT d.name AS d_name
            FROM public.directors d
            WHERE d.name_norm = public.unaccent_immutable(lower(director_name))
               OR (
                   d.components IS NOT NULL AND EXISTS (
                       SELECT 1 
                       FROM unnest(string_to_array(d.components, ',')) comp(name)
                       WHERE public.unaccent_immutable(lower(trim(comp.name))) = public.unaccent_immutable(lower(director_name))
                   )
               )
            UNION
            SELECT director_name
        ) alias_dirs;
    END IF;

    -- FASE 3.7: PREPARACIÓN DE ACTOR
    IF actor_name IS NOT NULL AND TRIM(actor_name) != '' THEN
        v_actor_tsquery := websearch_to_tsquery('simple', '"' || public.unaccent_immutable(actor_name) || '"');
    END IF;

    -- FASE 4: CONSTRUCCIÓN DE CONSULTA
    v_query := '
        WITH filtered_movies AS (
            SELECT m.id, m.year, m.fa_rating, m.imdb_rating, m.fa_votes, m.imdb_votes, m.avg_rating, m.relevance
            FROM public.movies m
            WHERE
                ($1 IS NULL OR $1 = '''' OR m.title_norm LIKE ''%'' || public.unaccent_immutable(lower($1)) || ''%'')
                AND ($2 IS NULL OR m.genres_tsv @@ $2)
                AND ($3 IS NULL OR m.year >= $3)
                AND ($4 IS NULL OR m.year <= $4)
                AND ($5 IS NULL OR m.country_id = ANY($5))
                AND ($6 IS NULL OR m.directors_tsv @@ $6)
                AND ($7 IS NULL OR m.actors_tsv @@ $7)
                AND ($8 IS NULL OR $8 = ''all''
                     OR ($8 = ''movies'' AND (m.type IS NULL OR m.type NOT ILIKE ''S%''))
                     OR ($8 = ''series'' AND m.type ILIKE ''S%''))
                AND ($9 IS NULL OR m.selections_tsv @@ plainto_tsquery(''simple'', $9))
                AND ($10 IS NULL OR m.studios_tsv @@ plainto_tsquery(''simple'', $10))
                AND ($11 IS NULL OR NOT m.genres_tsv @@ (
                    SELECT string_agg(plainto_tsquery(''spanish'', public.unaccent_immutable(g))::text, '' | '')::tsquery FROM unnest($11) g
                ))
                AND ($12 IS NULL OR NOT (m.country_id = ANY($12)))
        )' || v_count_cte || ',
        paged_ids AS (
            SELECT m.id 
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
                            m.minutes, m.image, m.fa_id, 
                            m.fa_rating, m.fa_votes,
                            m.imdb_id, m.imdb_rating, m.imdb_votes, 
                            m.avg_rating,
                            m.synopsis, m.thumbhash_st,
                            EXTRACT(EPOCH FROM m.last_synced_at)::INT as last_synced_at,
                            CASE WHEN m.type ILIKE ''S%'' THEN m.episodes ELSE NULL END as episodes,
                            m.wikipedia,
                            m.selections_list, m.studios_list, m.justwatch
                        FROM paged_ids fm
                        JOIN public.movies m ON fm.id = m.id
                        LEFT JOIN public.countries c ON m.country_id = c.id
                        ' || v_order_clause || '
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
        search_term, v_genre_tsquery, p_year_start, p_year_end, v_country_ids, -- $1..$5
        v_director_tsquery, v_actor_tsquery, media_type, p_selection_code, p_studio_code, -- $6..$10
        excluded_genres, v_excluded_country_ids; -- $11..$12
        
    RETURN v_json_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_movies_offset(text, text, integer, integer, text, text[], text, text, text, text, text, text[], text[], text, text, integer, integer, boolean) TO anon, authenticated, service_role;

-- =================================================================
-- PASO 4: TABLAS DE USUARIO Y TRIGGERS
-- =================================================================

-- 4.1. Creación de la tabla consolidada 'user_movie_entries'
CREATE TABLE IF NOT EXISTS public.user_movie_entries (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_id BIGINT NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
    
    on_watchlist BOOLEAN DEFAULT false,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 10),
    watchlist_position INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT user_movie_entry_unique UNIQUE (user_id, movie_id)
);

-- 4.2. Creación de índices para optimizar el rendimiento de usuario
CREATE INDEX IF NOT EXISTS user_movie_entries_movie_id_idx ON public.user_movie_entries(movie_id);
ALTER TABLE public.user_movie_entries ADD COLUMN IF NOT EXISTS watchlist_position integer;
CREATE INDEX IF NOT EXISTS user_movie_entries_watchlist_pos_idx ON public.user_movie_entries (user_id, watchlist_position ASC NULLS LAST) WHERE on_watchlist = true;

-- 4.3. Función de trigger y trigger para 'updated_at'.
-- Esta función se reutiliza para la nueva tabla.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_movie_entries_update ON public.user_movie_entries;
CREATE TRIGGER on_user_movie_entries_update
BEFORE UPDATE ON public.user_movie_entries
FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- =================================================================
-- PASO 5: OPTIMIZACIÓN DE RENDIMIENTO (ÍNDICES Y VISTAS MATERIALIZADAS)
-- =================================================================

-- 5.1. Índices en Tablas Principales y Relaciones N:M
CREATE INDEX IF NOT EXISTS movies_title_norm_trgm_idx ON public.movies USING gin (title_norm extensions.gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS movies_image_unique_idx ON public.movies(image);
CREATE INDEX IF NOT EXISTS movies_relevance_idx ON public.movies(relevance ASC);
CREATE INDEX IF NOT EXISTS movies_year_idx ON public.movies(year DESC);
CREATE INDEX IF NOT EXISTS movies_avg_rating_idx ON public.movies(avg_rating DESC NULLS LAST, relevance ASC);
CREATE INDEX IF NOT EXISTS movies_fa_votes_idx ON public.movies(fa_votes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS movies_imdb_votes_idx ON public.movies(imdb_votes DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS movie_genres_genre_id_idx ON public.movie_genres(genre_id);
CREATE INDEX IF NOT EXISTS movie_directors_director_id_idx ON public.movie_directors(director_id);
CREATE INDEX IF NOT EXISTS movie_actors_actor_id_idx ON public.movie_actors(actor_id);
CREATE INDEX IF NOT EXISTS movie_selections_selection_id_idx ON public.movie_selections(selection_id);
CREATE INDEX IF NOT EXISTS movie_studios_studio_id_idx ON public.movie_studios(studio_id);

CREATE INDEX IF NOT EXISTS directors_name_norm_trgm_idx ON public.directors USING gin (name_norm extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS directors_components_trgm_idx ON public.directors USING gin (public.unaccent_immutable(lower(components)) extensions.gin_trgm_ops) WHERE components IS NOT NULL;
CREATE INDEX IF NOT EXISTS actors_name_norm_trgm_idx ON public.actors USING gin (name_norm extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS movies_genres_tsv_idx ON public.movies USING GIN(genres_tsv);
CREATE INDEX IF NOT EXISTS movies_directors_tsv_idx ON public.movies USING GIN(directors_tsv);
CREATE INDEX IF NOT EXISTS movies_actors_tsv_idx ON public.movies USING GIN(actors_tsv);
CREATE INDEX IF NOT EXISTS movies_selections_tsv_idx ON public.movies USING GIN(selections_tsv);
CREATE INDEX IF NOT EXISTS movies_studios_tsv_idx ON public.movies USING GIN(studios_tsv);

CREATE INDEX IF NOT EXISTS movies_country_id_year_desc_idx ON public.movies(country_id, year DESC);
CREATE INDEX IF NOT EXISTS movies_country_relevance_idx ON public.movies(country_id, relevance ASC);
CREATE INDEX IF NOT EXISTS movies_country_fa_votes_idx ON public.movies(country_id, fa_votes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS movies_country_imdb_votes_idx ON public.movies(country_id, imdb_votes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS movies_country_type_year_idx ON public.movies(country_id, type, year DESC);

ANALYZE public.movies;

-- =================================================================
-- 5.2. VISTAS MATERIALIZADAS PARA SUGERENCIAS (Auto-Convergencia Segura)
-- =================================================================
-- Comprueba la existencia de la estructura esperada y recrea con RESTRICT si está obsoleta.

-- 1. Actores (Auto-convergencia segura)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_actor_suggestions'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'mv_actor_suggestions' AND column_name = 'movie_count'
    ) THEN
        RAISE NOTICE 'Definición obsoleta detectada en mv_actor_suggestions. Recreando...';
        DROP MATERIALIZED VIEW public.mv_actor_suggestions RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_actor_suggestions'
    ) THEN
        CREATE MATERIALIZED VIEW public.mv_actor_suggestions AS
        SELECT a.id, a.name, a.name_norm, COUNT(ma.movie_id) AS movie_count
        FROM public.actors a LEFT JOIN public.movie_actors ma ON a.id = ma.actor_id
        GROUP BY a.id, a.name, a.name_norm;

        CREATE UNIQUE INDEX mv_actor_suggestions_id_idx ON public.mv_actor_suggestions(id);
        CREATE INDEX mv_actor_suggestions_name_norm_trgm_idx ON public.mv_actor_suggestions USING gin(name_norm extensions.gin_trgm_ops);
        CREATE INDEX mv_actor_suggestions_count_idx ON public.mv_actor_suggestions(movie_count DESC);
        REVOKE ALL ON TABLE public.mv_actor_suggestions FROM anon, authenticated, PUBLIC;
    END IF;
END $$;

-- 2. Directores (Auto-convergencia segura: verifica components y components_norm)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_director_suggestions'
    ) AND (
        NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'mv_director_suggestions' AND column_name = 'components_norm'
        ) OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'mv_director_suggestions' AND column_name = 'components'
        )
    ) THEN
        RAISE NOTICE 'Definición obsoleta detectada en mv_director_suggestions. Recreando...';
        DROP MATERIALIZED VIEW public.mv_director_suggestions RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_director_suggestions'
    ) THEN
        CREATE MATERIALIZED VIEW public.mv_director_suggestions AS
        SELECT 
            d.id, 
            d.name, 
            d.name_norm, 
            d.components,
            public.unaccent_immutable(lower(COALESCE(d.components, ''))) AS components_norm,
            COUNT(md.movie_id) AS movie_count
        FROM public.directors d 
        LEFT JOIN public.movie_directors md ON d.id = md.director_id
        GROUP BY d.id, d.name, d.name_norm, d.components;

        CREATE UNIQUE INDEX mv_director_suggestions_id_idx ON public.mv_director_suggestions(id);
        CREATE INDEX mv_director_suggestions_name_norm_trgm_idx ON public.mv_director_suggestions USING gin(name_norm extensions.gin_trgm_ops);
        CREATE INDEX mv_director_suggestions_comp_norm_trgm_idx ON public.mv_director_suggestions USING gin(components_norm extensions.gin_trgm_ops) WHERE components_norm <> '';
        CREATE INDEX mv_director_suggestions_count_idx ON public.mv_director_suggestions(movie_count DESC);
        REVOKE ALL ON TABLE public.mv_director_suggestions FROM anon, authenticated, PUBLIC;
    END IF;
END $$;

-- 3. Títulos (Auto-convergencia segura: verifica best_relevance)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_title_suggestions'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'mv_title_suggestions' AND column_name = 'best_relevance'
    ) THEN
        RAISE NOTICE 'Definición obsoleta detectada en mv_title_suggestions. Recreando...';
        DROP MATERIALIZED VIEW public.mv_title_suggestions RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_title_suggestions'
    ) THEN
        CREATE MATERIALIZED VIEW public.mv_title_suggestions AS
        SELECT title, title_norm, min(relevance) as best_relevance
        FROM public.movies
        GROUP BY title, title_norm;

        CREATE UNIQUE INDEX mv_title_suggestions_title_idx ON public.mv_title_suggestions(title);
        CREATE INDEX mv_title_suggestions_title_norm_trgm_idx ON public.mv_title_suggestions USING gin(title_norm extensions.gin_trgm_ops);
        CREATE INDEX mv_title_suggestions_relevance_idx ON public.mv_title_suggestions(best_relevance ASC);
        REVOKE ALL ON TABLE public.mv_title_suggestions FROM anon, authenticated, PUBLIC;
    END IF;
END $$;

-- =================================================================
-- FUNCIONES DE LECTURA Y SUGERENCIAS (SECURITY DEFINER)
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_actor_suggestions(search_term text)
RETURNS TABLE(suggestion text) LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    SELECT name FROM public.mv_actor_suggestions
    WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
      AND name_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
    ORDER BY movie_count DESC
    LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_director_suggestions(search_term text)
RETURNS TABLE(suggestion text) LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    WITH direct_matches AS (
        -- 1. Coincidencia directa por el nombre del director o colectivo/dúo
        SELECT 
            d.name AS suggestion, 
            d.movie_count,
            CASE 
                WHEN d.name_norm LIKE public.unaccent_immutable(lower(search_term)) || '%' THEN 1
                WHEN d.name_norm LIKE '% ' || public.unaccent_immutable(lower(search_term)) || '%' THEN 2
                ELSE 3
            END AS prefix_rank
        FROM public.mv_director_suggestions d
        WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
          AND d.name_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
    ),
    component_matches AS (
        -- 2. Si el nombre del dúo NO coincide directamente, pero sí uno de sus integrantes
        -- Filtramos primero por d.components_norm con el índice GIN trigrama antes del unnest
        SELECT 
            TRIM(comp.name) AS suggestion, 
            d.movie_count,
            CASE 
                WHEN public.unaccent_immutable(lower(TRIM(comp.name))) LIKE public.unaccent_immutable(lower(search_term)) || '%' THEN 1
                WHEN public.unaccent_immutable(lower(TRIM(comp.name))) LIKE '% ' || public.unaccent_immutable(lower(search_term)) || '%' THEN 2
                ELSE 3
            END AS prefix_rank
        FROM public.mv_director_suggestions d
        CROSS JOIN LATERAL unnest(string_to_array(d.components, ',')) AS comp(name)
        WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
          AND d.components IS NOT NULL
          AND d.components_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
          AND d.name_norm NOT LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
          AND public.unaccent_immutable(lower(TRIM(comp.name))) LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
        
        UNION ALL
        
        -- 3. Sugerir también el nombre del colectivo/dúo cuando se busca a un integrante específico
        SELECT 
            d.name AS suggestion, 
            d.movie_count,
            CASE 
                WHEN public.unaccent_immutable(lower(TRIM(comp.name))) LIKE public.unaccent_immutable(lower(search_term)) || '%' THEN 1
                WHEN public.unaccent_immutable(lower(TRIM(comp.name))) LIKE '% ' || public.unaccent_immutable(lower(search_term)) || '%' THEN 2
                ELSE 3
            END AS prefix_rank
        FROM public.mv_director_suggestions d
        CROSS JOIN LATERAL unnest(string_to_array(d.components, ',')) AS comp(name)
        WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
          AND d.components IS NOT NULL
          AND d.components_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
          AND d.name_norm NOT LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
          AND public.unaccent_immutable(lower(TRIM(comp.name))) LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
    ),
    all_matches AS (
        SELECT * FROM direct_matches
        UNION ALL
        SELECT * FROM component_matches
    )
    SELECT suggestion
    FROM all_matches
    GROUP BY suggestion
    ORDER BY min(prefix_rank) ASC, max(movie_count) DESC, suggestion ASC
    LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_title_suggestions(search_term text)
RETURNS TABLE(suggestion text) LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    SELECT title FROM public.mv_title_suggestions
    WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
      AND title_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
    ORDER BY best_relevance ASC
    LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.get_genre_suggestions(search_term text)
RETURNS TABLE(suggestion text) LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    SELECT name FROM public.genres
    WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
      AND (
          name_norm LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%'
          OR EXISTS (SELECT 1 FROM unnest(synonyms) s WHERE public.unaccent_immutable(lower(s)) LIKE '%' || public.unaccent_immutable(lower(search_term)) || '%')
      )
    ORDER BY length(name) ASC
    LIMIT 5;
$$;

CREATE OR REPLACE FUNCTION public.get_country_suggestions(search_term text)
RETURNS TABLE(suggestion text) LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    SELECT name FROM public.countries
    WHERE search_term IS NOT NULL AND length(trim(search_term)) >= 2
      AND similarity(name_norm, public.unaccent_immutable(lower(search_term))) > 0.2
    ORDER BY similarity(name_norm, public.unaccent_immutable(lower(search_term))) DESC
    LIMIT 5;
$$;

-- =================================================================
-- FUNCIONES PARA FILTROS DINÁMICOS (TOP 100 ALEATORIO)
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_random_top_actors(limit_count int DEFAULT 5)
RETURNS TABLE(name text) LANGUAGE sql VOLATILE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    WITH top_actors AS (
        SELECT name
        FROM public.mv_actor_suggestions
        ORDER BY movie_count DESC
        LIMIT 200
    )
    SELECT name FROM top_actors ORDER BY random() LIMIT LEAST(GREATEST(COALESCE(limit_count, 5), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.get_random_top_directors(limit_count int DEFAULT 5)
RETURNS TABLE(name text) LANGUAGE sql VOLATILE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
    WITH top_directors AS (
        SELECT name
        FROM public.mv_director_suggestions
        ORDER BY movie_count DESC
        LIMIT 200
    )
    SELECT name FROM top_directors ORDER BY random() LIMIT LEAST(GREATEST(COALESCE(limit_count, 5), 1), 20);
$$;

-- Revocación de permisos por defecto a PUBLIC y concesión explícita controlada
REVOKE ALL ON FUNCTION public.get_actor_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_actor_suggestions(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_director_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_director_suggestions(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_title_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_title_suggestions(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_genre_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_genre_suggestions(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_country_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_country_suggestions(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_random_top_actors(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_random_top_actors(int) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_random_top_directors(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_random_top_directors(int) TO anon, authenticated, service_role;

-- =================================================================
-- PASO 6: CONFIGURACIÓN DE SEGURIDAD (ROW LEVEL SECURITY & PERMISOS)
-- =================================================================

-- 6.1. Habilitamos RLS y lectura pública en tablas de catálogo
DO $$ 
DECLARE 
    t_name TEXT; 
    public_tables TEXT[] := ARRAY[
        'movies', 'actors', 'directors', 'genres', 'countries', 'selections', 'studios',
        'movie_actors', 'movie_directors', 'movie_genres', 'movie_selections', 'movie_studios'
    ];
BEGIN
    FOREACH t_name IN ARRAY public_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = t_name AND policyname = 'Enable read access for all users'
        ) THEN
            EXECUTE format('CREATE POLICY "Enable read access for all users" ON public.%I FOR SELECT USING (true);', t_name);
        END IF;
    END LOOP;
END; $$;

-- 6.2. Seguridad estricta para tablas de staging (Acceso exclusivo a service_role)
ALTER TABLE public.movies_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_staging ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.movies_staging, public.people_staging FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.movies_staging, public.people_staging TO service_role;

DROP POLICY IF EXISTS "Staging access restricted to service_role" ON public.movies_staging;
CREATE POLICY "Staging access restricted to service_role" ON public.movies_staging FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "People staging access restricted to service_role" ON public.people_staging;
CREATE POLICY "People staging access restricted to service_role" ON public.people_staging FOR ALL TO service_role USING (true);

-- 6.3. Políticas RLS consolidadas para la tabla 'user_movie_entries'
ALTER TABLE public.user_movie_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Los usuarios pueden gestionar sus propias entradas" ON public.user_movie_entries;
DROP POLICY IF EXISTS "Los usuarios pueden leer sus propias entradas" ON public.user_movie_entries;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_movie_entries;

CREATE POLICY "Los usuarios pueden gestionar sus propias entradas"
ON public.user_movie_entries FOR ALL
USING ( auth.uid() = user_id )
WITH CHECK ( auth.uid() = user_id );

-- =================================================================
-- PASO 7: INGESTA DIFERENCIAL ETL (PROCESS_STAGING_DATA)
-- =================================================================
-- Pipeline transaccional idempotente:
-- 1. Bloqueo transaccional de exclusión mutua (pg_advisory_xact_lock).
-- 2. Actualización diferencial de personas VIPs (fotos, biografías, componentes).
-- 3. UPSERT diferencial en catálogo movies con detección de cambios reales.
-- 4. Reconciliación N:M mediante tabla temporal y pre-agregación lineal O(N1 + N2 + ...).

CREATE OR REPLACE FUNCTION public.process_staging_data()
RETURNS json
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $function$
DECLARE
    sync_timestamp TIMESTAMP WITH TIME ZONE := NOW();
    affected_movie_ids INT[];
    directors_modified_count INT := 0;
    actors_modified_count INT := 0;
    people_modified_count INT := 0;
BEGIN
    -- 1. BLOQUEO TRANSACCIONAL DE EXCLUSIÓN MUTUA
    -- Evita que dos sincronizaciones de staging se ejecuten concurrentemente
    PERFORM pg_advisory_xact_lock(hashtext('cinelog_staging_sync'));

    -- =================================================================
    -- FASE 0: POBLAR Y ENRIQUECER CATÁLOGOS BASE DESDE MOVIES_STAGING Y PEOPLE_STAGING
    -- =================================================================
    INSERT INTO public.genres (name)
    SELECT DISTINCT TRIM(g.name) FROM public.movies_staging, UNNEST(STRING_TO_ARRAY(genre, ',')) AS g(name)
    WHERE genre IS NOT NULL AND TRIM(g.name) <> '' ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.directors (name)
    SELECT DISTINCT TRIM(d.name) FROM public.movies_staging, UNNEST(STRING_TO_ARRAY(directors, ',')) AS d(name)
    WHERE directors IS NOT NULL AND TRIM(d.name) <> '' ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.directors (name)
    SELECT DISTINCT TRIM(p.name) FROM public.people_staging p
    WHERE p.type = 'D' AND TRIM(p.name) <> '' ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.actors (name)
    SELECT DISTINCT TRIM(a.name) FROM public.movies_staging, UNNEST(STRING_TO_ARRAY(actors, ',')) AS a(name)
    WHERE actors IS NOT NULL AND TRIM(a.name) <> '' AND actors <> '(A)' ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.actors (name)
    SELECT DISTINCT TRIM(p.name) FROM public.people_staging p
    WHERE p.type = 'A' AND TRIM(p.name) <> '' ON CONFLICT (name) DO NOTHING;
    
    INSERT INTO public.selections (code, name)
    SELECT DISTINCT TRIM(s.code), TRIM(s.code) FROM public.movies_staging, UNNEST(STRING_TO_ARRAY(collection, ',')) AS s(code)
    WHERE collection IS NOT NULL AND TRIM(s.code) <> '' ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.studios (code, name)
    SELECT DISTINCT TRIM(s.code), TRIM(s.code) FROM public.movies_staging, UNNEST(STRING_TO_ARRAY(studio, ',')) AS s(code)
    WHERE studio IS NOT NULL AND TRIM(s.code) <> '' ON CONFLICT (name) DO NOTHING;

    -- =================================================================
    -- FASE 1: ACTUALIZACIÓN DIFERENCIAL DE PERSONAS (VIPs, Fotos, Biografías, Componentes)
    -- =================================================================
    -- Actualizar directores desde people_staging (sólo cambios reales)
    UPDATE public.directors d
    SET
        photo = p.photo,
        birthday = public.to_date_safe(p.birthday),
        deathday = public.to_date_safe(p.deathday),
        place_of_birth = p.place_of_birth,
        country_id = c.id,
        titulo_bio = p.titulo_bio,
        biography = p.biography,
        components = p.components
    FROM public.people_staging p
    LEFT JOIN public.countries c ON c.name_norm = lower(trim(p.country_id)) OR lower(trim(c.name)) = lower(trim(p.country_id))
    WHERE d.name = p.name AND p.type = 'D' AND (
        d.photo IS DISTINCT FROM p.photo OR
        d.birthday IS DISTINCT FROM public.to_date_safe(p.birthday) OR
        d.deathday IS DISTINCT FROM public.to_date_safe(p.deathday) OR
        d.place_of_birth IS DISTINCT FROM p.place_of_birth OR
        d.country_id IS DISTINCT FROM c.id OR
        d.titulo_bio IS DISTINCT FROM p.titulo_bio OR
        d.biography IS DISTINCT FROM p.biography OR
        d.components IS DISTINCT FROM p.components
    );
    GET DIAGNOSTICS directors_modified_count = ROW_COUNT;

    -- Actualizar actores desde people_staging (sólo cambios reales)
    UPDATE public.actors a
    SET
        photo = p.photo,
        birthday = public.to_date_safe(p.birthday),
        deathday = public.to_date_safe(p.deathday),
        place_of_birth = p.place_of_birth,
        country_id = c.id,
        titulo_bio = p.titulo_bio,
        biography = p.biography
    FROM public.people_staging p
    LEFT JOIN public.countries c ON c.name_norm = lower(trim(p.country_id)) OR lower(trim(c.name)) = lower(trim(p.country_id))
    WHERE a.name = p.name AND p.type = 'A' AND (
        a.photo IS DISTINCT FROM p.photo OR
        a.birthday IS DISTINCT FROM public.to_date_safe(p.birthday) OR
        a.deathday IS DISTINCT FROM public.to_date_safe(p.deathday) OR
        a.place_of_birth IS DISTINCT FROM p.place_of_birth OR
        a.country_id IS DISTINCT FROM c.id OR
        a.titulo_bio IS DISTINCT FROM p.titulo_bio OR
        a.biography IS DISTINCT FROM p.biography
    );
    GET DIAGNOSTICS actors_modified_count = ROW_COUNT;
    people_modified_count := directors_modified_count + actors_modified_count;

    -- =================================================================
    -- FASE 2: UPSERT DIFERENCIAL DE PELÍCULAS
    -- =================================================================
    WITH upserted_movies AS (
        INSERT INTO public.movies (
            relevance, image, title, year, year_end, type, fa_rating, fa_votes, imdb_rating, imdb_votes,
            original_title, country_id, minutes, synopsis, fa_id, imdb_id, last_synced_at, episodes, wikipedia, justwatch,
            genres_list, directors_list, actors_list, selections_list, studios_list
        )
        SELECT
            public.to_integer_safe(s.relevance::TEXT), TRIM(s.image), s.title, public.to_integer_safe(s.year::TEXT),
            s.year_end, s.type, public.to_real_safe(s.fa_rating::TEXT), public.to_integer_safe(s.fa_votes::TEXT),
            public.to_real_safe(s.imdb_rating::TEXT), public.to_integer_safe(s.imdb_votes::TEXT),
            s.original_title, c.id, public.to_integer_safe(s.minutes::TEXT), s.synopsis, s.fa_id,
            s.imdb_id, sync_timestamp, public.to_integer_safe(s.episodes::TEXT), TRIM(s.wikipedia), TRIM(s.justwatch),
            s.genre, s.directors, s.actors, s.collection, s.studio
        FROM public.movies_staging s
        LEFT JOIN public.countries c ON TRIM(s.country) = c.name
        WHERE s.image IS NOT NULL AND TRIM(s.image) <> '' AND s.show = 'S'
        ON CONFLICT (image) DO UPDATE SET
            relevance = EXCLUDED.relevance, title = EXCLUDED.title, year = EXCLUDED.year, year_end = EXCLUDED.year_end, type = EXCLUDED.type,
            fa_rating = EXCLUDED.fa_rating, fa_votes = EXCLUDED.fa_votes, imdb_rating = EXCLUDED.imdb_rating, imdb_votes = EXCLUDED.imdb_votes,
            original_title = EXCLUDED.original_title, country_id = EXCLUDED.country_id, minutes = EXCLUDED.minutes, synopsis = EXCLUDED.synopsis,
            fa_id = EXCLUDED.fa_id, imdb_id = EXCLUDED.imdb_id, last_synced_at = sync_timestamp,
            episodes = EXCLUDED.episodes, wikipedia = EXCLUDED.wikipedia, justwatch = EXCLUDED.justwatch,
            genres_list = EXCLUDED.genres_list, directors_list = EXCLUDED.directors_list, actors_list = EXCLUDED.actors_list,
            selections_list = EXCLUDED.selections_list, studios_list = EXCLUDED.studios_list
        WHERE
            movies.relevance IS DISTINCT FROM EXCLUDED.relevance OR
            movies.title IS DISTINCT FROM EXCLUDED.title OR
            movies.year IS DISTINCT FROM EXCLUDED.year OR
            movies.year_end IS DISTINCT FROM EXCLUDED.year_end OR
            movies.type IS DISTINCT FROM EXCLUDED.type OR
            movies.fa_rating IS DISTINCT FROM EXCLUDED.fa_rating OR
            movies.fa_votes IS DISTINCT FROM EXCLUDED.fa_votes OR
            movies.imdb_rating IS DISTINCT FROM EXCLUDED.imdb_rating OR
            movies.imdb_votes IS DISTINCT FROM EXCLUDED.imdb_votes OR
            movies.original_title IS DISTINCT FROM EXCLUDED.original_title OR
            movies.country_id IS DISTINCT FROM EXCLUDED.country_id OR
            movies.minutes IS DISTINCT FROM EXCLUDED.minutes OR
            movies.synopsis IS DISTINCT FROM EXCLUDED.synopsis OR
            movies.fa_id IS DISTINCT FROM EXCLUDED.fa_id OR
            movies.imdb_id IS DISTINCT FROM EXCLUDED.imdb_id OR
            movies.episodes IS DISTINCT FROM EXCLUDED.episodes OR
            movies.wikipedia IS DISTINCT FROM EXCLUDED.wikipedia OR
            movies.justwatch IS DISTINCT FROM EXCLUDED.justwatch OR
            movies.genres_list IS DISTINCT FROM EXCLUDED.genres_list OR
            movies.directors_list IS DISTINCT FROM EXCLUDED.directors_list OR
            movies.actors_list IS DISTINCT FROM EXCLUDED.actors_list OR
            movies.selections_list IS DISTINCT FROM EXCLUDED.selections_list OR
            movies.studios_list IS DISTINCT FROM EXCLUDED.studios_list
        RETURNING id
    )
    SELECT array_agg(id) INTO affected_movie_ids FROM upserted_movies;

    -- =================================================================
    -- FASE 3: RELACIONES DIFERENCIALES CON TABLA TEMPORAL Y PRE-AGREGACIÓN LINEAL
    -- =================================================================
    IF affected_movie_ids IS NOT NULL AND array_length(affected_movie_ids, 1) > 0 THEN
        -- Creamos tabla temporal de trabajo con las películas afectadas para evitar 10 escaneos a staging
        CREATE TEMP TABLE tmp_affected_staging ON COMMIT DROP AS
        SELECT s.*, m.id AS movie_id
        FROM public.movies_staging s
        JOIN public.movies m ON TRIM(s.image) = m.image
        WHERE m.id = ANY(affected_movie_ids);

        -- Inserciones desde tabla temporal
        INSERT INTO public.movie_genres (movie_id, genre_id)
        SELECT t.movie_id, g.id
        FROM tmp_affected_staging t
        CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.genre, ',')) AS genre_name(name)
        JOIN public.genres g ON g.name = TRIM(genre_name.name)
        ON CONFLICT (movie_id, genre_id) DO NOTHING;

        INSERT INTO public.movie_directors (movie_id, director_id, ordinality)
        SELECT DISTINCT ON (t.movie_id, d.id) t.movie_id, d.id, director_name.ordinality
        FROM tmp_affected_staging t
        CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(REPLACE(t.directors, ', ', ','), ',')) WITH ORDINALITY AS director_name(name, ordinality)
        JOIN public.directors d ON d.name = TRIM(director_name.name)
        ORDER BY t.movie_id, d.id, director_name.ordinality ASC
        ON CONFLICT (movie_id, director_id) DO UPDATE SET ordinality = EXCLUDED.ordinality;

        INSERT INTO public.movie_actors (movie_id, actor_id, ordinality)
        SELECT DISTINCT ON (t.movie_id, a.id) t.movie_id, a.id, actor_name.ordinality
        FROM tmp_affected_staging t
        CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(REPLACE(t.actors, ', ', ','), ',')) WITH ORDINALITY AS actor_name(name, ordinality)
        JOIN public.actors a ON a.name = TRIM(actor_name.name)
        WHERE t.actors <> '(A)'
        ORDER BY t.movie_id, a.id, actor_name.ordinality ASC
        ON CONFLICT (movie_id, actor_id) DO UPDATE SET ordinality = EXCLUDED.ordinality;

        INSERT INTO public.movie_selections (movie_id, selection_id)
        SELECT t.movie_id, c.id
        FROM tmp_affected_staging t
        CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.collection, ',')) AS sel_code(code)
        JOIN public.selections c ON c.code = TRIM(sel_code.code)
        ON CONFLICT (movie_id, selection_id) DO NOTHING;

        INSERT INTO public.movie_studios (movie_id, studio_id)
        SELECT t.movie_id, st.id
        FROM tmp_affected_staging t
        CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.studio, ',')) AS stu_code(code)
        JOIN public.studios st ON st.code = TRIM(stu_code.code)
        ON CONFLICT (movie_id, studio_id) DO NOTHING;

        -- Borrados diferenciales desde tabla temporal
        DELETE FROM public.movie_genres mg
        WHERE mg.movie_id = ANY(affected_movie_ids)
          AND NOT EXISTS (
            SELECT 1 FROM tmp_affected_staging t
            CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.genre, ',')) AS g_name(name)
            JOIN public.genres g ON g.name = TRIM(g_name.name)
            WHERE t.movie_id = mg.movie_id AND g.id = mg.genre_id
          );

        DELETE FROM public.movie_directors md
        WHERE md.movie_id = ANY(affected_movie_ids)
          AND NOT EXISTS (
            SELECT 1 FROM tmp_affected_staging t
            CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(REPLACE(t.directors, ', ', ','), ',')) AS d_name(name)
            JOIN public.directors d ON d.name = TRIM(d_name.name)
            WHERE t.movie_id = md.movie_id AND d.id = md.director_id
          );

        DELETE FROM public.movie_actors ma
        WHERE ma.movie_id = ANY(affected_movie_ids)
          AND NOT EXISTS (
            SELECT 1 FROM tmp_affected_staging t
            CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(REPLACE(t.actors, ', ', ','), ',')) AS a_name(name)
            JOIN public.actors a ON a.name = TRIM(a_name.name)
            WHERE t.movie_id = ma.movie_id AND a.id = ma.actor_id
          );

        DELETE FROM public.movie_selections ms
        WHERE ms.movie_id = ANY(affected_movie_ids)
          AND NOT EXISTS (
            SELECT 1 FROM tmp_affected_staging t
            CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.collection, ',')) AS s_code(code)
            JOIN public.selections sel ON sel.code = TRIM(s_code.code)
            WHERE t.movie_id = ms.movie_id AND sel.id = ms.selection_id
          );

        DELETE FROM public.movie_studios mst
        WHERE mst.movie_id = ANY(affected_movie_ids)
          AND NOT EXISTS (
            SELECT 1 FROM tmp_affected_staging t
            CROSS JOIN LATERAL UNNEST(STRING_TO_ARRAY(t.studio, ',')) AS stu_code(code)
            JOIN public.studios stu ON stu.code = TRIM(stu_code.code)
            WHERE t.movie_id = mst.movie_id AND stu.id = mst.studio_id
          );

        -- Reagregación lineal sin producto cartesiano
        WITH agg_genres AS (
            SELECT mg.movie_id, STRING_AGG(g.name, ', ' ORDER BY g.name) AS genres
            FROM public.movie_genres mg
            JOIN public.genres g ON mg.genre_id = g.id
            WHERE mg.movie_id = ANY(affected_movie_ids)
            GROUP BY mg.movie_id
        ),
        agg_directors AS (
            SELECT movie_id, STRING_AGG(director_name, ', ' ORDER BY min_ordinality) AS directors
            FROM (
                SELECT md.movie_id, d.name AS director_name, MIN(md.ordinality) AS min_ordinality
                FROM public.movie_directors md
                JOIN public.directors d ON md.director_id = d.id
                WHERE md.movie_id = ANY(affected_movie_ids)
                GROUP BY md.movie_id, d.name
            ) unique_dirs
            GROUP BY movie_id
        ),
        agg_actors AS (
            SELECT movie_id, STRING_AGG(actor_name, ', ' ORDER BY min_ordinality) AS actors
            FROM (
                SELECT ma.movie_id, a.name AS actor_name, MIN(ma.ordinality) AS min_ordinality
                FROM public.movie_actors ma
                JOIN public.actors a ON ma.actor_id = a.id
                WHERE ma.movie_id = ANY(affected_movie_ids)
                GROUP BY ma.movie_id, a.name
            ) unique_acts
            GROUP BY movie_id
        ),
        agg_selections AS (
            SELECT ms.movie_id, STRING_AGG(DISTINCT sel.code, ',') AS selections
            FROM public.movie_selections ms
            JOIN public.selections sel ON ms.selection_id = sel.id
            WHERE ms.movie_id = ANY(affected_movie_ids)
            GROUP BY ms.movie_id
        ),
        agg_studios AS (
            SELECT mst.movie_id, STRING_AGG(DISTINCT stu.code, ',') AS studios
            FROM public.movie_studios mst
            JOIN public.studios stu ON mst.studio_id = stu.id
            WHERE mst.movie_id = ANY(affected_movie_ids)
            GROUP BY mst.movie_id
        )
        UPDATE public.movies m
        SET
            genres_list = COALESCE(ag.genres, ''),
            directors_list = COALESCE(ad.directors, ''),
            actors_list = COALESCE(aa.actors, ''),
            selections_list = ags.selections,
            studios_list = astu.studios
        FROM (SELECT unnest(affected_movie_ids) AS id) aff
        LEFT JOIN agg_genres ag ON ag.movie_id = aff.id
        LEFT JOIN agg_directors ad ON ad.movie_id = aff.id
        LEFT JOIN agg_actors aa ON aa.movie_id = aff.id
        LEFT JOIN agg_selections ags ON ags.movie_id = aff.id
        LEFT JOIN agg_studios astu ON astu.movie_id = aff.id
        WHERE m.id = aff.id;
    END IF;

    -- =================================================================
    -- RETORNO INFORMATIVO DE LA INGESTA DIFERENCIAL
    -- =================================================================
    RETURN json_build_object(
        'movies_affected', COALESCE(array_length(affected_movie_ids, 1), 0),
        'people_affected', people_modified_count,
        'has_changes', (COALESCE(array_length(affected_movie_ids, 1), 0) > 0 OR people_modified_count > 0),
        'synced_at', sync_timestamp
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_staging_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_staging_data() TO service_role;

-- =================================================================
-- PASO 8: PROTOCOLO POST-COMMIT Y MANTENIMIENTO DE CATÁLOGO
-- =================================================================
-- NOTA ARQUITECTÓNICA Y POLÍTICA DE DATOS:
-- 1. REFRESH MATERIALIZED VIEW CONCURRENTLY no se ejecuta dentro de transacciones activas.
-- 2. Los CSVs de ingesta contienen siempre la información consolidada de cada película.
-- 3. La columna show = 'S' opera como Filtro de Admisión (Gatekeeper) en la carga.
-- 4. La ausencia en staging se interpreta como carga incremental; no se ejecutan DELETEs ciegos.
--
-- FASE 1: Ingesta Transaccional
--   SELECT public.process_staging_data();
--
-- FASE 2: Refresco Concurrente y Mantenimiento de Estadísticas (Worker o SQL Editor)
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_actor_suggestions;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_director_suggestions;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_title_suggestions;
--
--   ANALYZE public.mv_actor_suggestions;
--   ANALYZE public.mv_director_suggestions;
--   ANALYZE public.mv_title_suggestions;
--   ANALYZE public.movies;
--   ANALYZE public.actors;
--   ANALYZE public.directors;
--   ANALYZE public.movie_genres;
--   ANALYZE public.movie_directors;
--   ANALYZE public.movie_actors;
--   ANALYZE public.movie_selections;
--   ANALYZE public.movie_studios;
--
-- 8.1. Actualización de Sinónimos de Géneros (Idempotente)
UPDATE public.genres SET synonyms = ARRAY['action', 'adrenalina'] WHERE name = 'Acción' AND synonyms IS DISTINCT FROM ARRAY['action', 'adrenalina'];
UPDATE public.genres SET synonyms = ARRAY['adventure', 'epico'] WHERE name = 'Aventuras' AND synonyms IS DISTINCT FROM ARRAY['adventure', 'epico'];
UPDATE public.genres SET synonyms = ARRAY['animation', 'animado', 'dibujos', 'cgi'] WHERE name = 'Animación' AND synonyms IS DISTINCT FROM ARRAY['animation', 'animado', 'dibujos', 'cgi'];
UPDATE public.genres SET synonyms = ARRAY['biography', 'biografico', 'biopic'] WHERE name = 'Biografía' AND synonyms IS DISTINCT FROM ARRAY['biography', 'biografico', 'biopic'];
UPDATE public.genres SET synonyms = ARRAY['comedy', 'humor', 'comico'] WHERE name = 'Comedia' AND synonyms IS DISTINCT FROM ARRAY['comedy', 'humor', 'comico'];
UPDATE public.genres SET synonyms = ARRAY['crime', 'policiaco', 'policial', 'criminal', 'delito', 'mafia'] WHERE name = 'Crimen' AND synonyms IS DISTINCT FROM ARRAY['crime', 'policiaco', 'policial', 'criminal', 'delito', 'mafia'];
UPDATE public.genres SET synonyms = ARRAY['documentary'] WHERE name = 'Documental' AND synonyms IS DISTINCT FROM ARRAY['documentary'];
UPDATE public.genres SET synonyms = ARRAY['dramatico'] WHERE name = 'Drama' AND synonyms IS DISTINCT FROM ARRAY['dramatico'];
UPDATE public.genres SET synonyms = ARRAY['family'] WHERE name = 'Familiar' AND synonyms IS DISTINCT FROM ARRAY['family'];
UPDATE public.genres SET synonyms = ARRAY['fantasy', 'fantastico'] WHERE name = 'Fantasía' AND synonyms IS DISTINCT FROM ARRAY['fantasy', 'fantastico'];
UPDATE public.genres SET synonyms = ARRAY['filmnoir', 'negro', 'neo-noir', 'cine negro'] WHERE name = 'Noir' AND synonyms IS DISTINCT FROM ARRAY['filmnoir', 'negro', 'neo-noir', 'cine negro'];
UPDATE public.genres SET synonyms = ARRAY['history', 'epoca'] WHERE name = 'Histórico' AND synonyms IS DISTINCT FROM ARRAY['history', 'epoca'];
UPDATE public.genres SET synonyms = ARRAY['horror', 'miedo'] WHERE name = 'Terror' AND synonyms IS DISTINCT FROM ARRAY['horror', 'miedo'];
UPDATE public.genres SET synonyms = ARRAY['music', 'canciones'] WHERE name = 'Música' AND synonyms IS DISTINCT FROM ARRAY['music', 'canciones'];
UPDATE public.genres SET synonyms = ARRAY['mystery', 'misterio', 'enigma', 'investigacion'] WHERE name = 'Intriga' AND synonyms IS DISTINCT FROM ARRAY['mystery', 'misterio', 'enigma', 'investigacion'];
UPDATE public.genres SET synonyms = ARRAY['love', 'romantico', 'amor'] WHERE name = 'Romance' AND synonyms IS DISTINCT FROM ARRAY['love', 'romantico', 'amor'];
UPDATE public.genres SET synonyms = ARRAY['scifi', 'ciencia-ficcion', 'ciencia ficcion', 'futurista', 'distopia'] WHERE name = 'Sci-Fi' AND synonyms IS DISTINCT FROM ARRAY['scifi', 'ciencia-ficcion', 'ciencia ficcion', 'futurista', 'distopia'];
UPDATE public.genres SET synonyms = ARRAY['short', 'cortometraje'] WHERE name = 'Corto' AND synonyms IS DISTINCT FROM ARRAY['short', 'cortometraje'];
UPDATE public.genres SET synonyms = ARRAY['sport'] WHERE name = 'Deporte' AND synonyms IS DISTINCT FROM ARRAY['sport'];
UPDATE public.genres SET synonyms = ARRAY['suspense', 'psicologico', 'tension'] WHERE name = 'Thriller' AND synonyms IS DISTINCT FROM ARRAY['suspense', 'psicologico', 'tension'];
UPDATE public.genres SET synonyms = ARRAY['war', 'guerra'] WHERE name = 'Bélico' AND synonyms IS DISTINCT FROM ARRAY['war', 'guerra'];
UPDATE public.genres SET synonyms = ARRAY['oeste', 'vaqueros'] WHERE name = 'Western' AND synonyms IS DISTINCT FROM ARRAY['oeste', 'vaqueros'];