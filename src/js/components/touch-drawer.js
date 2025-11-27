// =================================================================
//          COMPONENTE: Touch Drawer (v2.1 - Física Elástica)
// =================================================================
// v2.1 - Añadido efecto "Rubber Banding" (Resistencia elástica).
//        Ahora el usuario siente tensión al arrastrar más allá de los
//        límites, mejorando la percepción de app nativa.
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
  let startTranslate = 0; // Cacheamos la posición inicial
  let isHorizontalDrag = false; 

  // --- Lógica de Apertura/Cierre ---
  const openDrawer = () => {
    document.body.classList.add("sidebar-is-open");
    sidebar.style.transform = `translateX(0px)`;
    // Curva bezier para el "snap" de vuelta
    sidebar.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
    currentTranslate = 0;
  };
  
  const closeDrawer = () => {
    document.body.classList.remove("sidebar-is-open");
    sidebar.style.transform = `translateX(-${DRAWER_WIDTH}px)`;
    sidebar.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    currentTranslate = -DRAWER_WIDTH;
  };

  // Estado inicial
  const sidebarIsOpenOnLoad = document.body.classList.contains("sidebar-is-open");
  currentTranslate = sidebarIsOpenOnLoad ? 0 : -DRAWER_WIDTH;

  function handleTouchStart(e) {
    if (window.innerWidth > 768) return;

    const sidebarIsOpen = document.body.classList.contains("sidebar-is-open");
    const canStartDrag = (sidebarIsOpen && e.target.closest("#sidebar")) || (!sidebarIsOpen && e.touches[0].clientX < 80);

    if (!canStartDrag) {
      isDragging = false;
      return;
    }

    isDragging = true;
    isHorizontalDrag = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    
    // CACHEAMOS EL ESTADO INICIAL AQUÍ (Optimización)
    startTranslate = sidebarIsOpen ? 0 : -DRAWER_WIDTH;
    
    sidebar.style.transition = "none"; // Sin transición para respuesta 1:1 al dedo
  }

  function handleTouchMove(e) {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // Detección de dirección
    if (!isHorizontalDrag) {
      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        if (Math.abs(diffY) > Math.abs(diffX) * 1.5) {
          isDragging = false; // Es scroll vertical, cancelamos
          return;
        }
        isHorizontalDrag = true; // Es swipe horizontal, procedemos
      } else {
        return; // Umbral no superado
      }
    }

    e.preventDefault(); // Bloqueamos scroll nativo

    // Cálculo "raw" del movimiento
    let newTranslate = startTranslate + diffX;

    // --- FÍSICA ELÁSTICA (RUBBER BANDING) ---
    if (newTranslate > 0) {
      // Caso 1: Arrastrando más allá de la apertura (Hacia la derecha cuando está abierto)
      // Aplicamos resistencia del 30%
      newTranslate = newTranslate * 0.3; 
    } else if (newTranslate < -DRAWER_WIDTH) {
      // Caso 2: Arrastrando más allá del cierre (Hacia la izquierda cuando está cerrado)
      const overflow = Math.abs(newTranslate + DRAWER_WIDTH);
      newTranslate = -DRAWER_WIDTH - (overflow * 0.3);
    }
    // Nota: Si está entre -280 y 0, el movimiento es 1:1 (sin resistencia)

    currentTranslate = newTranslate;
    sidebar.style.transform = `translateX(${currentTranslate}px)`;
  }

  function handleTouchEnd(e) {
    if (!isDragging || !isHorizontalDrag) {
      isDragging = false;
      return;
    }
    isDragging = false;
    isHorizontalDrag = false;

    const touchDuration = Date.now() - touchStartTime;
    const finalX = e.changedTouches[0].clientX;
    const swipeDistance = finalX - touchStartX;
    const swipeVelocity = touchDuration > 0 ? swipeDistance / touchDuration : 0;

    // Lógica de decisión (Inercia vs Posición)
    if (Math.abs(swipeVelocity) > SWIPE_VELOCITY_THRESHOLD) {
      swipeVelocity > 0 ? openDrawer() : closeDrawer();
    } else {
      // Si soltamos en la "zona elástica" (ej. > 0), openDrawer() lo devolverá a 0 suavemente
      currentTranslate > -DRAWER_WIDTH / 2 ? openDrawer() : closeDrawer();
    }
  }

  // Listeners
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  // --- Utils ---
  const rewindButton = document.querySelector("#rewind-button");
  if (rewindButton) {
    rewindButton.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        document.body.classList.contains("sidebar-is-open") ? closeDrawer() : openDrawer();
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
      sidebar.style.transform = "";
      sidebar.style.transition = "";
      currentTranslate = -DRAWER_WIDTH; 
    } else {
      if (document.body.classList.contains("sidebar-is-open")) openDrawer(); 
      else closeDrawer();
    }
  });
}