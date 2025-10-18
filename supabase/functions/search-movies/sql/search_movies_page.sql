CREATE OR REPLACE FUNCTION public.search_movies_page(
    search_term text, 
    p_genre_name text, 
    p_year text, 
    p_country_name text, 
    p_director_name text, 
    p_actor_name text, 
    p_media_type text, 
    p_selection text, 
    p_sort text,
    p_excluded_genres text[],
    p_excluded_countries text[],
    p_limit integer,
    p_page integer
)
RETURNS TABLE(
    id bigint, title text, year integer, year_end text, type text, genres text, 
    directors text, actors text, country text, country_code text, minutes integer, 
    image text, fa_id text, fa_rating real, fa_votes integer, imdb_id text, 
    imdb_rating real, imdb_votes integer, synopsis text, thumbhash_st text, 
    critic text, last_synced_at timestamptz, episodes integer, wikipedia text, total_count bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $function$
WITH filtered_movies AS (
    SELECT 
        m.id, m.title, m.year, m.fa_rating, m.imdb_rating, m.fa_votes, m.imdb_votes,
        COUNT(*) OVER() AS total_count_unpaginated
    FROM public.movies m
    WHERE
        (search_term IS NULL OR search_term = '' OR m.title_norm ILIKE '%' || public.unaccent_immutable(lower(search_term)) || '%')
        AND (p_year IS NULL OR (p_year LIKE '%-%' AND (m.year <= (split_part(p_year, '-', 2)::int) AND ((split_part(p_year, '-', 1)::int) = 1926 OR m.year >= (split_part(p_year, '-', 1)::int))) OR (p_year NOT LIKE '%-%' AND m.year = p_year::int)))
        AND (p_media_type IS NULL OR p_media_type = 'all' OR (p_media_type = 'movies' AND (m.type IS NULL OR m.type IN ('D', 'A'))) OR (p_media_type = 'series' AND m.type ILIKE 'S%'))
        AND (p_country_name IS NULL OR m.country_id = (SELECT c.id FROM public.countries c WHERE c.name = p_country_name))
        AND (p_genre_name IS NULL OR m.genres_list ILIKE '%' || p_genre_name || '%')
        AND (p_director_name IS NULL OR m.directors_list ILIKE '%' || p_director_name || '%')
        AND (p_actor_name IS NULL OR m.actors_list ILIKE '%' || p_actor_name || '%')
        AND (p_selection IS NULL OR EXISTS (SELECT 1 FROM public.movie_collections mc JOIN public.collections coll ON mc.collection_id = coll.id WHERE mc.movie_id = m.id AND coll.code = p_selection))
        AND (p_excluded_genres IS NULL OR NOT m.genres_list ILIKE ANY (SELECT '%' || g || '%' FROM unnest(p_excluded_genres) as g))
        AND (p_excluded_countries IS NULL OR array_length(p_excluded_countries, 1) IS NULL OR m.country_id NOT IN (SELECT c.id FROM public.countries c WHERE c.name = ANY(p_excluded_countries)))
)
SELECT
    fm.id, m.title, m.year, m.year_end, m.type, m.genres_list AS genres, 
    m.directors_list AS directors, m.actors_list AS actors, c.name AS country, 
    c.code AS country_code, m.minutes, m.image, m.fa_id, m.fa_rating, m.fa_votes, 
    m.imdb_id, m.imdb_rating, m.imdb_votes, m.synopsis, m.thumbhash_st, m.critic, 
    m.last_synced_at, m.episodes, m.wikipedia, fm.total_count_unpaginated as total_count
FROM filtered_movies fm
JOIN public.movies m ON fm.id = m.id
LEFT JOIN public.countries c ON m.country_id = c.id
ORDER BY
    CASE WHEN split_part(p_sort, ',', 1) = 'relevance' AND search_term IS NOT NULL AND search_term <> '' 
        THEN public.similarity(fm.title, search_term) END DESC NULLS LAST,
    CASE WHEN split_part(p_sort, ',', 1) = 'year' AND split_part(p_sort, ',', 2) = 'desc' THEN fm.year END DESC,
    CASE WHEN split_part(p_sort, ',', 1) = 'year' AND split_part(p_sort, ',', 2) = 'asc' THEN fm.year END ASC,
    CASE WHEN split_part(p_sort, ',', 1) = 'fa_rating' AND split_part(p_sort, ',', 2) = 'desc' THEN fm.fa_rating END DESC NULLS LAST,
    CASE WHEN split_part(p_sort, ',', 1) = 'imdb_rating' AND split_part(p_sort, ',', 2) = 'desc' THEN fm.imdb_rating END DESC NULLS LAST,
    CASE WHEN split_part(p_sort, ',', 1) = 'fa_votes' AND split_part(p_sort, ',', 2) = 'desc' THEN fm.fa_votes END DESC NULLS LAST,
    CASE WHEN split_part(p_sort, ',', 1) = 'imdb_votes' AND split_part(p_sort, ',', 2) = 'desc' THEN fm.imdb_votes END DESC NULLS LAST,
    fm.id ASC
LIMIT p_limit
OFFSET p_page * p_limit;
$function$;