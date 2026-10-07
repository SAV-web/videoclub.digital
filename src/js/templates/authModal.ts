// =================================================================
//        PLANTILLA DIFERIDA (LAZY TEMPLATE): AUTH MODAL
// =================================================================
// Carga diferida del modal de autenticación (Login, Registro, Reset)
// para reducir el peso y tiempo de parseo del documento inicial.
// =================================================================

export const AUTH_MODAL_HTML = `
  <div id="auth-overlay" class="auth-overlay" hidden aria-hidden="true"></div>
  <div id="auth-modal" class="auth-modal" role="dialog" aria-modal="true" hidden aria-labelledby="auth-title"
    tabindex="-1">
    <div class="auth-box">
      <header class="auth-header">
        <h2 id="auth-title" class="auth-logo-modal">
          <span>videoclub</span>.<span>digital</span>
        </h2>
      </header>
      <section id="login-view">
        <h3>Iniciar Sesión</h3>
        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" name="email" autocomplete="username" required />
            <span class="validation-message" aria-live="polite"></span>
          </div>
          <div class="form-group">
            <label for="login-password">Contraseña</label>
            <div class="password-wrapper">
              <input type="password" id="login-password" name="password" autocomplete="current-password" required />
              <button type="button" class="password-toggle-btn" aria-label="Mostrar contraseña">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
                  <use href="#icon-eye"></use>
                </svg>
              </button>
            </div>
            <span class="validation-message" aria-live="polite"></span>
            <button type="button" id="show-recover-view" class="auth-forgot-link">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <div class="form-group form-group--checkbox">
            <input type="checkbox" id="login-remember" checked />
            <label for="login-remember">Mantener sesión iniciada</label>
          </div>
          <button type="submit" class="auth-button">Acceder</button>
          <div class="auth-divider"><span>o también</span></div>
          <button type="button" id="login-magic-link-btn" class="auth-button auth-button--secondary">
            Acceso rápido sin contraseña
          </button>
        </form>
        <div class="auth-toggle-text">
          ¿No tienes cuenta?
          <button type="button" id="show-register-view">Regístrate</button>
        </div>
      </section>
      <section id="register-view" hidden>
        <h3>Crear Cuenta</h3>
        <form id="register-form">
          <div class="form-group">
            <label for="register-email">Email</label>
            <input type="email" id="register-email" name="email" autocomplete="email" required />
            <span class="validation-message" aria-live="polite"></span>
            <small>Te enviaremos confirmación.</small>
          </div>
          <div class="form-group">
            <label for="register-password">Contraseña</label>
            <div class="password-wrapper">
              <input type="password" id="register-password" name="password" autocomplete="new-password" required
                minlength="8" />
              <button type="button" class="password-toggle-btn" aria-label="Mostrar contraseña">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
                  <use href="#icon-eye"></use>
                </svg>
              </button>
            </div>
            <div class="password-strength-meter" id="register-password-strength" hidden>
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
            <small>Mínimo 8 caracteres (según estándar NIST).</small>
          </div>
          <button type="submit" class="auth-button">Crear Cuenta</button>
        </form>
        <div class="auth-toggle-text">
          ¿Ya tienes cuenta?
          <button type="button" id="show-login-view">Inicia sesión</button>
        </div>
      </section>
      <section id="recover-view" hidden>
        <h3>Recuperar Contraseña</h3>
        <form id="recover-form">
          <div class="form-group">
            <label for="recover-email">Email</label>
            <input type="email" id="recover-email" name="email" autocomplete="email" required />
            <span class="validation-message" aria-live="polite"></span>
            <small>Te enviaremos un enlace para restablecer tu contraseña.</small>
          </div>
          <button type="submit" class="auth-button">Enviar enlace</button>
        </form>
        <div class="auth-toggle-text">
          <button type="button" id="recover-back-to-login">
            Volver a iniciar sesión
          </button>
        </div>
      </section>
      <section id="reset-password-view" hidden>
        <h3>Nueva Contraseña</h3>
        <form id="reset-password-form">
          <div class="form-group">
            <label for="new-password">Nueva Contraseña</label>
            <div class="password-wrapper">
              <input type="password" id="new-password" name="password" autocomplete="new-password" required
                minlength="8" />
              <button type="button" class="password-toggle-btn" aria-label="Mostrar contraseña">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" class="eye-icon">
                  <use href="#icon-eye"></use>
                </svg>
              </button>
            </div>
            <div class="password-strength-meter" id="reset-password-strength" hidden>
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
            <small>Mínimo 8 caracteres (según estándar NIST).</small>
          </div>
          <button type="submit" class="auth-button">
            Guardar Contraseña
          </button>
        </form>
      </section>
      <div id="auth-message" class="auth-message" hidden role="alert"></div>
    </div>
  </div>
`;

/**
 * Monta el modal de autenticación en el DOM bajo demanda si aún no existe.
 */
export function ensureAuthModalMounted(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let modal = document.getElementById("auth-modal");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", AUTH_MODAL_HTML);
    modal = document.getElementById("auth-modal");
  }
  return modal;
}
