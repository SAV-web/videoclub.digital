-- =================================================================
-- PROTOCOLO DE INGESTA Y MANTENIMIENTO POST-CSV (docs/ingest.sql)
-- =================================================================
-- Ejecuta este script completo en el SQL Editor de Supabase justo
-- después de importar los archivos CSV en 'movies_staging' y 'people_staging'.
-- =================================================================

-- 1. Ingesta Transaccional Diferencial (ETL)
-- Procesa atómicamente el catálogo y actualiza personas VIPs
SELECT public.process_staging_data();

-- 2. Refresco Concurrente de Vistas Materializadas
-- Actualiza los índices de autocompletado en milisegundos sin bloquear consultas de usuarios
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_actor_suggestions;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_director_suggestions;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_title_suggestions;

-- 3. Mantenimiento de Estadísticas del Optimizador (Query Planner)
-- Garantiza que PostgreSQL escoja los índices GIN/B-Tree más eficientes
ANALYZE public.movies;
ANALYZE public.actors;
ANALYZE public.directors;
ANALYZE public.movie_genres;
ANALYZE public.movie_directors;
ANALYZE public.movie_actors;
ANALYZE public.movie_selections;
ANALYZE public.movie_studios;
ANALYZE public.mv_actor_suggestions;
ANALYZE public.mv_director_suggestions;
ANALYZE public.mv_title_suggestions;

-- 4. Certificación Declarativa de Calidad de Datos (DataOps Tests)
-- Ejecuta la suite de aserciones dbt-style y devuelve el reporte PASS/FAIL del catálogo
SELECT * FROM public.run_data_tests();
