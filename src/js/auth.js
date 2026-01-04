/* src/js/auth.js */
import { supabase } from "./api.js";
import { closeAuthModal, showToast } from "./ui.js";

// Referencias DOM (Lazy getter para evitar errores de carga)
const getDom = () => ({
  loginView: document.getElementById("login-view"),
  registerView: document.getElementById("register-view"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  showRegisterBtn: document.getElementById("show-register-view"),
  showLoginBtn: document.getElementById("show-login-view"),
  authMessage: document.getElementById("auth-message"),
});

// =================================================================
//          HELPERS DE UI Y ERRORES
// =================================================================

function setFeedback(message, type = "error") {
  const { authMessage } = getDom();
  if (!authMessage) return;
  
  if (!message) {
    authMessage.style.display = "none";
    authMessage.textContent = "";
    return;
  }

  authMessage.textContent = message;
  authMessage.className = `auth-message auth-message--${type}`;
  authMessage.style.display = "block";
}

/**
 * Traduce errores comunes de Supabase a Español
 */
function getFriendlyErrorMessage(error) {
  const msg = error.message.toLowerCase();
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) return "Email o contraseña incorrectos.";
  if (msg.includes("user already registered")) return "Este email ya está registrado.";
  if (msg.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (msg.includes("not confirmed")) return "Por favor, confirma tu email primero.";
  if (msg.includes("weak password")) return "La contraseña es muy débil.";
  return `Error: ${error.message}`; // Fallback
}

/**
 * Función genérica para manejar el envío de formularios de autenticación.
 */
async function handleAuthSubmit(event, authAction) {
  event.preventDefault();
  setFeedback(null); // Limpiar mensajes previos

  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;
  
  // 1. Extracción de datos (CORREGIDO: Usamos selectores CSS en lugar de FormData)
  // Detectamos si es el formulario de login para buscar los IDs correctos
  const isLogin = form.id === "login-form";
  
  const emailInput = form.querySelector(isLogin ? '#login-email' : '#register-email');
  const passwordInput = form.querySelector(isLogin ? '#login-password' : '#register-password');

  const email = emailInput?.value.trim();
  const password = passwordInput?.value.trim();

  // 2. Validación
  if (!email || !password) {
    setFeedback("Por favor, completa todos los campos.");
    // Añadir foco visual al campo vacío para ayudar al usuario
    if (!email) emailInput?.focus();
    else if (!password) passwordInput?.focus();
    return;
  }

  // 3. Bloqueo UI
  submitBtn.disabled = true;
  submitBtn.textContent = "Procesando...";
  submitBtn.style.opacity = "0.7";

  try {
    // 4. Ejecución de la lógica específica
    await authAction(email, password, form);
  } catch (err) {
    console.error(err);
    setFeedback("Ocurrió un error inesperado de conexión.");
  } finally {
    // 5. Restauración UI
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      submitBtn.style.opacity = "1";
    }
  }
}

// =================================================================
//          LÓGICA ESPECÍFICA (LOGIN / REGISTER)
// =================================================================

const actions = {
  login: async (email, password, form) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setFeedback(getFriendlyErrorMessage(error));
    } else {
      showToast("¡Hola de nuevo! Sesión iniciada.", "success");
      closeAuthModal();
      form.reset();
    }
  },

  register: async (email, password, form) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setFeedback(getFriendlyErrorMessage(error));
    } else if (data.user && data.user.identities?.length === 0) {
      setFeedback("Este usuario ya está registrado.", "error");
    } else if (data.user) {
      setFeedback("¡Registro exitoso! Revisa tu email para confirmar.", "success");
      form.reset();
    }
  }
};

// =================================================================
//          INICIALIZACIÓN Y EVENTOS
// =================================================================

function toggleView(showRegister) {
  const dom = getDom();
  setFeedback(null);
  
  if (showRegister) {
    dom.loginView.style.display = "none";
    dom.registerView.style.display = "block";
    // Pequeño delay para asegurar que el cambio de display ha ocurrido antes del foco
    setTimeout(() => dom.registerForm.querySelector('input')?.focus(), 50);
  } else {
    dom.registerView.style.display = "none";
    dom.loginView.style.display = "block";
    setTimeout(() => dom.loginForm.querySelector('input')?.focus(), 50);
  }
}

export function initAuthForms() {
  const dom = getDom();
  // Si no existe el formulario en esta página, no hacemos nada (evita errores)
  if (!dom.loginForm) return;

  // Listeners de Submit usando el wrapper genérico
  dom.loginForm.addEventListener("submit", (e) => handleAuthSubmit(e, actions.login));
  dom.registerForm.addEventListener("submit", (e) => handleAuthSubmit(e, actions.register));

  // Listeners de Navegación (Toggle entre Login y Registro)
  dom.showRegisterBtn.addEventListener("click", () => toggleView(true));
  dom.showLoginBtn.addEventListener("click", () => toggleView(false));
}