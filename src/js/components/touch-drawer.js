// =================================================================
//          COMPONENTE: Touch Drawer (v2 - Nativo y Fluido)
// =================================================================
// v2.0 - Añadida la detección de velocidad de swipe.
//      - Previene el scroll vertical de la página durante el arrastre horizontal.
//      - Refactorizada la lógica de apertura/cierre para una mejor UX.
// =================================================================

export function initTouchDrawer() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // --- Estado del Gesto ---
    let isDragging = false;
    let touchStartX = 0;
    let touchStartTime = 0;
    let currentTranslate = document.body.classList.contains('sidebar-is-open') ? 0 : -280;
    let startY = 0; // Para detectar la dirección del scroll
    let isHorizontalDrag = false;

    // --- Lógica de Apertura/Cierre Centralizada ---
    const openDrawer = () => {
        document.body.classList.add('sidebar-is-open');
        sidebar.style.transform = 'translateX(0px)';
        currentTranslate = 0;
    };
    const closeDrawer = () => {
        document.body.classList.remove('sidebar-is-open');
        sidebar.style.transform = 'translateX(-280px)';
        currentTranslate = -280;
    };

    function handleDrawerTouchStart(e) {
        // Activar solo en móvil y si el toque está cerca del borde izquierdo de la pantalla,
        // o si el toque empieza DENTRO de un sidebar ya abierto.
        const canStartDrag = window.innerWidth <= 768 && 
            (e.touches[0].clientX < 30 || e.target.closest('#sidebar'));

        if (canStartDrag) {
            isDragging = true;
            isHorizontalDrag = false; // Resetear la detección de dirección
            touchStartX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            touchStartTime = Date.now();
            sidebar.style.transition = 'none';
        }
    }

    function handleDrawerTouchMove(e) {
        if (!isDragging) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX;
        
        // ▼▼▼ MEJORA: Detección de dirección de gesto ▼▼▼
        if (!isHorizontalDrag) {
            const diffY = currentY - startY;
            // Si el movimiento vertical es mayor que el horizontal,
            // asumimos que el usuario quiere hacer scroll y liberamos el gesto.
            if (Math.abs(diffY) > Math.abs(diffX)) {
                isDragging = false;
                return;
            }
            isHorizontalDrag = true;
        }

        // Si hemos confirmado un arrastre horizontal, prevenimos el scroll.
        e.preventDefault();

        const newTranslate = currentTranslate + diffX;
        // Restringimos el movimiento entre -280 (cerrado) y 0 (abierto).
        currentTranslate = Math.max(-280, Math.min(0, newTranslate));
        sidebar.style.transform = `translateX(${currentTranslate}px)`;
        
        // Actualizamos startX para el próximo movimiento
        touchStartX = currentX;
    }

    function handleDrawerTouchEnd() {
        if (!isDragging || !isHorizontalDrag) {
            isDragging = false;
            return;
        }
        isDragging = false;
        
        sidebar.style.transition = ''; // Restaurar la animación CSS

        const touchDuration = Date.now() - touchStartTime;
        // Usamos la posición final para calcular la distancia, es más preciso.
        const touchDistance = currentTranslate - (document.body.classList.contains('sidebar-is-open') ? 0 : -280);
        
        // Evitar división por cero si el toque es muy corto
        const swipeVelocity = touchDuration > 0 ? touchDistance / touchDuration : 0;
        
        const SWIPE_VELOCITY_THRESHOLD = 0.4;

        // --- Lógica de Decisión Refactorizada ---
        // 1. Prioridad 1: Gesto de swipe rápido
        if (Math.abs(swipeVelocity) > SWIPE_VELOCITY_THRESHOLD) {
            // Swipe hacia la derecha (velocidad positiva) => Abrir
            // Swipe hacia la izquierda (velocidad negativa) => Cerrar
            swipeVelocity > 0 ? openDrawer() : closeDrawer();
        } 
        // 2. Prioridad 2: Arrastre lento basado en la posición final
        else {
            currentTranslate > -140 ? openDrawer() : closeDrawer();
        }
    }

    // --- Añadir Listeners ---
    // El listener de 'touchmove' ahora es explícitamente no-pasivo.
    document.addEventListener('touchstart', handleDrawerTouchStart, { passive: true });
    document.addEventListener('touchmove', handleDrawerTouchMove, { passive: false });
    document.addEventListener('touchend', handleDrawerTouchEnd, { passive: true });

    // La lógica para los botones y el overlay se mantiene igual, ya que es complementaria.
    const rewindButton = document.querySelector('#rewind-button');
    if (rewindButton) {
        rewindButton.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                document.body.classList.contains('sidebar-is-open') ? closeDrawer() : openDrawer();
            }
        });
    }

    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeDrawer);
    }

    // Ajustar el estado del sidebar si la ventana cambia de tamaño (ej. rotación de dispositivo)
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) { // Si pasamos a escritorio
            document.body.classList.remove('sidebar-is-open');
            sidebar.style.transform = 'none'; // Resetear transform para escritorio
            sidebar.style.transition = ''; // Restaurar transición
        } else { // Si volvemos a móvil
            if (!document.body.classList.contains('sidebar-is-open')) {
                sidebar.style.transform = `translateX(-280px)`;
                currentTranslate = -280;
            }
        }
    });
}