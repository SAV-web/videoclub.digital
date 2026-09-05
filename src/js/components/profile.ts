// =================================================================
//      PANEL DE PERFIL DE USUARIO (src/js/components/profile.ts)
// =================================================================
// Gestiona la ficha de usuario autenticado: estadísticas de videoteca,
// distribución de calificaciones, cambio de contraseña (NIST),
// exportación de datos y sincronización Local-First.
// =================================================================

import { getSupabase } from "../api.js";
import { getAllUserMovieData, clearUserMovieData, appEvents } from "../state.js";
import { openAccessibleModal, closeAccessibleModal, showToast } from "../ui.js";
import { UserMovieEntry } from "../types.js";
import { getPendingSyncEntries, clearLocalStore } from "../localStore.js";
import { syncWithServer, mergeOnLogin } from "../syncManager.js";
import { calculateUserStars } from "../../shared/formatters.js";

export interface UserMovieStats {
  watchlistCount: number;
  ratedCount: number;
  averageRating: number | null;
  averageStars: number | null;
  formattedStars: string;
  breakdown: {
    level3: { label: string; count: number; percentage: number }; // 3 estrellas
    level2: { label: string; count: number; percentage: number }; // 2 estrellas
    level1: { label: string; count: number; percentage: number }; // 1 estrella
    level0: { label: string; count: number; percentage: number }; // 0 estrellas
  };
}

/**
 * Formatea un promedio de estrellas continuo en estrellas y fracción de estrella (ej: 2 ½ estrellas).
 */
export function formatStarFraction(stars: number | null | undefined): string {
  if (stars === null || stars === undefined || stars <= 0) return "Sin valoraciones";
  if (stars >= 3) return "3 estrellas";

  const integerPart = Math.floor(stars);
  const fraction = Math.round((stars - integerPart) * 100) / 100;

  let vulgarFraction = "";
  if (fraction >= 0.85) {
    const roundedInt = integerPart + 1;
    return roundedInt === 1 ? "1 estrella" : `${roundedInt} estrellas`;
  } else if (fraction >= 0.7) {
    vulgarFraction = "¾";
  } else if (fraction >= 0.6) {
    vulgarFraction = "⅔";
  } else if (fraction >= 0.38) {
    vulgarFraction = "½";
  } else if (fraction >= 0.28) {
    vulgarFraction = "⅓";
  } else if (fraction >= 0.12) {
    vulgarFraction = "¼";
  }

  if (vulgarFraction) {
    return integerPart > 0 
      ? `${integerPart} ${vulgarFraction} estrellas` 
      : `${vulgarFraction} estrella`;
  }

  return integerPart === 1 ? "1 estrella" : `${integerPart} estrellas`;
}

/**
 * Renderiza el llenado visual continuo/fraccionario de las 3 estrellas en el contenedor.
 */
export function renderFractionalStars(container: HTMLElement, filledAmount: number): void {
  const stars = container.children;
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i] as HTMLElement;
    const fillValue = Math.max(0, Math.min(1, filledAmount - i));
    const filledPath = star.lastElementChild as HTMLElement | null;
    if (filledPath) {
      if (star.style.opacity !== "1") star.style.opacity = "1";
      const clipPercentage = (1 - fillValue) * 100;
      filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
    }
  }
}

/**
 * Calcula de forma pura y determinista las estadísticas cinematográficas del usuario.
 */
