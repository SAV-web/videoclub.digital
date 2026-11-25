import { appEvents } from "../state.js";
import { ensureAuthModalMounted, loadAuthStyles } from "../templates/authModal.js";
import {
  dom,
  openAccessibleModal,
  closeAccessibleModal,
  pushModalHistoryState,
  popModalHistoryState,
  bindBottomSheetSwipeToDismiss,
} from "../ui.js";

let authModalListenersInitialized = false;

export const isAuthModalOpen = (): boolean => {
  return Boolean(dom.authModal && !dom.authModal.hidden);
};

export const closeAuthModal = (options?: { fromPopstate?: boolean; suppressHistoryBack?: boolean } | Event): void => {
  const wasOpen = isAuthModalOpen();
  if (wasOpen && dom.authModal) {
    dom.authModal.style.transform = "";
    dom.authModal.classList.remove("is-dragging");
  }
  if (wasOpen) {
    popModalHistoryState(options);
  }
  closeAccessibleModal(dom.authModal, dom.authOverlay);
};

function initAuthModalListeners(): void {
  if (authModalListenersInitialized) return;
  const { authModal, authOverlay } = dom;
  if (!authModal) return;

  authOverlay?.addEventListener("click", () => closeAuthModal());

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
  });

  // Gesto táctil de deslizamiento hacia abajo para cerrar (Bottom Sheet Swipe Down en móvil)
  const authBox = authModal.querySelector<HTMLElement>(".auth-box") || authModal;
  bindBottomSheetSwipeToDismiss(authModal, authBox, closeAuthModal);

  authModalListenersInitialized = true;
}

export const openAuthModal = async (): Promise<void> => {
  appEvents.emit("auth:requested");
  await loadAuthStyles();
  ensureAuthModalMounted();
  try {
    const { initAuthForms } = await import("../auth.js");
    initAuthForms();
  } catch (e) {
    if (import.meta.env.DEV) console.error("Error loading auth module", e);
  }
  initAuthModalListeners();
  if (dom.authModal) {
    dom.authModal.style.transform = "";
    dom.authModal.classList.remove("is-dragging");
    dom.authModal.scrollTop = 0;
    const authBox = dom.authModal.querySelector<HTMLElement>(".auth-box");
    if (authBox) authBox.scrollTop = 0;
  }
  openAccessibleModal(dom.authModal, dom.authOverlay);
  pushModalHistoryState();

  // Garantizar que en móvil la modal inicie estrictamente desde el principio (logo e inputs visibles)
  const resetScroll = () => {
    if (dom.authModal) {
      dom.authModal.scrollTop = 0;
      const authBox = dom.authModal.querySelector<HTMLElement>(".auth-box");
      if (authBox && authBox.scrollTop !== 0) authBox.scrollTop = 0;
    }
  };
  requestAnimationFrame(resetScroll);
  setTimeout(resetScroll, 50);
  setTimeout(resetScroll, 150);
  setTimeout(resetScroll, 360);
};

let authStylesPrewarmed = false;

export function setupAuthModal(): void {
  if (authStylesPrewarmed) return;
  authStylesPrewarmed = true;
  void loadAuthStyles();
}
