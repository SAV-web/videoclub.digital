import "../../css/components/profile.css";
// =================================================================
//      PANEL DE PERFIL DE USUARIO (src/js/components/profile.ts)
// =================================================================
// Gestiona la ficha de usuario autenticado: estadísticas de videoteca,
// distribución de calificaciones, cambio de contraseña (NIST),
// exportación de datos y sincronización Local-First.
// =================================================================

import { getSupabase } from "../supabaseClient.js";
import { getCurrentSession, signOutCurrentUser, updatePassword, evaluatePasswordStrength } from "../auth.js";
import { getAllUserMovieData, clearUserMovieData, setUserMovieData, appEvents } from "../state.js";
import {
  openAccessibleModal,
  closeAccessibleModal,
  showToast,
  bindBottomSheetSwipeToDismiss,
  pushModalHistoryState,
  popModalHistoryState,
} from "../ui.js";
import { UserMovieEntry } from "../types.js";
import { getPendingSyncEntries, clearLocalStore } from "../localStore.js";
import { syncWithServer, mergeOnLogin, getLastSyncFailures } from "../syncManager.js";
import { calculateUserStars } from "../../shared/formatters.js";
import { ensureProfileModalMounted } from "../templates/profileModal.js";
import { renderStars } from "./rating.js";
import { exportUserDataCsv, parseCsvRows, importUserDataCsv } from "./profileCsv.js";

export { exportUserDataCsv, parseCsvRows, importUserDataCsv };