export function computeUserMovieStats(userMovieData: Record<string, UserMovieEntry> = {}): UserMovieStats {
  const entries = Object.values(userMovieData || {});

  let watchlistCount = 0;
  let ratedCount = 0;
  let totalRatingSum = 0;
  let totalStarsSum = 0;

  let countLevel3 = 0;
  let countLevel2 = 0;
  let countLevel1 = 0;
  let countLevel0 = 0;

  for (const entry of entries) {
    if (!entry) continue;

    if (entry.onWatchlist) {
      watchlistCount++;
    }

    if (typeof entry.rating === "number" && !isNaN(entry.rating) && entry.rating > 0) {
      ratedCount++;
      totalRatingSum += entry.rating;

      const userStars = calculateUserStars(entry.rating);
      totalStarsSum += userStars;

      if (userStars === 3) {
        countLevel3++;
      } else if (userStars === 2) {
        countLevel2++;
      } else if (userStars === 1) {
        countLevel1++;
      } else {
        countLevel0++;
      }
    }
  }

  const averageRating = ratedCount > 0 ? Math.round((totalRatingSum / ratedCount) * 10) / 10 : null;
  const averageStars = ratedCount > 0 ? Math.round((totalStarsSum / ratedCount) * 100) / 100 : null;
  const formattedStars = formatStarFraction(averageStars);

  const pct = (c: number) => (ratedCount > 0 ? Math.round((c / ratedCount) * 100) : 0);

  return {
    watchlistCount,
    ratedCount,
    averageRating,
    averageStars,
    formattedStars,
    breakdown: {
      level3: { label: "★★★ 3 estrellas", count: countLevel3, percentage: pct(countLevel3) },
      level2: { label: "★★☆ 2 estrellas", count: countLevel2, percentage: pct(countLevel2) },
      level1: { label: "★☆☆ 1 estrella", count: countLevel1, percentage: pct(countLevel1) },
      level0: { label: "☆☆☆ 0 estrellas", count: countLevel0, percentage: pct(countLevel0) }
    }
  };
}

// Caché de elementos del DOM de la modal de perfil
interface ProfileDom {
  overlay: HTMLElement | null;
  modal: HTMLElement | null;
  closeBtn: HTMLButtonElement | null;
  avatarLarge: HTMLElement | null;
  emailTitle: HTMLElement | null;
  watchlistCount: HTMLElement | null;
  ratedCount: HTMLElement | null;
  averageStarsContainer: HTMLElement | null;
  starsText: HTMLElement | null;
  breakdownContainer: HTMLElement | null;
  exploreWatchlistBtn: HTMLButtonElement | null;
  exploreRatedBtn: HTMLButtonElement | null;
  passwordForm: HTMLFormElement | null;
  newPasswordInput: HTMLInputElement | null;
  passwordToggleBtn: HTMLButtonElement | null;
  passwordStrength: HTMLElement | null;
  securityMessage: HTMLElement | null;
  passwordSubmitBtn: HTMLButtonElement | null;
  syncDot: HTMLElement | null;
  syncText: HTMLElement | null;
  forceSyncBtn: HTMLButtonElement | null;
  exportCsvBtn: HTMLButtonElement | null;
  logoutBtn: HTMLButtonElement | null;
  deleteAccountBtn: HTMLButtonElement | null;
  dangerZone: HTMLElement | null;
  cancelDeleteBtn: HTMLButtonElement | null;
  confirmDeleteBtn: HTMLButtonElement | null;
  deleteMessage: HTMLElement | null;
}

let profileDomCache: ProfileDom | null = null;
let lastFocusedElement: HTMLElement | null = null;

