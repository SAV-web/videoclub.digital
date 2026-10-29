// =================================================================
//        PLANTILLA DIFERIDA (LAZY TEMPLATE): PROFILE MODAL
// =================================================================
// Carga diferida del panel de usuario, estadísticas de colección,
// cambio de contraseña y zona de peligro, reduciendo ~10 KB del documento principal.
// =================================================================

export const PROFILE_MODAL_HTML = `
  <div id="profile-overlay" class="profile-overlay" hidden aria-hidden="true"></div>
  <div id="profile-modal" class="profile-modal" role="dialog" aria-modal="true" hidden
    aria-labelledby="profile-modal-title" tabindex="-1">
    <div class="profile-box">
      <header class="profile-header">
        <div class="profile-user-summary">
          <div class="profile-avatar-large" id="profile-avatar-large" aria-hidden="true">
            U
          </div>
          <div class="profile-user-meta">
            <h2 id="profile-modal-title" class="profile-email">
              usuario@email.com
            </h2>
            <span class="profile-badge">Miembro de videoclub.digital</span>
          </div>
        </div>
        <button type="button" id="profile-modal-close" class="profile-close-btn" aria-label="Cerrar panel de perfil">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <use href="#icon-close"></use>
          </svg>
        </button>
      </header>

      <div class="profile-content-scroll">
        <!-- 1. Estadísticas de Videoteca Personal -->
        <section class="profile-section profile-section--stats" aria-labelledby="heading-user-stats">
          <h3 id="heading-user-stats" class="profile-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M7 8h10" />
              <path d="M7 12h10" />
              <path d="M7 16h10" />
            </svg>
            Mi Videoteca Personal
          </h3>

          <div class="profile-stats-grid">
            <div class="profile-stat-card">
              <span class="stat-card-label">En Watchlist</span>
              <span id="profile-stat-watchlist-count" class="stat-card-number">0</span>
              <button type="button" id="profile-btn-explore-watchlist" class="stat-card-action">
                Ver pendientes &rarr;
              </button>
            </div>

            <div class="profile-stat-card">
              <span class="stat-card-label">Películas Votadas</span>
              <span id="profile-stat-rated-count" class="stat-card-number">0</span>
              <button type="button" id="profile-btn-explore-rated" class="stat-card-action">
                Ver votos &rarr;
              </button>
            </div>

            <div class="profile-stat-card profile-stat-card--stars">
              <span class="stat-card-label">Promedio de Valoración</span>
              <div id="profile-stat-average-stars" class="star-rating-container has-user-rating profile-stars-container"
                aria-label="Promedio de estrellas">
                <svg class="star-icon">
                  <use class="star-icon-path star-icon-path--empty" href="#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="#icon-star"></use>
                </svg>
                <svg class="star-icon">
                  <use class="star-icon-path star-icon-path--empty" href="#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="#icon-star"></use>
                </svg>
                <svg class="star-icon">
                  <use class="star-icon-path star-icon-path--empty" href="#icon-star"></use>
                  <use class="star-icon-path star-icon-path--filled" href="#icon-star"></use>
                </svg>
              </div>
            </div>
          </div>

          <div class="profile-breakdown-card">
            <h4 class="profile-breakdown-title">
              Distribución por Calificación
            </h4>
            <div class="profile-breakdown-list" id="profile-breakdown-container">
              <!-- Generado dinámicamente por profile.ts -->
            </div>
          </div>
        </section>

        <!-- 2. Seguridad y Cuenta -->
        <section class="profile-section" aria-labelledby="heading-user-security">
          <h3 id="heading-user-security" class="profile-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Seguridad y Contraseña
          </h3>
          <form id="profile-password-form" class="profile-password-form">
            <div class="form-group">
              <label for="profile-new-password">Nueva Contraseña</label>
              <div class="password-wrapper">
                <input type="password" id="profile-new-password" name="newPassword" autocomplete="new-password" required
                  minlength="8" placeholder="Mínimo 8 caracteres" />
                <button type="button" class="password-toggle-btn" id="profile-password-toggle"
                  aria-label="Mostrar contraseña" tabindex="-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
                    <use href="#icon-eye"></use>
                  </svg>
                </button>
              </div>
              <div class="password-strength-meter" id="profile-password-strength" hidden>
                <div class="strength-bars" role="progressbar" aria-label="Seguridad de la contraseña" aria-valuenow="0"
                  aria-valuemin="0" aria-valuemax="4">
                  <div class="strength-bar"></div>
                  <div class="strength-bar"></div>
                  <div class="strength-bar"></div>
                  <div class="strength-bar"></div>
                </div>
                <span class="strength-label" aria-live="polite"></span>
              </div>
              <span class="validation-message" aria-live="polite"></span>
            </div>
            <button type="submit" id="profile-password-submit-btn" class="auth-button">
              Actualizar Contraseña
            </button>
          </form>
          <div id="profile-security-message" class="auth-message" hidden role="alert"></div>
        </section>

        <!-- 3. Almacenamiento Local-First y Datos -->
        <section class="profile-section" aria-labelledby="heading-user-data">
          <h3 id="heading-user-data" class="profile-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            Datos y Sincronización
          </h3>
          <div class="profile-data-actions">
            <div class="profile-sync-status">
              <span class="sync-dot" id="profile-sync-dot"></span>
              <span id="profile-sync-text">Sincronizado con la nube</span>
            </div>
            <div class="profile-buttons-row">
              <button type="button" id="profile-btn-force-sync" class="profile-secondary-btn">
                Sincronizar Ahora
              </button>
              <button type="button" id="profile-btn-export-csv" class="profile-secondary-btn">
                Exportar mi colección (CSV)
              </button>
              <button type="button" id="profile-btn-import-csv" class="profile-secondary-btn">
                Importar colección (CSV)
              </button>
              <input type="file" id="profile-csv-file-input" accept=".csv,text/csv" hidden aria-hidden="true" />
            </div>
          </div>
        </section>
        <!-- 4. Zona de Peligro (Baja de Usuario) -->
        <section id="profile-danger-zone" class="profile-section profile-section--danger" hidden
          aria-labelledby="heading-user-danger">
          <div class="profile-delete-confirm-card">
            <div class="profile-delete-confirm-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h4 id="heading-user-danger" class="profile-delete-confirm-title">
                ¿Eliminar tu cuenta definitivamente?
              </h4>
            </div>
            <p class="profile-delete-warning">
              Esta acción es <strong>definitiva e irreversible</strong>. Se suprimirán permanentemente todas tus
              valoraciones, tu lista de seguimiento (watchlist) y tu cuenta de acceso.
            </p>
            <p class="profile-delete-tip">
              Te aconsejamos descargar previamente tu videoteca pulsando en <strong>Exportar mi colección (CSV)</strong>
              si deseas guardar una copia de tus datos.
            </p>
            <div class="profile-delete-actions">
              <button type="button" id="profile-btn-cancel-delete" class="profile-secondary-btn">
                Cancelar
              </button>
              <button type="button" id="profile-btn-confirm-delete" class="profile-danger-confirm-btn">
                Sí, eliminar mi cuenta
              </button>
            </div>
            <div id="profile-delete-message" class="auth-message auth-message--error" hidden role="alert"></div>
          </div>
        </section>
      </div>

      <footer class="profile-box-footer">
        <button type="button" id="profile-btn-delete-account" class="profile-delete-btn"
          title="Darse de baja y suprimir todos los datos">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <use href="#icon-trash"></use>
          </svg>
          Eliminar Cuenta
        </button>
        <button type="button" id="profile-btn-logout" class="profile-logout-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <use href="#icon-logout"></use>
          </svg>
          Cerrar Sesión
        </button>
      </footer>
    </div>
  </div>
`;

/**
 * Monta el modal de perfil de usuario en el DOM bajo demanda si aún no existe.
 */
export function ensureProfileModalMounted(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let modal = document.getElementById("profile-modal");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", PROFILE_MODAL_HTML);
    modal = document.getElementById("profile-modal");
  }
  return modal;
}
