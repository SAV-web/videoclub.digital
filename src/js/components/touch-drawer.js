export function initTouchDrawer() {
    let touchStartX = 0;
    let isDragging = false;
    let currentTranslate = -280; // Ancho del sidebar

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return; // Asegurarse de que el sidebar existe

    // Solo aplicar transformaciones si estamos en vista móvil.
    if (window.innerWidth <= 768) {
        if (document.body.classList.contains('sidebar-is-open')) {
            currentTranslate = 0;
            sidebar.style.transform = 'translateX(0px)';
        } else {
            currentTranslate = -280;
            sidebar.style.transform = 'translateX(-280px)';
        }
    } else {
        // En escritorio, nos aseguramos de que no haya transformaciones aplicadas por JS.
        sidebar.style.transform = ''; // Usar '' para que la hoja de estilos tome el control.
    }

    function handleDrawerTouchStart(e) {
        // Solo activar si el toque empieza en los primeros 20px del borde izquierdo
        // y si no estamos en modo escritorio (min-width: 769px)
        if (window.innerWidth <= 768 && e.touches[0].clientX < 20) {
            touchStartX = e.touches[0].clientX;
            isDragging = true;
            sidebar.style.transition = 'none'; // Deshabilitar transición durante el drag
        }
    }

    function handleDrawerTouchMove(e) {
        if (!isDragging) return;
        
        const currentX = e.touches[0].clientX;
        const diff = currentX - touchStartX;
        
        // Calcular nueva posición (restringir entre -280 y 0)
        currentTranslate = Math.max(-280, Math.min(0, currentTranslate + diff));
        sidebar.style.transform = `translateX(${currentTranslate}px)`;
        
        touchStartX = currentX;
    }

    function handleDrawerTouchEnd() {
        if (!isDragging) return;
        isDragging = false;
        
        sidebar.style.transition = ''; // Restaurar transición
        
        // Si se arrastró más de la mitad, abrir completamente; si no, cerrar
        if (currentTranslate > -140) {
            document.body.classList.add('sidebar-is-open');
            currentTranslate = 0;
        } else {
            document.body.classList.remove('sidebar-is-open');
            currentTranslate = -280;
        }
        sidebar.style.transform = `translateX(${currentTranslate}px)`; // Asegurar posición final
    }

    // Aplicar listeners
    document.addEventListener('touchstart', handleDrawerTouchStart, { passive: true });
    document.addEventListener('touchmove', handleDrawerTouchMove, { passive: true });
    document.addEventListener('touchend', handleDrawerTouchEnd, { passive: true });

    // También necesitamos un listener para el botón de toggle existente
    const rewindButton = document.querySelector('#rewind-button');
    if (rewindButton) {
        rewindButton.addEventListener('click', () => {
            if (window.innerWidth <= 768) { // Solo en móvil
                if (document.body.classList.contains('sidebar-is-open')) {
                    document.body.classList.remove('sidebar-is-open');
                    currentTranslate = -280;
                } else {
                    document.body.classList.add('sidebar-is-open');
                    currentTranslate = 0;
                }
                sidebar.style.transform = `translateX(${currentTranslate}px)`;
            }
            // La lógica de escritorio se mantiene en main.js o sidebar.js
        });
    }

    // Listener para cerrar el sidebar si se hace clic fuera de él en móvil
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (window.innerWidth <= 768 && document.body.classList.contains('sidebar-is-open')) {
                document.body.classList.remove('sidebar-is-open');
                currentTranslate = -280;
                sidebar.style.transform = `translateX(${currentTranslate}px)`;
            }
        });
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