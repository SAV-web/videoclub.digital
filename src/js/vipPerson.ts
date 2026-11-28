import { LRUCache } from "lru-cache";
import { toSlug } from "../shared/slugs.js";
import { CONFIG, IGNORED_ACTORS_SET } from "./constants.js";
import { canCombinePersonFilter, getOrderedActivePeople } from "./contracts.js";
import { appEvents } from "./state.js";
import type { ActiveFilters, MappedMovie, PersonDetails } from "./types.js";

let vipSlugsCache: Set<string> | null = null;
let vipSlugsPromise: Promise<Set<string>> | null = null;
let liveSyncStarted = false;

interface CollaboratorEntry {
  directorSlugs: Set<string>;
  actorSlugs: Set<string>;
  complete: boolean;
  fetching: Promise<void> | null;
}

const collaboratorsCache = new LRUCache<string, CollaboratorEntry>({
  max: 30,
  ttl: 1000 * 60 * 30,
});

function getActivePersonKey(role: "director" | "actor", personName: string): string | null {
  const slug = toSlug(personName);
  return slug ? `${role}:${slug}` : null;
}

function addMovieCollaborators(entry: CollaboratorEntry, movies: MappedMovie[]): boolean {
  let changed = false;

  for (const movie of movies) {
    if (Array.isArray(movie.parsedDirectors)) {
      for (const dirName of movie.parsedDirectors) {
        const slug = toSlug(dirName);
        if (slug && !entry.directorSlugs.has(slug)) {
          entry.directorSlugs.add(slug);
          changed = true;
        }
      }
    }

    if (Array.isArray(movie.parsedActors)) {
      for (const actorName of movie.parsedActors) {
        if (IGNORED_ACTORS_SET.has(actorName.toLowerCase())) continue;
        const slug = toSlug(actorName);
        if (slug && !entry.actorSlugs.has(slug)) {
          entry.actorSlugs.add(slug);
          changed = true;
        }
      }
    }
  }

  return changed;
}

/**
 * Registra en caché los directores y actores que comparten película con el VIP activo
 * a partir de las películas ya cargadas en la página actual.
 */
export function seedPersonCollaborators(
  role: "director" | "actor",
  personName: string,
  movies: MappedMovie[],
  totalMovies: number,
  page = 1,
  allowComplete = true
): void {
  const key = getActivePersonKey(role, personName);
  if (!key) return;

  let entry = collaboratorsCache.get(key);
  if (!entry) {
    entry = {
      directorSlugs: new Set<string>(),
      actorSlugs: new Set<string>(),
      complete: false,
      fetching: null,
    };
    collaboratorsCache.set(key, entry);
  }

  const changed = addMovieCollaborators(entry, movies);
  const becameComplete = allowComplete && !entry.complete && page === 1 && totalMovies >= 0 && movies.length >= totalMovies;
  if (becameComplete) {
    entry.complete = true;
  }

  if (changed || becameComplete) {
    appEvents.emit("collaborators:loaded");
  }
}

/**
 * Completa en segundo plano el mapa de colaboradores cuando la filmografía de un VIP
 * supera el tamaño de la primera página (p. ej. > 43 títulos).
 */
export function ensureFullCollaborators(
  role: "director" | "actor",
  personName: string,
  totalMovies: number,
  fetchOffsetRange: (offset: number, limit: number) => Promise<{ items: MappedMovie[]; total: number }>,
  startOffset = 0
): Promise<void> {
  const key = getActivePersonKey(role, personName);
  if (!key) return Promise.resolve();

  const globalRec = globalThis as unknown as Record<string, unknown>;
  if (globalRec?._isTestEnv) return Promise.resolve();

  let entry = collaboratorsCache.get(key);
  if (!entry) {
    entry = {
      directorSlugs: new Set<string>(),
      actorSlugs: new Set<string>(),
      complete: false,
      fetching: null,
    };
    collaboratorsCache.set(key, entry);
  }

  if (entry.complete) return Promise.resolve();
  if (entry.fetching) return entry.fetching;

  entry.fetching = (async () => {
    const PAGE_LIMIT = 100;
    const MAX_FETCH_OFFSET = 500;
    let offset = Math.max(0, startOffset);
    let knownTotal = totalMovies;
    let changed = false;

    try {
      while (offset < MAX_FETCH_OFFSET) {
        const res = await fetchOffsetRange(offset, PAGE_LIMIT);
        if (!res || res.total < -1 || !Array.isArray(res.items)) break;
        if (res.total >= 0) knownTotal = res.total;

        if (addMovieCollaborators(entry, res.items)) {
          changed = true;
        }

        offset += res.items.length;
        if (res.items.length < PAGE_LIMIT || (knownTotal >= 0 && offset >= knownTotal)) {
          break;
        }
      }

      entry.complete = true;
      if (changed) {
        appEvents.emit("collaborators:loaded");
      }
    } catch {
      // Preserva los colaboradores ya conocidos de la página 1 si falla la red
    } finally {
      entry.fetching = null;
    }
  })();

  return entry.fetching;
}

