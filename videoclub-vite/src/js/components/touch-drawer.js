// =================================================================
//          COMPONENTE: Touch Drawer (v2 - Nativo y Fluido)
// =================================================================
// v2.0 - Implementa una lógica de gestos avanzada:
//      - Diferencia entre scroll vertical y swipe horizontal para evitar conflictos.
//      - Añade detección de velocidad de swipe para una respuesta más rápida e intutiva.
//      - Utiliza 'passive: false' para una cancelación de eventos eficiente.
//      - (Futuro) Añadirá feedback háptico en los umbrales.
// =================================================================

export function initTouchDrawer() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  // --- Constantes y Estado del Gesto ---
  const DRAWER_WIDTH = 280;
  const SWIPE_VELOCITY_THRESHOLD = 0.4; // Píxeles por milisegundo

  let isDragging = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let currentTranslate = 0;
  let isHorizontalDrag = false; // Flag para saber si hemos confirmado un swipe horizontal

  // --- Lógica de Apertura/Cierre Centralizada ---
  const openDrawer = () => {
    document.body.classList.add("sidebar-is-open");
    sidebar.style.transform = `translateX(0px)`;
    sidebar.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    currentTranslate = 0;
  };
  const closeDrawer = () => {
    document.body.classList.remove("sidebar-is-open");
    sidebar.style.transform = `translateX(-${DRAWER_WIDTH}px)`;
    sidebar.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    currentTranslate = -DRAWER_WIDTH;
  };

  // Inicializa el estado visual correcto al cargar la página
  const sidebarIsOpenOnLoad =
    document.body.classList.contains("sidebar-is-open");
  currentTranslate = sidebarIsOpenOnLoad ? 0 : -DRAWER_WIDTH;

  function handleTouchStart(e) {
    if (window.innerWidth > 768) return;

    const sidebarIsOpen = document.body.classList.contains("sidebar-is-open");

    // Lógica para determinar si el gesto debe iniciar el seguimiento
    const canStartDrag =
      (sidebarIsOpen && e.target.closest("#sidebar")) || // Si está abierto, solo se arrastra desde el sidebar
      (!sidebarIsOpen && e.touches[0].clientX < 80); // Si está cerrado, solo desde el borde izquierdo (80px)

    if (!canStartDrag) {
      isDragging = false;
      return;
    }

    isDragging = true;
    isHorizontalDrag = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    sidebar.style.transition = "none"; // Desactivamos la animación durante el arrastre
  }

function handleTouchMove(e) {
  if (!isDragging) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchStartX; // <- ÚNICA DECLARACIÓN
  const diffY = currentY - touchStartY; // <- Movemos esta declaración aquí también para agrupar

  // MEJORA: Detección de dirección de gesto con umbral
  if (!isHorizontalDrag) {
    // Solo tomamos una decisión si el movimiento es significativo
    if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
      // Si el movimiento vertical es significativamente mayor, es scroll.
      if (Math.abs(diffY) > Math.abs(diffX) * 1.5) {
        isDragging = false; // Liberamos el gesto
        return;
      }
      // Si no es scroll, confirmamos que es un arrastre horizontal.
      isHorizontalDrag = true;
    } else {
      // El movimiento es demasiado pequeño, no hacemos nada todavía.
      return;
    }
  }

    // Una vez confirmado el arrastre horizontal, prevenimos el scroll de la página.
    e.preventDefault();

    // Calculamos la nueva posición del drawer
    const startTranslate = document.body.classList.contains("sidebar-is-open")
      ? 0
      : -DRAWER_WIDTH;
    const newTranslate = startTranslate + diffX;

    // Restringimos el movimiento para que no se pase de los límites
    currentTranslate = Math.max(-DRAWER_WIDTH, Math.min(0, newTranslate));
    sidebar.style.transform = `translateX(${currentTranslate}px)`;
  }

  function handleTouchEnd(e) {
    if (!isDragging || !isHorizontalDrag) {
      isDragging = false;
      return;
    }
    isDragging = false;
    isHorizontalDrag = false;

    // MEJORA: Detección de velocidad de swipe
    const touchDuration = Date.now() - touchStartTime;
    const finalX = e.changedTouches[0].clientX;
    const swipeDistance = finalX - touchStartX;
    const swipeVelocity = touchDuration > 0 ? swipeDistance / touchDuration : 0;

    // --- Lógica de Decisión Refactorizada ---
    // 1. Prioridad 1: Gesto de swipe rápido
    if (Math.abs(swipeVelocity) > SWIPE_VELOCITY_THRESHOLD) {
      // Swipe hacia la derecha (abrir) o izquierda (cerrar)
      swipeVelocity > 0 ? openDrawer() : closeDrawer();
    }
    // 2. Prioridad 2: Arrastre lento basado en la posición final
    else {
      currentTranslate > -DRAWER_WIDTH / 2 ? openDrawer() : closeDrawer();
    }
  }

  // --- Añadir Listeners ---
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  // El listener de 'touchmove' es explícitamente no-pasivo para poder llamar a preventDefault().
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  // --- Lógica complementaria para botones y overlay (sin cambios) ---
  const rewindButton = document.querySelector("#rewind-button");
  if (rewindButton) {
    rewindButton.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        document.body.classList.contains("sidebar-is-open")
          ? closeDrawer()
          : openDrawer();
      }
    });
  }

  const sidebarOverlay = document.getElementById("sidebar-overlay");
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeDrawer);
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      document.body.classList.remove("sidebar-is-open");
      sidebar.style.transform = "none";
      sidebar.style.transition = "";
    } else {
      // Reajusta la posición en móvil al rotar el dispositivo
      document.body.classList.contains("sidebar-is-open")
        ? openDrawer()
        : closeDrawer();
    }
  });
}
