import "../../css/components/legal.css";
import { ensureLegalModalMounted } from "../templates/legalModal.js";
import {
  dom,
  openAccessibleModal,
  closeAccessibleModal,
  pushModalHistoryState,
  popModalHistoryState,
} from "../ui.js";

let legalModalListenersInitialized = false;
let legalTriggerBound = false;

export const isLegalModalOpen = (): boolean => {
  return Boolean(dom.legalModal && !dom.legalModal.hidden);
};

function switchLegalTab(tabName: string): void {
  const modal = dom.legalModal;
  if (!modal) return;

  const tabs = modal.querySelectorAll<HTMLButtonElement>(".legal-tab-btn");
  const panels = modal.querySelectorAll<HTMLElement>(".legal-panel");

  let targetPanelId = `panel-${tabName}`;
  let found = false;
  let activeTab: HTMLButtonElement | null = null;

  tabs.forEach((tab) => {
    const isTarget = tab.getAttribute("data-tab") === tabName;
    tab.classList.toggle("is-active", isTarget);
    tab.setAttribute("aria-selected", isTarget ? "true" : "false");
    if (isTarget) {
      found = true;
      activeTab = tab;
    }
  });

  if (!found && tabs.length > 0) {
    tabs[0].classList.add("is-active");
    tabs[0].setAttribute("aria-selected", "true");
    targetPanelId = tabs[0].getAttribute("aria-controls") || "panel-about";
    activeTab = tabs[0];
  }

  panels.forEach((panel) => {
    const isTarget = panel.id === targetPanelId;
    panel.classList.toggle("is-active", isTarget);
    panel.hidden = !isTarget;
  });

  const body = modal.querySelector<HTMLElement>(".legal-body");
  if (body) body.scrollTop = 0;

  if (activeTab) {
    requestAnimationFrame(() => {
      activeTab?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }
}

export const closeLegalModal = (options?: { fromPopstate?: boolean; suppressHistoryBack?: boolean } | Event): void => {
  const wasOpen = isLegalModalOpen();
  closeAccessibleModal(dom.legalModal, dom.legalOverlay);

  let hadLegalParam = false;
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("legal")) {
        hadLegalParam = true;
        url.searchParams.delete("legal");
        const cleanSearch = url.searchParams.toString();
        const cleanUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : "") + url.hash;
        window.history.replaceState(window.history.state, "", cleanUrl);
      }
    } catch {
      // no-op
    }
  }

  if (wasOpen && !hadLegalParam) {
    popModalHistoryState(options);
  }
};

function initLegalModalListeners(): void {
  if (legalModalListenersInitialized) return;
  const { legalModal, legalOverlay } = dom;
  if (!legalModal) return;

  const closeBtn = document.getElementById("legal-close-btn");
  closeBtn?.addEventListener("click", () => closeLegalModal());
  legalOverlay?.addEventListener("click", () => closeLegalModal());

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isLegalModalOpen()) {
      closeLegalModal();
    }
  });

  legalModal.querySelectorAll<HTMLButtonElement>(".legal-tab-btn").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const tab = tabBtn.getAttribute("data-tab");
      if (tab) switchLegalTab(tab);
    });
  });

  legalModalListenersInitialized = true;
}

export const openLegalModal = (tabName = "about"): void => {
  ensureLegalModalMounted();
  initLegalModalListeners();
  openAccessibleModal(dom.legalModal, dom.legalOverlay, false);
  pushModalHistoryState();
  switchLegalTab(tabName);
  requestAnimationFrame(() => {
    const activeTab = dom.legalModal?.querySelector<HTMLElement>(".legal-tab-btn.is-active");
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  });
};

export function setupLegalModal(): void {
  if (!legalTriggerBound) {
    legalTriggerBound = true;
  }

  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const legalTab = urlParams.get("legal");
      if (legalTab && ["about", "contact", "legal", "privacy", "cookies"].includes(legalTab.toLowerCase())) {
        openLegalModal(legalTab.toLowerCase());
      }
    } catch {
      // no-op
    }
  }
}