interface UserMovieStats {
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
const renderFractionalStars = (container: HTMLElement, filledAmount: number): void =>
  renderStars(container, filledAmount);

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
  importCsvBtn: HTMLButtonElement | null;
  csvFileInput: HTMLInputElement | null;
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
      importCsvBtn: null,
      csvFileInput: null,
      logoutBtn: null,
      deleteAccountBtn: null,
      dangerZone: null,
      cancelDeleteBtn: null,
      confirmDeleteBtn: null,
      deleteMessage: null
    };
  }

  if (!profileDomCache || !profileDomCache.modal?.isConnected) {
    ensureProfileModalMounted();
    profileDomCache = {
      overlay: document.getElementById("profile-overlay"),
      modal: document.getElementById("profile-modal"),
      closeBtn: document.getElementById("profile-modal-close") as HTMLButtonElement | null,
      avatarLarge: document.getElementById("profile-avatar-large"),
      emailTitle: document.getElementById("profile-modal-title"),
      watchlistCount: document.getElementById("profile-stat-watchlist-count"),
      ratedCount: document.getElementById("profile-stat-rated-count"),
      averageStarsContainer: document.getElementById("profile-stat-average-stars"),
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
      exportCsvBtn: document.getElementById("profile-btn-export-csv") as HTMLButtonElement | null,
      importCsvBtn: document.getElementById("profile-btn-import-csv") as HTMLButtonElement | null,
      csvFileInput: document.getElementById("profile-csv-file-input") as HTMLInputElement | null,
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

  dom.modal.style.transform = "";
  dom.modal.classList.remove("is-dragging");

  lastFocusedElement = document.activeElement as HTMLElement | null;

  const session = await getCurrentSession();

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
  if (dom.newPasswordInput) dom.newPasswordInput.type = "password";
  if (dom.passwordToggleBtn) {
    dom.passwordToggleBtn.classList.remove("is-visible");
    dom.passwordToggleBtn.setAttribute("aria-label", "Mostrar contraseña");
    const useEl = dom.passwordToggleBtn.querySelector("use");
    if (useEl) useEl.setAttribute("href", "#icon-eye");
  }
  if (dom.securityMessage) {
    dom.securityMessage.hidden = true;
    dom.securityMessage.textContent = "";
  }
  if (dom.passwordStrength) {
    dom.passwordStrength.hidden = true;
    dom.passwordStrength.removeAttribute("data-strength");
  }

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

  openAccessibleModal(dom.modal, dom.overlay);
  pushModalHistoryState();
}

/**
 * Cierra la modal de perfil.
 */
export function closeProfileModal(isPopstate = false, options: { suppressHistoryBack?: boolean } = {}): void {
  const dom = getProfileDom();
  if (!dom.modal || !dom.overlay) return;

  const wasOpen = isProfileModalOpen();
  dom.modal.style.transform = "";
  dom.modal.classList.remove("is-dragging");

  if (wasOpen) {
    popModalHistoryState({ fromPopstate: isPopstate, suppressHistoryBack: options.suppressHistoryBack });
  }

  closeAccessibleModal(dom.modal, dom.overlay);

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/**
 * Renderiza el bloque de estadísticas cinemáticas del usuario.
 */
function renderProfileStats(): void {
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

  if (dom.breakdownContainer) {
    const rows = [
      { key: "level3", css: "breakdown-bar-fill--level3", data: stats.breakdown.level3 },
      { key: "level2", css: "breakdown-bar-fill--level2", data: stats.breakdown.level2 },
      { key: "level1", css: "breakdown-bar-fill--level1", data: stats.breakdown.level1 },
      { key: "level0", css: "breakdown-bar-fill--level0", data: stats.breakdown.level0 }
    ];

    const rowElements = rows.map(r => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "breakdown-row";

      const labelSpan = document.createElement("span");
      labelSpan.className = "breakdown-label";
      labelSpan.textContent = r.data.label;

      const barContainer = document.createElement("div");
      barContainer.className = "breakdown-bar-container";

      const barFill = document.createElement("div");
      barFill.className = `breakdown-bar-fill ${r.css}`;
      barFill.style.width = `${r.data.percentage}%`;
      barContainer.appendChild(barFill);

      const countSpan = document.createElement("span");
      countSpan.className = "breakdown-count";
      countSpan.textContent = `${r.data.count} (${r.data.percentage}%)`;

      rowDiv.append(labelSpan, barContainer, countSpan);
      return rowDiv;
    });

    dom.breakdownContainer.replaceChildren(...rowElements);
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
    dom.syncText.removeAttribute("title");
  } else {
    dom.syncDot.className = "sync-dot sync-dot--dirty";
    dom.syncText.textContent = `${pending.length} acción${pending.length > 1 ? "es" : ""} pendiente${pending.length > 1 ? "s" : ""} de sincronizar`;
    const ids = pending.map(p => p.movieId).join(", ");
    dom.syncText.setAttribute("title", `Películas pendientes: ${ids}`);
  }
}

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

    await signOutCurrentUser();
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

  // 2. Cierre al pulsar fuera del cuadro de perfil (overlay o backdrop exterior de la modal en desktop)
  if (dom.overlay) {
    const onOverlayClick = () => closeProfileModal();
    dom.overlay.addEventListener("click", onOverlayClick);
    unsubscribers.push(() => dom.overlay?.removeEventListener("click", onOverlayClick));
  }

  if (dom.modal) {
    const onModalClick = (e: MouseEvent) => {
      // Si el click ocurre en el contenedor modal de fondo (fuera de .profile-box)
      if (e.target === dom.modal) {
        closeProfileModal();
      }
    };
    dom.modal.addEventListener("click", onModalClick);
    unsubscribers.push(() => dom.modal?.removeEventListener("click", onModalClick));
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
      dom.passwordToggleBtn?.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");
      const useEl = dom.passwordToggleBtn?.querySelector("use");
      if (useEl) {
        useEl.setAttribute("href", isPassword ? "#icon-eye-off" : "#icon-eye");
      } else if (dom.passwordToggleBtn) {
        dom.passwordToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><use href="${isPassword ? "#icon-eye-off" : "#icon-eye"}"></use></svg>`;
      }
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
        strengthMeter.removeAttribute("data-strength");
        const labelEl = strengthMeter.querySelector(".strength-label");
        if (labelEl) labelEl.textContent = "";
        const progress = strengthMeter.querySelector(".strength-bars");
        if (progress) progress.setAttribute("aria-valuenow", "0");
        return;
      }

      strengthMeter.hidden = false;
      const { score, label } = evaluatePasswordStrength(val);
      strengthMeter.setAttribute("data-strength", String(score));
      const labelEl = strengthMeter.querySelector(".strength-label");
      if (labelEl) labelEl.textContent = label;
      const progress = strengthMeter.querySelector(".strength-bars");
      if (progress) progress.setAttribute("aria-valuenow", String(score));
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
        const { error } = await updatePassword(newPwd);

        if (error) {
          throw error;
        }

        if (dom.securityMessage) {
          dom.securityMessage.hidden = false;
          dom.securityMessage.className = "auth-message auth-message--success";
          dom.securityMessage.textContent = "¡Contraseña actualizada con éxito!";
        }
        dom.passwordForm?.reset();
        if (dom.passwordStrength) {
          dom.passwordStrength.hidden = true;
          dom.passwordStrength.removeAttribute("data-strength");
        }
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
        const session = await getCurrentSession();
        if (session?.user) {
          await mergeOnLogin(session.user.id);
        }
        await updateSyncStatusUI();
        renderProfileStats();

        const remainingPending = await getPendingSyncEntries();
        if (remainingPending.length === 0) {
          showToast("Sincronización completada con la nube.", "success");
        } else {
          const failures = getLastSyncFailures();
          const hasCheckConstraint = failures.some(f => f.message.includes("check_user_entry_has_action") || f.code === "23514");
          if (hasCheckConstraint) {
            showToast(`${remainingPending.length} notas requieren actualizar la restricción SQL en Supabase para permitir notas sin puntuación.`, "info");
          } else {
            showToast(`Sincronización parcial: ${remainingPending.length} acción(es) pendiente(s).`, "info");
          }
        }
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

  // 8.1. Importar CSV
  if (dom.importCsvBtn && dom.csvFileInput) {
    const onImportClick = () => {
      dom.csvFileInput?.click();
    };
    const onFileChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        importUserDataCsv(file, { onImported: renderProfileStats }).catch(err => {
          if (import.meta.env.DEV) console.error("Error al importar CSV:", err);
        });
      }
    };
    dom.importCsvBtn.addEventListener("click", onImportClick);
    dom.csvFileInput.addEventListener("change", onFileChange);
    unsubscribers.push(() => {
      dom.importCsvBtn?.removeEventListener("click", onImportClick);
      dom.csvFileInput?.removeEventListener("change", onFileChange);
    });
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
      await signOutCurrentUser();
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

  // 12. Gesto táctil de deslizamiento hacia abajo para cerrar (Bottom Sheet Swipe Down en móvil)
  if (dom.modal) {
    const modalEl = dom.modal;
    const scrollContent = modalEl.querySelector<HTMLElement>(".profile-content-scroll") || modalEl;
    unsubscribers.push(bindBottomSheetSwipeToDismiss(modalEl, scrollContent, closeProfileModal));
  }

  return () => {
    unsubscribers.forEach(fn => fn());
    profileDomCache = null;
  };
}
