/* src/js/auth.js */

import { supabase } from "./api.js";
import { closeAuthModal, showToast } from "./ui.js";

const dom = {
  loginView: document.getElementById("login-view"),
  registerView: document.getElementById("register-view"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  showRegisterBtn: document.getElementById("show-register-view"),
  showLoginBtn: document.getElementById("show-login-view"),
  authMessage: document.getElementById("auth-message"),
};

function showMessage(text, type = "error") {
  if (!dom.authMessage) return;
  dom.authMessage.textContent = text;
  dom.authMessage.className = `auth-message auth-message--${type}`;
  dom.authMessage.style.display = "block";
}

function clearMessage() {
  if (!dom.authMessage) return;
  dom.authMessage.style.display = "none";
  dom.authMessage.textContent = "";
}

/**
 * Gestiona el estado de carga del botón para evitar dobles envíos.
 * @param {HTMLButtonElement} btn - El botón de submit.
 * @param {boolean} isLoading - Estado de carga.
 * @param {string} originalText - Texto original del botón.
 */
function setButtonLoading(btn, isLoading, originalText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Procesando..." : originalText;
  btn.style.cursor = isLoading ? "wait" : "pointer";
  btn.style.opacity = isLoading ? "0.7" : "1";
}

async function handleRegister(e) {
  e.preventDefault();
  clearMessage();

  const form = dom.registerForm;
  const email = form.elements["register-email"].value.trim();
  const password = form.elements["register-password"].value.trim();
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;

  // 1. Validación Previa (Ahorra llamada a API)
  if (!email || !password) {
    showMessage("Por favor, completa todos los campos.", "error");
    return;
  }

  // 2. Bloqueo de UI
  setButtonLoading(submitBtn, true, originalBtnText);

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      showMessage(`Error en el registro: ${error.message}`);
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      showMessage("Este usuario ya está registrado.", "error");
    } else if (data.user) {
      showMessage("¡Registro exitoso! Revisa tu email para confirmar tu cuenta.", "success");
      form.reset();
    }
  } catch (err) {
    showMessage("Ocurrió un error inesperado.", "error");
    console.error(err);
  } finally {
    // 3. Restauración de UI (Siempre se ejecuta)
    setButtonLoading(submitBtn, false, originalBtnText);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  clearMessage();

  const form = dom.loginForm;
  const email = form.elements["login-email"].value.trim();
  const password = form.elements["login-password"].value.trim();
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;

  // 1. Validación Previa
  if (!email || !password) {
    showMessage("Introduce tu email y contraseña.", "error");
    return;
  }

  // 2. Bloqueo de UI
  setButtonLoading(submitBtn, true, originalBtnText);

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes("Invalid login")) {
        showMessage("Email o contraseña incorrectos.");
      } else if (error.message.includes("not confirmed")) {
        showMessage("Por favor, confirma tu email antes de iniciar sesión.");
      } else {
        showMessage(`Error: ${error.message}`);
      }
    } else {
      // Éxito
      showToast("¡Hola de nuevo! Sesión iniciada.", "success");
      closeAuthModal();
      form.reset();
    }
  } catch (err) {
    showMessage("Error de conexión al iniciar sesión.", "error");
    console.error(err);
  } finally {
    // 3. Restauración de UI
    setButtonLoading(submitBtn, false, originalBtnText);
  }
}

export function initAuthForms() {
  if (!dom.loginForm) return;

  dom.loginForm.addEventListener("submit", handleLogin);
  dom.registerForm.addEventListener("submit", handleRegister);

  dom.showRegisterBtn.addEventListener("click", () => {
    clearMessage();
    dom.loginView.style.display = "none";
    dom.registerView.style.display = "block";
    // Foco UX: Llevar al usuario al primer campo
    const emailInput = dom.registerForm.elements["register-email"];
    if (emailInput) setTimeout(() => emailInput.focus(), 50);
  });

  dom.showLoginBtn.addEventListener("click", () => {
    clearMessage();
    dom.registerView.style.display = "none";
    dom.loginView.style.display = "block";
    // Foco UX
    const emailInput = dom.loginForm.elements["login-email"];
    if (emailInput) setTimeout(() => emailInput.focus(), 50);
  });
}