function getPrimaryCombinePerson(
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2" | "primaryPersonRole">
): { role: "director" | "actor"; name: string } | null {
  const first = getOrderedActivePeople(filters)[0];
  return first ? { role: first.role, name: first.name } : null;
}

/**
 * Comprueba si un director o actor objetivo comparte al menos una película con
 * el primer VIP activo (ancla del cruce en curso).
 */
export function hasCollaboratorWithActivePerson(
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2">,
  targetType: "director" | "actor",
  targetName: string | null | undefined
): boolean {
  if (!targetName) return false;
  const primary = getPrimaryCombinePerson(filters);
  if (!primary) return false;

  const key = getActivePersonKey(primary.role, primary.name);
  if (!key) return false;

  const entry = collaboratorsCache.get(key);
  if (!entry) return false;

  const targetSlug = toSlug(targetName);
  if (!targetSlug) return false;
  return targetType === "director"
    ? entry.directorSlugs.has(targetSlug)
    : entry.actorSlugs.has(targetSlug);
}

async function syncLiveVipSlugsInBackground(): Promise<void> {
  if (liveSyncStarted) return;
  const globalRec = globalThis as unknown as Record<string, unknown>;
  const isTestEnv = Boolean(globalRec?._isTestEnv);
  if (
    isTestEnv ||
    typeof window === "undefined" ||
    typeof window.fetch !== "function" ||
    !CONFIG.SUPABASE_URL ||
    !CONFIG.SUPABASE_ANON_KEY ||
    CONFIG.SUPABASE_URL.includes("placeholder")
  ) {
    return;
  }

  liveSyncStarted = true;
  const PAGE_SIZE = 1000;
  let from = 0;
  let addedAny = false;

  try {
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const res = await window.fetch(
        `${CONFIG.SUPABASE_URL}/rest/v1/people?select=slug&vip=neq.0&slug=not.is.null`,
        {
          headers: {
            apikey: CONFIG.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
            Accept: "application/json",
            Range: `${from}-${to}`,
            "Range-Unit": "items"
          }
        }
      );
      if (!res.ok) break;
      const rows = (await res.json()) as Array<{ slug?: string | null }>;
      if (!Array.isArray(rows) || rows.length === 0) break;

      if (!vipSlugsCache) vipSlugsCache = new Set<string>();
      for (const row of rows) {
        const cleanSlug = typeof row.slug === "string" ? row.slug.trim().toLowerCase() : "";
        if (cleanSlug && !vipSlugsCache.has(cleanSlug)) {
          vipSlugsCache.add(cleanSlug);
          addedAny = true;
        }
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (addedAny) {
      appEvents.emit("vipManifest:loaded");
    }
  } catch {
    // Mantiene el manifiesto estático ya cargado si falla la red
  }
}

/**
 * Carga diferida del manifiesto de personas VIP (`VIP_SLUGS`) bajo demanda
 * para mantener 0 bytes de sobrecarga en el bundle crítico inicial y sincroniza
 * en segundo plano posibles VIPs nuevos desde Supabase 1 vez por sesión.
 */
export function loadVipSlugs(): Promise<Set<string>> {
  if (vipSlugsCache) {
    void syncLiveVipSlugsInBackground();
    return Promise.resolve(vipSlugsCache);
  }
  if (!vipSlugsPromise) {
    vipSlugsPromise = import("../shared/vip-manifest.js")
      .then((mod) => {
        vipSlugsCache = new Set(mod.VIP_SLUGS);
        appEvents.emit("vipManifest:loaded");
        void syncLiveVipSlugsInBackground();
        return vipSlugsCache;
      })
      .catch(() => new Set<string>());
  }
  return vipSlugsPromise;
}

export function getLoadedVipSlugs(): Set<string> | null {
  return vipSlugsCache;
}

/**
 * Comprueba si un nombre o slug corresponde a una persona VIP registrada en el manifiesto.
 */
export function isVipPersonInManifest(nameOrSlug: string | null | undefined): boolean {
  if (!nameOrSlug || !vipSlugsCache) return false;
  const slug = toSlug(nameOrSlug);
  return slug ? vipSlugsCache.has(slug) : false;
}

/**
 * Determina si una persona concreta es VIP usando su caché en vivo de Supabase
 * (si ya se cargó) o, en su defecto, el manifiesto compartido `VIP_SLUGS`.
 */
export function isPersonVip(
  type: "director" | "actor",
  name: string | null | undefined,
  getCachedDetails?: (role: "director" | "actor", personName: string) => PersonDetails | null
): boolean {
  if (!name) return false;
  const cached = getCachedDetails?.(type, name);
  if (cached && cached.vip !== undefined && cached.vip !== null) {
    return cached.vip !== 0;
  }
  return isVipPersonInManifest(name);
}

/**
 * Comprueba si existe 1 o 2 personas activas y la persona ancla (primer VIP) es VIP,
 * habilitando tanto añadir el segundo VIP como sustituirlo cuando ya hay dos.
 */
export function isPrimaryActivePersonVip(
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2" | "primaryPersonRole">,
  getCachedDetails?: (role: "director" | "actor", personName: string) => PersonDetails | null
): boolean {
  const primary = getPrimaryCombinePerson(filters);
  return primary ? isPersonVip(primary.role, primary.name, getCachedDetails) : false;
}

type CachedPersonLookup = (role: "director" | "actor", personName: string) => PersonDetails | null;
type RemotePersonLookup = (role: "director" | "actor", personName: string) => Promise<PersonDetails | null>;

/**
 * Evalúa si un candidato del menú lateral o autocompletado puede mostrar '+'
 * combinando estado VIP, reglas de cruce y coincidencia real en filmografía.
 */
export function canOfferCollaboratorCombine(
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2">,
  targetType: "director" | "actor",
  targetName: string | null | undefined,
  isCurrentVip: boolean,
  getCachedDetails?: CachedPersonLookup
): boolean {
  if (!isCurrentVip || !targetName) return false;
  return (
    hasCollaboratorWithActivePerson(filters, targetType, targetName) &&
    canCombinePersonFilter(
      filters,
      targetType,
      targetName,
      isPersonVip(targetType, targetName, getCachedDetails),
      isCurrentVip
    )
  );
}

/**
 * Resuelve el nombre canónico de una persona usando caché o consulta remota
 * puntual, conservando el valor recortado si la petición falla.
 */
export async function resolvePersonDisplayName(
  type: "director" | "actor",
  rawName: string,
  getCachedDetails: CachedPersonLookup,
  fetchDetails: RemotePersonLookup
): Promise<string> {
  const trimmed = rawName.trim();
  if (!trimmed) return "";
  const cached = getCachedDetails(type, trimmed);
  if (cached?.name) return cached.name;

  try {
    const details = await fetchDetails(type, trimmed);
    if (details?.name) return details.name;
  } catch {
    // Fallback resiliente al nombre original si falla la red
  }
  return trimmed;
}

/**
 * Valida los requisitos VIP y resuelve el nombre canónico antes de aplicar
 * una combinación '+' sobre el primer VIP activo.
 */
export async function prepareVipPersonCombine(
  filters: Pick<ActiveFilters, "director" | "actor" | "actor2">,
  targetType: "director" | "actor",
  rawName: string,
  getCachedDetails: CachedPersonLookup,
  fetchDetails: RemotePersonLookup
): Promise<string | null> {
  await loadVipSlugs();
  if (!isPrimaryActivePersonVip(filters, getCachedDetails)) return null;

  const resolvedName = await resolvePersonDisplayName(targetType, rawName, getCachedDetails, fetchDetails);
  if (!resolvedName || !isPersonVip(targetType, resolvedName, getCachedDetails)) return null;
  return resolvedName;
}
