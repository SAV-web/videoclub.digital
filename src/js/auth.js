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
  dom.authMessage.textContent = text;
  dom.authMessage.className = `auth-message auth-message--${type}`;
  dom.authMessage.style.display = "block";
}

function clearMessage() {
  dom.authMessage.style.display = "none";
  dom.authMessage.textContent = "";
}

async function handleRegister(e) {
  e.preventDefault();
  clearMessage();
  const email = dom.registerForm.elements["register-email"].value;
  const password = dom.registerForm.elements["register-password"].value;

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    showMessage(`Error en el registro: ${error.message}`);
  } else if (
    data.user &&
    data.user.identities &&
    data.user.identities.length === 0
  ) {
    showMessage("Error: Este usuario ya existe.", "error");
  } else if (data.user) {
    // Mantenemos el mensaje inline para asegurar que leen "confirmar cuenta"
    showMessage(
      "¡Registro exitoso! Revisa tu email para confirmar tu cuenta.",
      "success"
    );
    dom.registerForm.reset();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  clearMessage();
  const email = dom.loginForm.elements["login-email"].value;
  const password = dom.loginForm.elements["login-password"].value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message === "Invalid login credentials") {
      showMessage("Email o contraseña incorrectos.");
    } else if (error.message === "Email not confirmed") {
      showMessage("Por favor, confirma tu email antes de iniciar sesión.");
    } else {
      showMessage(`Error: ${error.message}`);
    }
  } else {
    // ✨ MEJORA UX: Feedback explícito de éxito
    showToast("¡Hola de nuevo! Sesión iniciada.", "success");
    
    closeAuthModal();
    dom.loginForm.reset();
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
    dom.registerForm.elements["register-email"].focus();
  });

  dom.showLoginBtn.addEventListener("click", () => {
    clearMessage();
    dom.registerView.style.display = "none";
    dom.loginView.style.display = "block";
    dom.loginForm.elements["login-email"].focus();
  });
}