function getProfileDom(): ProfileDom {
  if (typeof document === "undefined") {
    return {
      overlay: null,
      modal: null,
      closeBtn: null,
      avatarLarge: null,
      emailTitle: null,
      watchlistCount: null,
      ratedCount: null,
      averageStarsContainer: null,
      starsText: null,
      breakdownContainer: null,
      exploreWatchlistBtn: null,
      exploreRatedBtn: null,
      passwordForm: null,
      newPasswordInput: null,
      passwordToggleBtn: null,
      passwordStrength: null,
      securityMessage: null,
      passwordSubmitBtn: null,
      syncDot: null,
      syncText: null,
      forceSyncBtn: null,
      exportCsvBtn: null,
      logoutBtn: null,
      deleteAccountBtn: null,
      dangerZone: null,
      cancelDeleteBtn: null,
      confirmDeleteBtn: null,
      deleteMessage: null
    };
  }

  if (!profileDomCache) {
    profileDomCache = {
      overlay: document.getElementById("profile-overlay"),
      modal: document.getElementById("profile-modal"),
      closeBtn: document.getElementById("profile-modal-close") as HTMLButtonElement | null,
      avatarLarge: document.getElementById("profile-avatar-large"),
      emailTitle: document.getElementById("profile-modal-title"),
      watchlistCount: document.getElementById("profile-stat-watchlist-count"),
      ratedCount: document.getElementById("profile-stat-rated-count"),
      averageStarsContainer: document.getElementById("profile-stat-average-stars"),
      starsText: document.getElementById("profile-stat-stars-text"),
      breakdownContainer: document.getElementById("profile-breakdown-container"),
      exploreWatchlistBtn: document.getElementById("profile-btn-explore-watchlist") as HTMLButtonElement | null,
      exploreRatedBtn: document.getElementById("profile-btn-explore-rated") as HTMLButtonElement | null,
      passwordForm: document.getElementById("profile-password-form") as HTMLFormElement | null,
      newPasswordInput: document.getElementById("profile-new-password") as HTMLInputElement | null,
      passwordToggleBtn: document.getElementById("profile-password-toggle") as HTMLButtonElement | null,
      passwordStrength: document.getElementById("profile-password-strength"),
      securityMessage: document.getElementById("profile-security-message"),
      passwordSubmitBtn: document.getElementById("profile-password-submit-btn") as HTMLButtonElement | null,
      syncDot: document.getElementById("profile-sync-dot"),
      syncText: document.getElementById("profile-sync-text"),
      forceSyncBtn: document.getElementById("profile-btn-force-sync") as HTMLButtonElement | null,
      exportCsvBtn: (document.getElementById("profile-btn-export-csv") || document.getElementById("profile-btn-export-json")) as HTMLButtonElement | null,
      logoutBtn: document.getElementById("profile-btn-logout") as HTMLButtonElement | null,
      deleteAccountBtn: document.getElementById("profile-btn-delete-account") as HTMLButtonElement | null,
      dangerZone: document.getElementById("profile-danger-zone"),
      cancelDeleteBtn: document.getElementById("profile-btn-cancel-delete") as HTMLButtonElement | null,
      confirmDeleteBtn: document.getElementById("profile-btn-confirm-delete") as HTMLButtonElement | null,
      deleteMessage: document.getElementById("profile-delete-message")
    };
  }
  return profileDomCache;
}

/**
 * Devuelve true si la modal de perfil está actualmente visible en pantalla.
 */
export function isProfileModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  const { modal } = getProfileDom();
  return Boolean(modal && !modal.hidden);
}

/**
 * Abre el panel de perfil de usuario y calcula las estadísticas cinemáticas en tiempo real.
 */
export async function openProfileModal(): Promise<void> {
  const dom = getProfileDom();
  if (!dom.modal || !dom.overlay) return;

  lastFocusedElement = document.activeElement as HTMLElement | null;

  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  const userEmail = session?.user?.email || "Usuario";
  const initial = userEmail.charAt(0).toUpperCase();

  if (dom.emailTitle) dom.emailTitle.textContent = userEmail;
  if (dom.avatarLarge) dom.avatarLarge.textContent = initial;

  // Render inicial inmediato desde memoria (0 ms)
  renderProfileStats();

  // Si hay sesión activa, sincronizar en segundo plano con la nube mediante LWW (Last-Write-Wins).
  // Elimina cualquier condición de carrera por caché local desactualizada entre múltiples dispositivos.
  if (session?.user) {
    mergeOnLogin(session.user.id).then(() => {
      renderProfileStats();
      updateSyncStatusUI().catch(() => {});
    }).catch(() => {});
  }

  // Actualizar estado de sincronización Local-First
  await updateSyncStatusUI();

  // Resetear formulario de contraseña
  if (dom.passwordForm) dom.passwordForm.reset();
  if (dom.securityMessage) {
    dom.securityMessage.hidden = true;
    dom.securityMessage.textContent = "";
  }
  if (dom.passwordStrength) dom.passwordStrength.hidden = true;

  // Resetear zona de peligro / baja de usuario
  if (dom.dangerZone) dom.dangerZone.hidden = true;
  if (dom.deleteAccountBtn) dom.deleteAccountBtn.hidden = false;
  if (dom.deleteMessage) {
    dom.deleteMessage.hidden = true;
    dom.deleteMessage.textContent = "";
  }
  if (dom.confirmDeleteBtn) {
    dom.confirmDeleteBtn.disabled = false;
    dom.confirmDeleteBtn.textContent = "Sí, eliminar mi cuenta";
  }
  if (dom.cancelDeleteBtn) {
    dom.cancelDeleteBtn.disabled = false;
  }

  // Push state en el historial si no está ya
  if (typeof window !== "undefined" && !window.history.state?.profileModalOpen) {
    window.history.pushState({ ...window.history.state, profileModalOpen: true }, "", window.location.href);
  }

  openAccessibleModal(dom.modal, dom.overlay);
}

