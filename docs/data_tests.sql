-- =================================================================
-- SUITE DECLARATIVA DE TESTS DE CALIDAD DE DATOS (docs/data_tests.sql)
-- =================================================================
-- Inspirada en los principios de dbt (Data Build Tool):
-- 1. Pruebas declarativas: not_null, unique, relationships, accepted_values.
-- 2. Cada aserción cuenta registros infractores (0 = PASS, >0 = FAIL).
-- 3. Modo auditoría (p_fail_fast = false): reporte completo PASS / FAIL.
-- 4. Modo producción (p_fail_fast = true): aborta la transacción con ROLLBACK
--    si se detecta alguna anomalía crítica en el pipeline de staging/ETL.
-- =================================================================

CREATE OR REPLACE FUNCTION public.run_data_tests(p_fail_fast BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
    test_name TEXT,
    category TEXT,
    severity TEXT,
    status TEXT,
    failed_records BIGINT,
    sample_query TEXT
) 
LANGUAGE plpgsql 
STABLE
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_count BIGINT;
    v_critical_failures INT := 0;
BEGIN
    -- =================================================================
    -- 1. CATEGORÍA: NOT_NULL (Columnas troncales obligatorias)
    -- =================================================================

    -- 1.1. Películas deben tener título y slug no vacíos
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE title IS NULL OR TRIM(title) = '' OR slug IS NULL OR TRIM(slug) = '';
    
    test_name := 'movies_title_slug_not_null'; 
    category := 'not_null'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title, slug FROM public.movies WHERE title IS NULL OR slug IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % registros sin título o slug.', test_name, v_count; 
    END IF;

    -- 1.2. Películas deben tener métrica de relevancia no nula
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE relevance IS NULL;
    
    test_name := 'movies_relevance_not_null'; 
    category := 'not_null'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title FROM public.movies WHERE relevance IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % películas sin relevancia.', test_name, v_count; 
    END IF;

    -- 1.3. Directores deben tener nombre y slug generados
    SELECT count(*) INTO v_count 
    FROM public.directors 
    WHERE name IS NULL OR TRIM(name) = '' OR slug IS NULL OR TRIM(slug) = '';
    
    test_name := 'directors_name_slug_not_null'; 
    category := 'not_null'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, name, slug FROM public.directors WHERE name IS NULL OR slug IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % directores sin nombre o slug.', test_name, v_count; 
    END IF;

    -- 1.4. Actores deben tener nombre y slug generados
    SELECT count(*) INTO v_count 
    FROM public.actors 
    WHERE name IS NULL OR TRIM(name) = '' OR slug IS NULL OR TRIM(slug) = '';
    
    test_name := 'actors_name_slug_not_null'; 
    category := 'not_null'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, name, slug FROM public.actors WHERE name IS NULL OR slug IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % actores sin nombre o slug.', test_name, v_count; 
    END IF;

    -- =================================================================
    -- 2. CATEGORÍA: UNIQUE (Unicidad estricta para URLs y claves)
    -- =================================================================

    -- 2.1. Unicidad de Slugs de Películas (crítico para rutas SEO)
    SELECT count(*) INTO v_count FROM (
        SELECT slug FROM public.movies GROUP BY slug HAVING count(*) > 1
    ) dup;
    
    test_name := 'movies_slug_unique'; 
    category := 'unique'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT slug, count(*) FROM public.movies GROUP BY slug HAVING count(*) > 1;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % slugs de películas duplicados.', test_name, v_count; 
    END IF;

    -- 2.2. Unicidad de FilmAffinity ID
    SELECT count(*) INTO v_count FROM (
        SELECT fa_id FROM public.movies WHERE fa_id IS NOT NULL GROUP BY fa_id HAVING count(*) > 1
    ) dup;
    
    test_name := 'movies_fa_id_unique'; 
    category := 'unique'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT fa_id, count(*) FROM public.movies WHERE fa_id IS NOT NULL GROUP BY fa_id HAVING count(*) > 1;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % fa_id duplicados.', test_name, v_count; 
    END IF;

    -- 2.3. Unicidad de Slugs de Directores
    SELECT count(*) INTO v_count FROM (
        SELECT slug FROM public.directors GROUP BY slug HAVING count(*) > 1
    ) dup;
    
    test_name := 'directors_slug_unique'; 
    category := 'unique'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT slug, count(*) FROM public.directors GROUP BY slug HAVING count(*) > 1;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % slugs de directores duplicados.', test_name, v_count; 
    END IF;

    -- 2.4. Unicidad de Slugs de Actores
    SELECT count(*) INTO v_count FROM (
        SELECT slug FROM public.actors GROUP BY slug HAVING count(*) > 1
    ) dup;
    
    test_name := 'actors_slug_unique'; 
    category := 'unique'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT slug, count(*) FROM public.actors GROUP BY slug HAVING count(*) > 1;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % slugs de actores duplicados.', test_name, v_count; 
    END IF;

    -- =================================================================
    -- 3. CATEGORÍA: RELATIONSHIPS (Integridad referencial y huérfanos)
    -- =================================================================

    -- 3.1. Países de Películas inexistentes
    SELECT count(*) INTO v_count 
    FROM public.movies m
    LEFT JOIN public.countries c ON m.country_id = c.id
    WHERE m.country_id IS NOT NULL AND c.id IS NULL;
    
    test_name := 'movies_country_id_fk_countries'; 
    category := 'relationships'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT m.id, m.country_id FROM public.movies m LEFT JOIN public.countries c ON m.country_id = c.id WHERE m.country_id IS NOT NULL AND c.id IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % películas con país huérfano.', test_name, v_count; 
    END IF;

    -- 3.2. Tabla de unión movie_directors sin película o sin director
    SELECT count(*) INTO v_count 
    FROM public.movie_directors md
    LEFT JOIN public.movies m ON md.movie_id = m.id
    LEFT JOIN public.directors d ON md.director_id = d.id
    WHERE m.id IS NULL OR d.id IS NULL;
    
    test_name := 'movie_directors_orphans'; 
    category := 'relationships'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT md.* FROM public.movie_directors md LEFT JOIN public.movies m ON md.movie_id = m.id LEFT JOIN public.directors d ON md.director_id = d.id WHERE m.id IS NULL OR d.id IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % relaciones N:M huérfanas en directores.', test_name, v_count; 
    END IF;

    -- 3.3. Tabla de unión movie_actors sin película o sin actor
    SELECT count(*) INTO v_count 
    FROM public.movie_actors ma
    LEFT JOIN public.movies m ON ma.movie_id = m.id
    LEFT JOIN public.actors a ON ma.actor_id = a.id
    WHERE m.id IS NULL OR a.id IS NULL;
    
    test_name := 'movie_actors_orphans'; 
    category := 'relationships'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT ma.* FROM public.movie_actors ma LEFT JOIN public.movies m ON ma.movie_id = m.id LEFT JOIN public.actors a ON ma.actor_id = a.id WHERE m.id IS NULL OR a.id IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % relaciones N:M huérfanas en actores.', test_name, v_count; 
    END IF;

    -- 3.4. Tabla de unión movie_genres sin película o sin género
    SELECT count(*) INTO v_count 
    FROM public.movie_genres mg
    LEFT JOIN public.movies m ON mg.movie_id = m.id
    LEFT JOIN public.genres g ON mg.genre_id = g.id
    WHERE m.id IS NULL OR g.id IS NULL;
    
    test_name := 'movie_genres_orphans'; 
    category := 'relationships'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT mg.* FROM public.movie_genres mg LEFT JOIN public.movies m ON mg.movie_id = m.id LEFT JOIN public.genres g ON mg.genre_id = g.id WHERE m.id IS NULL OR g.id IS NULL;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % relaciones N:M huérfanas en géneros.', test_name, v_count; 
    END IF;

    -- =================================================================
    -- 4. CATEGORÍA: ACCEPTED_VALUES & BUSINESS_RULES (Lógica de dominio)
    -- =================================================================

    -- 4.1. Rango de años de estreno válido (1888 primer film de la historia hasta 2100)
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE year IS NOT NULL AND (year < 1888 OR year > 2100);
    
    test_name := 'movies_year_range_valid'; 
    category := 'accepted_values'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title, year FROM public.movies WHERE year < 1888 OR year > 2100;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % películas con años fuera de rango.', test_name, v_count; 
    END IF;

    -- 4.2. Series con fecha de fin anterior a la de inicio
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE year_end IS NOT NULL AND year IS NOT NULL AND year_end < year;
    
    test_name := 'series_year_end_gte_year'; 
    category := 'business_rules'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title, year, year_end FROM public.movies WHERE year_end < year;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % series donde year_end < year.', test_name, v_count; 
    END IF;

    -- 4.3. Duración en minutos debe ser positiva si está presente
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE minutes IS NOT NULL AND minutes <= 0;
    
    test_name := 'movies_minutes_positive'; 
    category := 'business_rules'; 
    severity := 'WARN';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title, minutes FROM public.movies WHERE minutes <= 0;';
    RETURN NEXT;

    -- 4.4. Calificaciones en rango válido [0.0 - 10.0]
    SELECT count(*) INTO v_count 
    FROM public.movies 
    WHERE (fa_rating IS NOT NULL AND (fa_rating < 0 OR fa_rating > 10))
       OR (imdb_rating IS NOT NULL AND (imdb_rating < 0 OR imdb_rating > 10))
       OR (avg_rating IS NOT NULL AND (avg_rating < 0 OR avg_rating > 10));
       
    test_name := 'movies_ratings_in_bounds'; 
    category := 'accepted_values'; 
    severity := 'ERROR';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, title, fa_rating, imdb_rating, avg_rating FROM public.movies WHERE fa_rating < 0 OR fa_rating > 10 OR imdb_rating < 0 OR imdb_rating > 10;';
    IF v_count > 0 THEN v_critical_failures := v_critical_failures + 1; END IF;
    RETURN NEXT;
    IF p_fail_fast AND v_count > 0 THEN 
        RAISE EXCEPTION 'DATA TEST FAILED: [%] detectó % calificaciones fuera de [0, 10].', test_name, v_count; 
    END IF;

    -- 4.5. Integridad de Fechas de Personas (nacimiento <= fallecimiento)
    SELECT count(*) INTO v_count 
    FROM (
        SELECT id, birthday, deathday FROM public.directors WHERE birthday IS NOT NULL AND deathday IS NOT NULL AND deathday < birthday
        UNION ALL
        SELECT id, birthday, deathday FROM public.actors WHERE birthday IS NOT NULL AND deathday IS NOT NULL AND deathday < birthday
    ) p;
    
    test_name := 'people_dates_order_valid'; 
    category := 'business_rules'; 
    severity := 'WARN';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, birthday, deathday FROM public.directors WHERE birthday IS NOT NULL AND deathday IS NOT NULL AND deathday < birthday;';
    RETURN NEXT;

    -- 4.6. Integridad de Grupos Regionales en Países (accepted_values)
    SELECT count(*) INTO v_count 
    FROM public.countries 
    WHERE region IS NOT NULL AND lower(region) NOT IN ('nordic', 'latam');
    
    test_name := 'countries_region_valid'; 
    category := 'accepted_values'; 
    severity := 'WARN';
    failed_records := v_count;
    status := CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END;
    sample_query := 'SELECT id, code, name, region FROM public.countries WHERE region IS NOT NULL AND lower(region) NOT IN (''nordic'', ''latam'');';
    RETURN NEXT;

    -- Resumen informativo
    RAISE NOTICE '--- Data Quality Tests Finalizados: % pruebas ejecutadas, % fallos críticos ---', 15, v_critical_failures;
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.run_data_tests(BOOLEAN) TO authenticated, service_role;
