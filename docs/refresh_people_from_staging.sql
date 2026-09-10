-- =================================================================
-- SCRIPT DE REFRESCO Y ENRIQUECIMIENTO DE PERSONAS DESDE STAGING
-- Archivo: docs/refresh_people_from_staging.sql
-- =================================================================
-- Instrucciones de uso:
-- 1. Si vas a cargar un CSV nuevo de personas:
--    Ve a Supabase -> Table Editor -> 'people_staging' -> Import data from CSV.
-- 2. Ejecuta este script en el SQL Editor de Supabase.
--
-- ¿Qué hace este script?
-- - Cruza 'people_staging' con 'public.people' por nombre normalizado.
-- - Restaura / actualiza: birthday, deathday, place_of_birth, country_id,
--   titulo_bio, biography y components.
-- - Marca automáticamente como vip = 1 a toda persona que tenga biografía
--   redactada o título biográfico.
-- - Reconcilia el campo 'type' (D, A, AD, DA) según los roles presentes.
-- - Inserta personas que existan en el CSV pero no estuvieran en 'people'.
-- - Refresca las vistas materializadas de autocompletado.
-- =================================================================

BEGIN;

-- PASO 1: Asegurar que las personas que YA tienen biografía en 'people' tengan vip = 1
UPDATE public.people
SET vip = 1
WHERE biography IS NOT NULL AND TRIM(biography) <> '' AND vip = 0;

-- PASO 2: Upsert e Inserción de personas faltantes desde people_staging
INSERT INTO public.people (name, type, vip)
SELECT DISTINCT
    TRIM(p.name),
    COALESCE(NULLIF(UPPER(TRIM(p.type)), ''), 'A'),
    CASE WHEN p.biography IS NOT NULL AND TRIM(p.biography) <> '' THEN 1 ELSE 0 END
FROM public.people_staging p
WHERE p.name IS NOT NULL AND TRIM(p.name) <> ''
ON CONFLICT (name) DO NOTHING;

-- PASO 3: Actualización masiva de metadatos biográficos desde people_staging
WITH dedup_staging AS (
    SELECT DISTINCT ON (public.unaccent_immutable(lower(trim(p.name))))
        TRIM(p.name) AS name,
        public.unaccent_immutable(lower(trim(p.name))) AS p_name_norm,
        public.to_date_safe(p.birthday) AS birthday_date,
        public.to_date_safe(p.deathday) AS deathday_date,
        NULLIF(TRIM(p.place_of_birth), '') AS place_of_birth,
        c.id AS resolved_country_id,
        NULLIF(TRIM(p.titulo_bio), '') AS titulo_bio,
        NULLIF(TRIM(p.biography), '') AS biography,
        NULLIF(TRIM(p.components), '') AS components,
        UPPER(TRIM(p.type)) AS staging_type
    FROM public.people_staging p
    LEFT JOIN public.countries c 
        ON (p.country_id ~ '^[0-9]+$' AND c.id = p.country_id::int)
        OR c.code = UPPER(TRIM(p.country_id)) 
        OR c.name_norm = public.unaccent_immutable(LOWER(TRIM(p.country_id)))
    WHERE p.name IS NOT NULL AND TRIM(p.name) <> ''
    ORDER BY public.unaccent_immutable(lower(trim(p.name))), p.id DESC
)
UPDATE public.people p
SET
    birthday = COALESCE(src.birthday_date, p.birthday),
    deathday = COALESCE(src.deathday_date, p.deathday),
    place_of_birth = COALESCE(src.place_of_birth, p.place_of_birth),
    country_id = COALESCE(src.resolved_country_id, p.country_id),
    titulo_bio = COALESCE(src.titulo_bio, p.titulo_bio),
    biography = COALESCE(src.biography, p.biography),
    components = COALESCE(src.components, p.components),
    vip = CASE 
        WHEN (src.biography IS NOT NULL AND TRIM(src.biography) <> '') 
          OR (p.biography IS NOT NULL AND TRIM(p.biography) <> '') THEN 1 
        ELSE p.vip 
    END,
    type = CASE
        WHEN src.staging_type = 'D' AND p.type = 'A' THEN 'AD'
        WHEN src.staging_type = 'A' AND p.type = 'D' THEN 'DA'
        WHEN src.staging_type IN ('A', 'D', 'AD', 'DA') THEN src.staging_type
        ELSE p.type
    END
FROM dedup_staging src
WHERE p.name_norm = src.p_name_norm;

-- PASO 4: Refresco Concurrente de Vistas Materializadas
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_actor_suggestions;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_director_suggestions;

-- PASO 5: Mantenimiento de Estadísticas del Optimizador
ANALYZE public.people;
ANALYZE public.mv_actor_suggestions;
ANALYZE public.mv_director_suggestions;

COMMIT;

-- PASO 6: Reporte de Auditoría Post-Refresco
SELECT 
    count(*) AS total_personas,
    count(*) FILTER (WHERE vip = 1) AS total_vips,
    count(*) FILTER (WHERE biography IS NOT NULL AND biography <> '') AS con_biografia,
    count(*) FILTER (WHERE birthday IS NOT NULL) AS con_fecha_nacimiento,
    count(*) FILTER (WHERE deathday IS NOT NULL) AS fallecidos,
    count(*) FILTER (WHERE country_id IS NOT NULL) AS con_pais,
    count(*) FILTER (WHERE place_of_birth IS NOT NULL AND place_of_birth <> '') AS con_lugar_nacimiento,
    count(*) FILTER (WHERE components IS NOT NULL AND components <> '') AS con_componentes_colectivo
FROM public.people;
