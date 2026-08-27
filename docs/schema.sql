-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.countries (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  name_norm text DEFAULT unaccent_immutable(lower(name)),
  CONSTRAINT countries_pkey PRIMARY KEY (id)
);

CREATE TABLE public.genres (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  synonyms text[] DEFAULT '{}'::text[],
  name_norm text DEFAULT replace(unaccent_immutable(lower(name)), 'sci-fi'::text, 'scifi'::text),
  CONSTRAINT genres_pkey PRIMARY KEY (id)
);

CREATE TABLE public.directors (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  name_norm text DEFAULT unaccent_immutable(lower(name)),
  profile_path text,
  birthday date,
  deathday date,
  place_of_birth text,
  country_id smallint,
  photo text,
  titulo_bio text,
  biography text,
  components text,
  CONSTRAINT directors_pkey PRIMARY KEY (id),
  CONSTRAINT directors_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id)
);

CREATE TABLE public.movies (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  year smallint,
  year_end text,
  type text,
  fa_rating real,
  fa_votes integer,
  imdb_rating real,
  imdb_votes integer,
  original_title text,
  minutes smallint,
  synopsis text,
  fa_id text,
  imdb_id text,
  image text NOT NULL,
  thumbhash_st text,
  country_id smallint,
  last_synced_at timestamp with time zone,
  episodes smallint,
  wikipedia text,
  genres_list text,
  directors_list text,
  actors_list text,
  relevance smallint,
  selections_list text,
  studios_list text,
  justwatch text,
  title_norm text DEFAULT unaccent_immutable(lower(title)),
  slug text DEFAULT TRIM(BOTH '-'::text FROM regexp_replace(((lower(unaccent_immutable(title)) || '-'::text) || COALESCE((year)::text, ''::text)), '[^a-z0-9]+'::text, '-'::text, 'g'::text)),
  genres_tsv tsvector DEFAULT to_tsvector('spanish'::regconfig, replace(unaccent_immutable(lower(genres_list)), 'sci-fi'::text, 'scifi'::text)),
  directors_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, unaccent_immutable(directors_list)),
  actors_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, unaccent_immutable(actors_list)),
  selections_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, unaccent_immutable(selections_list)),
  studios_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, unaccent_immutable(studios_list)),
  avg_rating real DEFAULT 
CASE
    WHEN ((fa_rating IS NOT NULL) AND (fa_rating > (0)::double precision) AND ((imdb_rating IS NOT NULL) AND (imdb_rating > (0)::double precision))) THEN (((fa_rating + (0.5)::double precision) + (imdb_rating - (0.3)::double precision)) / (2.0)::double precision)
    ELSE NULL::double precision
END,
  CONSTRAINT movies_pkey PRIMARY KEY (id),
  CONSTRAINT movies_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id)
);

CREATE TABLE public.movie_genres (
  movie_id integer NOT NULL,
  genre_id smallint NOT NULL,
  CONSTRAINT movie_genres_pkey PRIMARY KEY (movie_id, genre_id),
  CONSTRAINT movie_genres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.genres(id),
  CONSTRAINT movie_genres_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id)
);

CREATE TABLE public.movie_directors (
  movie_id integer NOT NULL,
  director_id integer NOT NULL,
  ordinality smallint,
  CONSTRAINT movie_directors_pkey PRIMARY KEY (movie_id, director_id),
  CONSTRAINT movie_directors_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.directors(id),
  CONSTRAINT movie_directors_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id)
);

CREATE TABLE public.movies_staging (
  title text,
  year text,
  year_end text,
  type text,
  fa_rating text,
  fa_votes text,
  imdb_rating text,
  imdb_votes text,
  original_title text,
  country text,
  minutes text,
  directors text,
  actors text,
  genre text,
  synopsis text,
  fa_id text,
  imdb_id text,
  image text NOT NULL,
  collection text,
  episodes text,
  wikipedia text,
  relevance text,
  studio text,
  justwatch text,
  show text,
  CONSTRAINT movies_staging_pkey PRIMARY KEY (image)
);

CREATE TABLE public.actors (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  name_norm text DEFAULT unaccent_immutable(lower(name)),
  profile_path text,
  birthday date,
  deathday date,
  place_of_birth text,
  country_id smallint,
  photo text,
  titulo_bio text,
  biography text,
  CONSTRAINT actors_pkey PRIMARY KEY (id),
  CONSTRAINT actors_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id)
);

CREATE TABLE public.movie_actors (
  movie_id integer NOT NULL,
  actor_id integer NOT NULL,
  ordinality smallint,
  CONSTRAINT movie_actors_pkey PRIMARY KEY (movie_id, actor_id),
  CONSTRAINT movie_actors_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.actors(id),
  CONSTRAINT movie_actors_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id)
);

CREATE TABLE public.selections (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  letter text UNIQUE,
  thumbhash_st text,
  thumbhash text,
  CONSTRAINT selections_pkey PRIMARY KEY (id)
);

CREATE TABLE public.movie_selections (
  movie_id integer NOT NULL,
  selection_id smallint NOT NULL,
  CONSTRAINT movie_selections_pkey PRIMARY KEY (movie_id, selection_id),
  CONSTRAINT movie_selections_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE,
  CONSTRAINT movie_selections_selection_id_fkey FOREIGN KEY (selection_id) REFERENCES public.selections(id) ON DELETE CASCADE
);

CREATE TABLE public.user_movie_entries (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  movie_id integer NOT NULL,
  on_watchlist boolean NOT NULL DEFAULT false,
  rating smallint CHECK (rating >= 1 AND rating <= 10),
  watchlist_position integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_movie_entries_pkey PRIMARY KEY (id),
  CONSTRAINT user_movie_entries_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE,
  CONSTRAINT user_movie_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_movie_entry_unique UNIQUE (user_id, movie_id),
  CONSTRAINT check_user_entry_has_action CHECK (rating IS NOT NULL OR on_watchlist = true),
  CONSTRAINT check_user_entry_exclusive CHECK (NOT (rating IS NOT NULL AND on_watchlist = true))
);

CREATE TABLE public.studios (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  letter text UNIQUE,
  thumbhash_st text,
  thumbhash text,
  CONSTRAINT studios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.movie_studios (
  movie_id integer NOT NULL,
  studio_id smallint NOT NULL,
  CONSTRAINT movie_studios_pkey PRIMARY KEY (movie_id, studio_id),
  CONSTRAINT movie_studios_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE,
  CONSTRAINT movie_studios_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE
);

CREATE TABLE public.people_staging (
  id text NOT NULL,
  name text NOT NULL,
  name_norm text,
  type text,
  profile_path text,
  photo text,
  birthday text,
  deathday text,
  place_of_birth text,
  country_id text,
  titulo_bio text,
  biography text,
  components text
);

CREATE INDEX IF NOT EXISTS idx_actors_country_id ON public.actors(country_id);
CREATE INDEX IF NOT EXISTS idx_directors_country_id ON public.directors(country_id);