/**
 * Cierra la modal de perfil.
 */
export function closeProfileModal(isPopstate = false, options: { suppressHistoryBack?: boolean } = {}): void {
  const dom = getProfileDom();
  if (!dom.modal || !dom.overlay) return;

  closeAccessibleModal(dom.modal, dom.overlay);

  if (!isPopstate && !options.suppressHistoryBack && typeof window !== "undefined" && window.history.state?.profileModalOpen) {
    window.history.back();
  }

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/**
 * Renderiza el bloque de estadísticas cinemáticas del usuario.
 */
export function renderProfileStats(): void {
  const dom = getProfileDom();
  const stats = computeUserMovieStats(getAllUserMovieData());

  if (dom.watchlistCount) {
    dom.watchlistCount.textContent = String(stats.watchlistCount);
  }
  if (dom.ratedCount) {
    dom.ratedCount.textContent = String(stats.ratedCount);
  }
  if (dom.averageStarsContainer) {
    renderFractionalStars(dom.averageStarsContainer, stats.averageStars || 0);
    dom.averageStarsContainer.setAttribute("aria-label", `Promedio de valoración: ${stats.formattedStars}`);
  }
  if (dom.starsText) {
    dom.starsText.textContent = "";
  }

  if (dom.breakdownContainer) {
    const rows = [
      { key: "level3", css: "breakdown-bar-fill--level3", data: stats.breakdown.level3 },
      { key: "level2", css: "breakdown-bar-fill--level2", data: stats.breakdown.level2 },
      { key: "level1", css: "breakdown-bar-fill--level1", data: stats.breakdown.level1 },
      { key: "level0", css: "breakdown-bar-fill--level0", data: stats.breakdown.level0 }
    ];

    dom.breakdownContainer.innerHTML = rows
      .map(
        r => `
        <div class="breakdown-row">
          <span class="breakdown-label">${r.data.label}</span>
          <div class="breakdown-bar-container">
            <div class="breakdown-bar-fill ${r.css}" style="width: ${r.data.percentage}%;"></div>
          </div>
          <span class="breakdown-count">${r.data.count} (${r.data.percentage}%)</span>
        </div>
      `
      )
      .join("");
  }
}

/**
 * Actualiza el indicador visual de estado de sincronización Local-First.
 */
async function updateSyncStatusUI(): Promise<void> {
  const dom = getProfileDom();
  if (!dom.syncDot || !dom.syncText) return;

  const pending = await getPendingSyncEntries();
  if (pending.length === 0) {
    dom.syncDot.className = "sync-dot";
    dom.syncText.textContent = "Al día con la nube (100% sincronizado)";
  } else {
    dom.syncDot.className = "sync-dot sync-dot--dirty";
    dom.syncText.textContent = `${pending.length} acción${pending.length > 1 ? "es" : ""} pendiente${pending.length > 1 ? "s" : ""} de sincronizar`;
  }
}

/**
 * Evalúa la seguridad de una contraseña según estándar NIST (mínimo 8 caracteres).
 */
function evaluatePasswordScore(pwd: string): { score: number; label: string } {
  if (!pwd) return { score: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++;

  const labels = ["Muy débil", "Débil", "Aceptable", "Buena", "Excelente"];
  return { score, label: labels[score] || "" };
}

/**
 * Exporta la colección del usuario en formato CSV (Comma-Separated Values).
 * Incluye cabeceras legibles, enriquecimiento con títulos desde la base de datos
 * y codificación UTF-8 con BOM para compatibilidad total con Excel/Numbers/Sheets.
 */
export async function exportUserDataCsv(): Promise<void> {
  const allEntries: Record<string, UserMovieEntry> = getAllUserMovieData();
  const validEntries = Object.entries(allEntries).filter(
    ([_, item]) => item && (item.rating !== null || item.onWatchlist)
  );

  if (validEntries.length === 0) {
    showToast("No tienes ninguna obra en tu colección para exportar.", "info");
    return;
  }

  const dom = getProfileDom();
  if (dom.exportCsvBtn) {
    dom.exportCsvBtn.disabled = true;
    dom.exportCsvBtn.textContent = "Exportando...";
  }

  try {
    const movieIds = validEntries.map(([id]) => Number(id)).filter(id => !isNaN(id));

    // Consultar metadatos de las películas (título, año, tipo, etc.) desde Supabase
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
          for (const m of (data as any[])) {
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
      "Mi Valoración (1-10)",
      "Mis Estrellas (1-3)",
      "En Pendientes"
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
        escapeCsv(entry.rating ?? ""),
        escapeCsv(userStars),
        escapeCsv(inWatchlist)
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
    if (dom.exportCsvBtn) {
      dom.exportCsvBtn.disabled = false;
      dom.exportCsvBtn.textContent = "Exportar mi colección (CSV)";
    }
  }
}

/**
 * Alias retrocompatible para exportUserDataCsv.
 */
export const exportUserDataJson = exportUserDataCsv;

/**
 * Ejecuta la baja definitiva del usuario en el backend (RPC delete_user_account),
 * purga todos los almacenes locales (IndexedDB y memoria) y cierra la sesión.
 */
export async function deleteUserAccount(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("delete_user_account");
    if (error) {
      return { success: false, error: error.message };
    }

    try {
      await clearLocalStore();
    } catch (localErr) {
      if (import.meta.env.DEV) console.error("Error limpiando localStore:", localErr);
    }
    clearUserMovieData();

    await supabase.auth.signOut();
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Error al eliminar la cuenta.";
    return { success: false, error: msg };
  }
}

/**
 * Registra todos los escuchadores de eventos del panel de perfil.
 */
export function setupProfileModal(): () => void {
  const dom = getProfileDom();
  const unsubscribers: Array<() => void> = [];

  // 1. Cierre con botón [✕]
  if (dom.closeBtn) {
    const onClose = () => closeProfileModal();
    dom.closeBtn.addEventListener("click", onClose);
    unsubscribers.push(() => dom.closeBtn?.removeEventListener("click", onClose));
  }

  // 2. Cierre al pulsar overlay
  if (dom.overlay) {
    const onOverlayClick = () => closeProfileModal();
    dom.overlay.addEventListener("click", onOverlayClick);
    unsubscribers.push(() => dom.overlay?.removeEventListener("click", onOverlayClick));
  }

  // 3. Accesos directos a catálogo desde las estadísticas
  if (dom.exploreWatchlistBtn) {
    const onWatchlistClick = () => {
      closeProfileModal(false, { suppressHistoryBack: true });
      syncWithServer().catch(() => {});
      appEvents.emit("filtersReset", {
        keepSort: true,
        newFilter: { type: "myList", value: "watchlist" },
        replaceHistory: true
      });
    };
    dom.exploreWatchlistBtn.addEventListener("click", onWatchlistClick);
    unsubscribers.push(() => dom.exploreWatchlistBtn?.removeEventListener("click", onWatchlistClick));
  }

  if (dom.exploreRatedBtn) {
    const onRatedClick = () => {
      closeProfileModal(false, { suppressHistoryBack: true });
      syncWithServer().catch(() => {});
      appEvents.emit("filtersReset", {
        keepSort: true,
        newFilter: { type: "myList", value: "rated" },
        replaceHistory: true
      });
    };
    dom.exploreRatedBtn.addEventListener("click", onRatedClick);
    unsubscribers.push(() => dom.exploreRatedBtn?.removeEventListener("click", onRatedClick));
  }

  // 4. Mostrar / Ocultar contraseña
  if (dom.passwordToggleBtn && dom.newPasswordInput) {
    const onTogglePassword = () => {
      if (!dom.newPasswordInput) return;
      const isPassword = dom.newPasswordInput.type === "password";
      dom.newPasswordInput.type = isPassword ? "text" : "password";
      dom.passwordToggleBtn?.classList.toggle("is-visible", isPassword);
    };
    dom.passwordToggleBtn.addEventListener("click", onTogglePassword);
    unsubscribers.push(() => dom.passwordToggleBtn?.removeEventListener("click", onTogglePassword));
  }

  // 5. Medidor de fuerza de contraseña
  if (dom.newPasswordInput && dom.passwordStrength) {
    const strengthMeter = dom.passwordStrength;
    const onPasswordInput = () => {
      const val = dom.newPasswordInput?.value || "";
      if (!val) {
        strengthMeter.hidden = true;
        return;
      }

      strengthMeter.hidden = false;
      const { score, label } = evaluatePasswordScore(val);
      const labelEl = strengthMeter.querySelector(".strength-label");
      if (labelEl) labelEl.textContent = label;
      strengthMeter.querySelectorAll(".strength-bar").forEach((bar, idx) => {
        bar.classList.toggle("active", idx < score);
      });
    };
    dom.newPasswordInput.addEventListener("input", onPasswordInput);
    unsubscribers.push(() => dom.newPasswordInput?.removeEventListener("input", onPasswordInput));
  }

  // 6. Formulario de cambio de contraseña
  if (dom.passwordForm) {
    const onPasswordSubmit = async (e: Event) => {
      e.preventDefault();
      const newPwd = dom.newPasswordInput?.value.trim() || "";

      if (newPwd.length < 8) {
        if (dom.securityMessage) {
          dom.securityMessage.hidden = false;
          dom.securityMessage.className = "auth-message auth-message--error";
          dom.securityMessage.textContent = "La contraseña debe tener al menos 8 caracteres.";
        }
        return;
      }

      if (dom.passwordSubmitBtn) {
        dom.passwordSubmitBtn.disabled = true;
        dom.passwordSubmitBtn.textContent = "Actualizando...";
      }

      try {
        const supabase = await getSupabase();
        const { error } = await supabase.auth.updateUser({ password: newPwd });

        if (error) {
          throw error;
        }

        if (dom.securityMessage) {
          dom.securityMessage.hidden = false;
          dom.securityMessage.className = "auth-message auth-message--success";
          dom.securityMessage.textContent = "¡Contraseña actualizada con éxito!";
        }
        dom.passwordForm?.reset();
        if (dom.passwordStrength) dom.passwordStrength.hidden = true;
        showToast("Contraseña actualizada con éxito.", "success");
      } catch (err: unknown) {
        const msg = (err as Error)?.message || "No se pudo actualizar la contraseña.";
        if (dom.securityMessage) {
          dom.securityMessage.hidden = false;
          dom.securityMessage.className = "auth-message auth-message--error";
          dom.securityMessage.textContent = msg;
        }
      } finally {
        if (dom.passwordSubmitBtn) {
          dom.passwordSubmitBtn.disabled = false;
          dom.passwordSubmitBtn.textContent = "Actualizar Contraseña";
        }
      }
    };
    dom.passwordForm.addEventListener("submit", onPasswordSubmit);
    unsubscribers.push(() => dom.passwordForm?.removeEventListener("submit", onPasswordSubmit));
  }

  // 7. Sincronizar Ahora (Bidireccional: sube pendientes y descarga novedades de la nube)
  if (dom.forceSyncBtn) {
    const onForceSync = async () => {
      if (dom.forceSyncBtn) {
        dom.forceSyncBtn.disabled = true;
        dom.forceSyncBtn.textContent = "Sincronizando...";
      }
      try {
        await syncWithServer();
        const supabase = await getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await mergeOnLogin(session.user.id);
        }
        await updateSyncStatusUI();
        renderProfileStats();
        showToast("Sincronización completada con la nube.", "success");
      } catch {
        showToast("No se pudo sincronizar en este momento.", "error");
      } finally {
        if (dom.forceSyncBtn) {
          dom.forceSyncBtn.disabled = false;
          dom.forceSyncBtn.textContent = "Sincronizar Ahora";
        }
      }
    };
    dom.forceSyncBtn.addEventListener("click", onForceSync);
    unsubscribers.push(() => dom.forceSyncBtn?.removeEventListener("click", onForceSync));
  }

  // 8. Exportar CSV
  if (dom.exportCsvBtn) {
    const onExport = () => {
      exportUserDataCsv().catch(err => {
        if (import.meta.env.DEV) console.error("Error al exportar CSV:", err);
      });
    };
    dom.exportCsvBtn.addEventListener("click", onExport);
    unsubscribers.push(() => dom.exportCsvBtn?.removeEventListener("click", onExport));
  }

  // 9. Cerrar Sesión desde el modal
  if (dom.logoutBtn) {
    const onLogout = async () => {
      closeProfileModal();
      try {
        await clearLocalStore();
      } catch (err) {
        console.error("Error al limpiar almacén local en logout:", err);
      }
      const supabase = await getSupabase();
      await supabase.auth.signOut();
    };
    dom.logoutBtn.addEventListener("click", onLogout);
    unsubscribers.push(() => dom.logoutBtn?.removeEventListener("click", onLogout));
  }

  // 10. Gestión de baja / eliminación definitiva de cuenta de usuario
  if (dom.deleteAccountBtn && dom.dangerZone) {
    const onOpenDangerZone = () => {
      if (!dom.dangerZone) return;
      dom.dangerZone.hidden = false;
      if (dom.deleteAccountBtn) dom.deleteAccountBtn.hidden = true;
      if (dom.deleteMessage) {
        dom.deleteMessage.hidden = true;
        dom.deleteMessage.textContent = "";
      }
      dom.dangerZone.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    dom.deleteAccountBtn.addEventListener("click", onOpenDangerZone);
    unsubscribers.push(() => dom.deleteAccountBtn?.removeEventListener("click", onOpenDangerZone));
  }

  if (dom.cancelDeleteBtn && dom.dangerZone) {
    const onCancelDelete = () => {
      if (!dom.dangerZone) return;
      dom.dangerZone.hidden = true;
      if (dom.deleteAccountBtn) dom.deleteAccountBtn.hidden = false;
      if (dom.deleteMessage) {
        dom.deleteMessage.hidden = true;
        dom.deleteMessage.textContent = "";
      }
    };
    dom.cancelDeleteBtn.addEventListener("click", onCancelDelete);
    unsubscribers.push(() => dom.cancelDeleteBtn?.removeEventListener("click", onCancelDelete));
  }

  if (dom.confirmDeleteBtn) {
    const onConfirmDelete = async () => {
      if (dom.confirmDeleteBtn) {
        dom.confirmDeleteBtn.disabled = true;
        dom.confirmDeleteBtn.textContent = "Eliminando cuenta...";
      }
      if (dom.cancelDeleteBtn) {
        dom.cancelDeleteBtn.disabled = true;
      }

      const res = await deleteUserAccount();

      if (!res.success) {
        if (dom.deleteMessage) {
          dom.deleteMessage.hidden = false;
          dom.deleteMessage.textContent = res.error || "No se pudo eliminar la cuenta. Inténtalo más tarde.";
        }
        showToast("Error al eliminar la cuenta.", "error");
        if (dom.confirmDeleteBtn) {
          dom.confirmDeleteBtn.disabled = false;
          dom.confirmDeleteBtn.textContent = "Sí, eliminar mi cuenta";
        }
        if (dom.cancelDeleteBtn) {
          dom.cancelDeleteBtn.disabled = false;
        }
        return;
      }

      closeProfileModal(false, { suppressHistoryBack: true });
      showToast("Tu cuenta ha sido eliminada permanentemente.", "info");
    };
    dom.confirmDeleteBtn.addEventListener("click", onConfirmDelete);
    unsubscribers.push(() => dom.confirmDeleteBtn?.removeEventListener("click", onConfirmDelete));
  }

  // 10. Actualizar estadísticas cuando cambien los datos de usuario en memoria
  const unsubUserData = appEvents.on("userDataUpdated", () => {
    if (isProfileModalOpen()) {
      renderProfileStats();
      updateSyncStatusUI().catch(() => {});
    }
  });
  unsubscribers.push(unsubUserData);

  // 11. Tecla Escape
  if (typeof window !== "undefined") {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isProfileModalOpen()) {
        closeProfileModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    unsubscribers.push(() => window.removeEventListener("keydown", onKeyDown));
  }

  return () => {
    unsubscribers.forEach(fn => fn());
    profileDomCache = null;
  };
}
