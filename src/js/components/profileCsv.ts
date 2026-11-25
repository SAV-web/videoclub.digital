import { getSupabase } from "../supabaseClient.js";
import { setUserMovieData } from "../state.js";
import { getAllUserMovieData } from "../state.js";
import { showToast } from "../ui.js";
import { getCachedMoviesByIds, saveLocalEntriesBatch } from "../localStore.js";
import { scheduleSync } from "../syncManager.js";
import { calculateUserStars } from "../../shared/formatters.js";
import { UserMovieEntry } from "../types.js";

/**
 * Exporta toda la colección personal del usuario a un archivo CSV estándar RFC 4180,
 * enriquecido con metadatos desde Supabase (y caché local IndexedDB en modo offline)
 * y codificación UTF-8 con BOM para compatibilidad total con Excel/Numbers/Sheets.
 */
export async function exportUserDataCsv(): Promise<void> {
  const allEntries: Record<string, UserMovieEntry> = getAllUserMovieData();
  const validEntries = Object.entries(allEntries).filter(
    ([_, item]) => item && (item.rating !== null || item.onWatchlist || Boolean(item.note && item.note.trim().length > 0))
  );

  if (validEntries.length === 0) {
    showToast("No tienes ninguna obra en tu colección para exportar.", "info");
    return;
  }

  const exportCsvBtn = typeof document !== "undefined"
    ? (document.getElementById("profile-export-csv-btn") as HTMLButtonElement | null)
    : null;
  if (exportCsvBtn) {
    exportCsvBtn.disabled = true;
    exportCsvBtn.textContent = "Exportando...";
  }

  try {
    const movieIds = validEntries.map(([id]) => Number(id)).filter(id => !isNaN(id));

    const movieMetaMap = new Map<number, {
      title: string;
      original_title: string | null;
      year: number | null;
      type: string | null;
      directors: string | null;
      genres: string | null;
    }>();

    try {
      const supabase = await getSupabase();
      const CHUNK_SIZE = 500;
      for (let i = 0; i < movieIds.length; i += CHUNK_SIZE) {
        const chunk = movieIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from("movies")
          .select("id, title, original_title, year, type, directors_list, genres_list")
          .in("id", chunk);

        if (!error && data) {
          const rows = data as unknown as Array<{
            id: number;
            title?: string | null;
            original_title?: string | null;
            year?: number | null;
            type?: string | null;
            directors_list?: string | null;
            genres_list?: string | null;
          }>;
          for (const m of rows) {
            movieMetaMap.set(m.id, {
              title: m.title || "",
              original_title: m.original_title || null,
              year: m.year ?? null,
              type: m.type && String(m.type).toLowerCase().startsWith("s") ? "Serie" : "Película",
              directors: m.directors_list || "",
              genres: m.genres_list || ""
            });
          }
        }
      }
    } catch {
      // Si la red falla o estamos offline, continuamos con los datos locales disponibles
    }

    // Fallback offline: enriquecer películas restantes desde la caché IndexedDB (cached_movies)
    const missingIds = movieIds.filter(id => !movieMetaMap.has(id));
    if (missingIds.length > 0) {
      try {
        const localCached = await getCachedMoviesByIds(missingIds);
        for (const [id, m] of localCached.entries()) {
          const rawDirectors = "directors_list" in m && typeof m.directors_list === "string"
            ? m.directors_list
            : (Array.isArray(m.directors) ? m.directors.join(", ") : "");
          const rawGenres = "genres_list" in m && typeof m.genres_list === "string"
            ? m.genres_list
            : (Array.isArray(m.genres) ? m.genres.join(", ") : "");

          movieMetaMap.set(id, {
            title: m.title || "",
            original_title: m.original_title || null,
            year: m.year ?? null,
            type: m.type && String(m.type).toLowerCase().startsWith("s") ? "Serie" : "Película",
            directors: rawDirectors,
            genres: rawGenres
          });
        }
      } catch {
        // Fallback silencioso si IndexedDB no está disponible en el entorno
      }
    }

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes(";")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      "ID",
      "Título",
      "Título Original",
      "Año",
      "Tipo",
      "Dirección",
      "Géneros",
      "Mis Estrellas (0-3)",
      "En Pendientes",
      "Nota Privada"
    ];

    const rows = validEntries.map(([idStr, entry]) => {
      const id = Number(idStr);
      const meta = movieMetaMap.get(id);
      const userStars = typeof entry.rating === "number" ? calculateUserStars(entry.rating) : "";
      const inWatchlist = entry.onWatchlist ? "Sí" : "No";

      return [
        escapeCsv(id),
        escapeCsv(meta?.title || ""),
        escapeCsv(meta?.original_title || ""),
        escapeCsv(meta?.year ?? ""),
        escapeCsv(meta?.type || ""),
        escapeCsv(meta?.directors || ""),
        escapeCsv(meta?.genres || ""),
        escapeCsv(userStars),
        escapeCsv(inWatchlist),
        escapeCsv(entry.note || "")
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `videoclub-coleccion-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Colección exportada con éxito en formato CSV.", "success");
  } finally {
    if (exportCsvBtn) {
      exportCsvBtn.disabled = false;
      exportCsvBtn.textContent = "Exportar colección";
    }
  }
}

/**
 * Parsea un contenido CSV plano en una matriz de celdas string[][],
 * soportando comillas escapadas (""), comas o puntos y coma, saltos CRLF/LF y BOM UTF-8.
 */
export function parseCsvRows(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;
  const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || "";
  const delimiter = (!firstLine.includes(",") && firstLine.includes(";")) ? ";" : ",";

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleanText[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (cleanText[i + 1] === "\n") i++;
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
      } else {
        currentCell += char;
      }
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }
  return rows;
}

/**
 * Importa una colección de usuario desde un archivo CSV nativo de videoclub.digital.
 * Valida la estructura, realiza inserción atómica en IndexedDB en lote,
 * actualiza el estado reactivo en memoria y programa la sincronización en segundo plano con Supabase.
 */
export async function importUserDataCsv(
  file: File,
  options: { onImported?: () => void } = {}
): Promise<void> {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv") && !file.type.includes("text")) {
    showToast("El archivo seleccionado debe ser un documento en formato CSV (.csv).", "info");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast("El archivo supera el tamaño máximo permitido de 10 MB.", "info");
    return;
  }

  const importCsvBtn = typeof document !== "undefined"
    ? (document.getElementById("profile-import-csv-btn") as HTMLButtonElement | null)
    : null;
  const csvFileInput = typeof document !== "undefined"
    ? (document.getElementById("profile-csv-input") as HTMLInputElement | null)
    : null;

  if (importCsvBtn) {
    importCsvBtn.disabled = true;
    importCsvBtn.textContent = "Importando...";
  }

  try {
    const text = await file.text();
    const rows = parseCsvRows(text);

    if (rows.length < 2) {
      showToast("El archivo CSV no contiene registros suficientes para importar.", "info");
      return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const idIdx = headers.findIndex(h => h === "id" || h === "movie_id" || h === "id película" || h === "id pelicula");

    if (idIdx === -1) {
      showToast("El archivo CSV no contiene la columna 'ID' obligatoria de videoclub.", "info");
      return;
    }

    const noteIdx = headers.findIndex(h =>
      h.includes("privada") || h.includes("personal") ||
      h.includes("coment") || h.includes("comment") ||
      h.includes("crítica") || h.includes("critica") ||
      h.includes("reseña") || h.includes("resena") ||
      h.includes("review") || h.includes("opinion") || h.includes("opinión") ||
      h === "nota" || h === "notas" || h === "note" || h === "notes"
    );

    const ratingIdx = headers.findIndex((h, idx) =>
      idx !== noteIdx && (
        h.includes("estrella") || h.includes("star") ||
        h.includes("valoraci") || h.includes("rating") ||
        h.includes("calificaci") || h.includes("puntuaci") ||
        h.includes("score") || (h.includes("nota") && !h.includes("privada") && !h.includes("personal") && idx !== noteIdx)
      )
    );

    const watchlistIdx = headers.findIndex((h, idx) =>
      idx !== noteIdx && idx !== ratingIdx && (h.includes("pendiente") || h.includes("watchlist"))
    );

    const hasRatingCol = ratingIdx !== -1;
    const hasWatchlistCol = watchlistIdx !== -1;
    const hasNoteCol = noteIdx !== -1;

    const isStarsColumn = hasRatingCol && (headers[ratingIdx].includes("estrella") || headers[ratingIdx].includes("star"));
    const validEntries: Array<{ movieId: number; rating?: number | null; onWatchlist?: boolean; note?: string | null }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawId = row[idIdx];
      if (!rawId) continue;

      const movieId = Number(rawId);
      if (!Number.isInteger(movieId) || movieId <= 0) continue;

      let rating: number | null | undefined = undefined;
      if (hasRatingCol && row[ratingIdx] !== undefined && row[ratingIdx].trim() !== "") {
        const valStr = row[ratingIdx].trim().toLowerCase();
        if (isStarsColumn) {
          if (valStr === "0" || valStr.includes("suspenso")) {
            rating = 2;
          } else if (valStr === "1" || valStr.startsWith("1")) {
            rating = 5;
          } else if (valStr === "2" || valStr.startsWith("2")) {
            rating = 7;
          } else if (valStr === "3" || valStr.startsWith("3")) {
            rating = 9;
          }
        } else {
          const rawRating = Number(valStr);
          if (Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 10) {
            rating = rawRating;
          }
        }
      }

      let onWatchlist: boolean | undefined = undefined;
      if (hasWatchlistCol && row[watchlistIdx] !== undefined && row[watchlistIdx].trim() !== "") {
        const rawW = row[watchlistIdx].trim().toLowerCase();
        if (rawW === "sí" || rawW === "si" || rawW === "true" || rawW === "1" || rawW === "yes") {
          onWatchlist = true;
        } else if (rawW === "no" || rawW === "false" || rawW === "0") {
          onWatchlist = false;
        }
      }

      let note: string | null | undefined = undefined;
      if (hasNoteCol && row[noteIdx] !== undefined && row[noteIdx].trim() !== "") {
        const rawNote = row[noteIdx].trim().slice(0, 280);
        if (rawNote.length > 0) {
          note = rawNote;
        }
      }

      if (rating === undefined && onWatchlist === undefined && note === undefined) continue;

      validEntries.push({
        movieId,
        ...(rating !== undefined ? { rating } : {}),
        ...(onWatchlist !== undefined ? { onWatchlist } : {}),
        ...(note !== undefined ? { note } : {})
      });
    }

    if (validEntries.length === 0) {
      showToast("No se encontraron registros válidos de calificación, pendientes o notas para importar.", "info");
      return;
    }

    const { importedCount, mergedMap } = await saveLocalEntriesBatch(validEntries);
    setUserMovieData(mergedMap);
    scheduleSync(0);
    options.onImported?.();

    showToast(`Se han importado ${importedCount.toLocaleString("es-ES")} obras a tu colección con éxito.`, "success");
  } catch (err) {
    if (import.meta.env.DEV) console.error("Error al importar colección CSV:", err);
    showToast("Se produjo un error al procesar el archivo CSV.", "error");
  } finally {
    if (importCsvBtn) {
      importCsvBtn.disabled = false;
      importCsvBtn.textContent = "Importar colección";
    }
    if (csvFileInput) {
      csvFileInput.value = "";
    }
  }
}
