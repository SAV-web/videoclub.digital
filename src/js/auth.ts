/// <reference types="vite/client" />

// =================================================================
//                 EL PORTERO (Autenticación - Tipado y Mejoras)
// =================================================================
// Maneja el inicio de sesión, registro, recordar sesión,
// visualización de contraseña y restablecimiento de contraseña.
// =================================================================

import { getSupabase } from "./api.js";
import { openAuthModal, closeAuthModal, showToast } from "./ui.js";

interface AuthDom {
  vLogin: HTMLElement | null;
  vReg: HTMLElement | null;
  vRecover: HTMLElement | null;
  vReset: HTMLElement | null;
  fLogin: HTMLFormElement | null;
  fReg: HTMLFormElement | null;
  fRecover: HTMLFormElement | null;
  fReset: HTMLFormElement | null;
  btnToReg: HTMLElement | null;
  btnToLog: HTMLElement | null;
  btnToRecover: HTMLElement | null;
  btnRecoverBack: HTMLElement | null;
  btnMagic: HTMLElement | null;
  msg: HTMLElement | null;
}

// Caché de elementos HTML para no buscarlos todo el rato
let domCache: AuthDom | null = null;
const getDom = (): AuthDom => domCache || (domCache = {
  vLogin: document.getElementById("login-view"),
  vReg: document.getElementById("register-view"),
  vRecover: document.getElementById("recover-view"),
  vReset: document.getElementById("reset-password-view"),
  fLogin: document.getElementById("login-form") as HTMLFormElement,
  fReg: document.getElementById("register-form") as HTMLFormElement,
  fRecover: document.getElementById("recover-form") as HTMLFormElement,
  fReset: document.getElementById("reset-password-form") as HTMLFormElement,
  btnToReg: document.getElementById("show-register-view"),
  btnToLog: document.getElementById("show-login-view"),
  btnToRecover: document.getElementById("show-recover-view"),
  btnRecoverBack: document.getElementById("recover-back-to-login"),
  btnMagic: document.getElementById("login-magic-link-btn"),
  msg: document.getElementById("auth-message"),
});

// Muestra u oculta mensajes de texto (Ej: "Contraseña incorrecta")
function setFeedback(text: string | null, type: "error" | "success" = "error"): void {
  const { msg } = getDom();
  if (!msg) return;
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = `auth-message auth-message--${type}`;
}

// Traduce errores informáticos a humano
const translateError = (e: unknown): string => {
  const m = ((e as Record<string, unknown>)?.message as string || "").toLowerCase();
  if (m.includes("invalid")) return "Email o contraseña incorrectos.";
  if (m.includes("registered")) return "Este email ya está registrado.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("weak")) return "La contraseña es muy débil.";
  return import.meta.env.DEV && (e as Error)?.message ? `Error: ${(e as Error).message}` : "Error de acceso.";
};

// Lógica genérica al pulsar el botón "Entrar" o "Registrar"
// Funciones auxiliares de validación e interacción
function validateEmail(email: string): boolean {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
}

function updateFieldValidation(input: HTMLInputElement, isValid: boolean, errorMessage: string): void {
  const container = input.closest(".form-group");
  if (!container) return;
  
  const messageSpan = container.querySelector(".validation-message") as HTMLElement | null;
  
  if (input.value.trim() === "") {
    input.classList.remove("is-valid", "is-invalid");
    if (messageSpan) {
      messageSpan.textContent = "";
      messageSpan.classList.remove("is-valid", "is-invalid");
    }
    return;
  }
  
  if (isValid) {
    input.classList.add("is-valid");
    input.classList.remove("is-invalid");
    if (messageSpan) {
      messageSpan.textContent = "✓ Correcto";
      messageSpan.classList.add("is-valid");
      messageSpan.classList.remove("is-invalid");
    }
  } else {
    input.classList.add("is-invalid");
    input.classList.remove("is-valid");
    if (messageSpan) {
      messageSpan.textContent = errorMessage;
      messageSpan.classList.add("is-invalid");
      messageSpan.classList.remove("is-valid");
    }
  }
}

function setupEmailValidation(input: HTMLInputElement): void {
  const validate = () => {
    const val = input.value.trim();
    if (val === "") {
      updateFieldValidation(input, false, "");
      return;
    }
    const isValid = validateEmail(val);
    updateFieldValidation(input, isValid, "Introduce un correo válido.");
  };

  input.addEventListener("input", validate);
  input.addEventListener("blur", () => {
    input.value = input.value.trim().toLowerCase();
    validate();
  });
}

function setupPasswordValidation(input: HTMLInputElement, minLength: number = 6): void {
  const validate = () => {
    const val = input.value.trim();
    if (val === "") {
      updateFieldValidation(input, false, "");
      return;
    }
    const isValid = val.length >= minLength;
    updateFieldValidation(input, isValid, `Debe tener al menos ${minLength} caracteres.`);
  };

  input.addEventListener("input", validate);
  input.addEventListener("blur", validate);
}

function isFormValid(form: HTMLFormElement): boolean {
  const inputs = form.querySelectorAll("input");
  let allValid = true;
  inputs.forEach(input => {
    if (input.type === "checkbox") return;
    
    if (input.type === "email") {
      const val = input.value.trim();
      const ok = validateEmail(val);
      updateFieldValidation(input, ok, "Introduce un correo válido.");
      if (!ok) allValid = false;
    } else if (input.type === "password") {
      const val = input.value.trim();
      const ok = val.length >= 6;
      updateFieldValidation(input, ok, "Debe tener al menos 6 caracteres.");
      if (!ok) allValid = false;
    }
  });
  return allValid;
}

function setFormDisabledState(form: HTMLFormElement, disabled: boolean): void {
  const elements = form.querySelectorAll("input, button");
  elements.forEach(el => {
    if (disabled) {
      el.setAttribute("disabled", "disabled");
    } else {
      el.removeAttribute("disabled");
    }
  });
}

// Lógica genérica al pulsar el botón "Entrar" o "Registrar"
async function handleSubmit(e: Event, isLogin: boolean): Promise<void> {
  e.preventDefault();
  setFeedback(null);

  const form = e.currentTarget as HTMLFormElement;
  if (!isFormValid(form)) {
    setFeedback("Por favor, corrige los errores en el formulario.");
    return;
  }

  const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  
  const email = (form.querySelector('input[type="email"]') as HTMLInputElement | null)?.value.trim();
  const pass = (form.querySelector('input[type="password"]') as HTMLInputElement | null)?.value.trim();

  if (!email || !pass) {
    setFeedback("Completa todos los campos.");
    return;
  }

  if (isLogin) {
    const rememberCheckbox = document.getElementById("login-remember") as HTMLInputElement | null;
    const remember = rememberCheckbox ? rememberCheckbox.checked : true;
    localStorage.setItem("videoclub:remember_me", remember ? "true" : "false");
  }

  setFormDisabledState(form, true);
  if (btn) btn.classList.add("is-loading");

  try {
    const supabase = await getSupabase();
    const { data, error } = isLogin 
      ? await supabase.auth.signInWithPassword({ email, password: pass })
      : await supabase.auth.signUp({ email, password: pass });

    if (error) {
      setFeedback(translateError(error));
    } else if (!isLogin && data?.user?.identities?.length === 0) {
      setFeedback("Este usuario ya está registrado.", "error");
    } else {
      if (isLogin) {
        showToast("¡Hola de nuevo!", "success");
        closeAuthModal();
      } else {
        setFeedback("¡Registro exitoso! Revisa tu email.", "success");
      }
      form.reset();
      form.querySelectorAll("input").forEach(inp => inp.classList.remove("is-valid", "is-invalid"));
      form.querySelectorAll(".validation-message").forEach(span => {
        span.textContent = "";
        span.classList.remove("is-valid", "is-invalid");
      });
    }
  } catch (err) {
    setFeedback("Error inesperado de conexión.");
  } finally {
    setFormDisabledState(form, false);
    if (btn) btn.classList.remove("is-loading");
  }
}

// Lógica para enviar correo de recuperación de contraseña
async function handleRecoverSubmit(e: Event): Promise<void> {
  e.preventDefault();
  setFeedback(null);

  const form = e.currentTarget as HTMLFormElement;
  if (!isFormValid(form)) {
    setFeedback("Introduce un correo válido.");
    return;
  }

  const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  const email = (form.querySelector('input[type="email"]') as HTMLInputElement | null)?.value.trim();

  if (!email) {
    setFeedback("Introduce tu email.");
    return;
  }

  setFormDisabledState(form, true);
  if (btn) btn.classList.add("is-loading");

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#reset-password`
    });

    if (error) {
      setFeedback(translateError(error));
    } else {
      setFeedback("Enlace de recuperación enviado. Revisa tu correo.", "success");
      form.reset();
      form.querySelectorAll("input").forEach(inp => inp.classList.remove("is-valid", "is-invalid"));
      form.querySelectorAll(".validation-message").forEach(span => {
        span.textContent = "";
        span.classList.remove("is-valid", "is-invalid");
      });
    }
  } catch (err) {
    setFeedback("Error al conectar con el servidor.");
  } finally {
    setFormDisabledState(form, false);
    if (btn) btn.classList.remove("is-loading");
  }
}

// Lógica para guardar la nueva contraseña restablecida
async function handleResetPasswordSubmit(e: Event): Promise<void> {
  e.preventDefault();
  setFeedback(null);

  const form = e.currentTarget as HTMLFormElement;
  if (!isFormValid(form)) {
    setFeedback("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  const newPassword = (form.querySelector('input[type="password"]') as HTMLInputElement | null)?.value.trim();

  if (!newPassword || newPassword.length < 6) {
    setFeedback("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  setFormDisabledState(form, true);
  if (btn) btn.classList.add("is-loading");

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setFeedback(translateError(error));
    } else {
      showToast("Contraseña actualizada con éxito.", "success");
      closeAuthModal();
      form.reset();
      form.querySelectorAll("input").forEach(inp => inp.classList.remove("is-valid", "is-invalid"));
      form.querySelectorAll(".validation-message").forEach(span => {
        span.textContent = "";
        span.classList.remove("is-valid", "is-invalid");
      });
      
      if (window.location.hash) {
        window.location.hash = "";
      }
    }
  } catch (err) {
    setFeedback("Error al actualizar la contraseña.");
  } finally {
    setFormDisabledState(form, false);
    if (btn) btn.classList.remove("is-loading");
  }
}

// Lógica para enviar Magic Link para inicio de sesión sin contraseña
async function handleMagicLinkSubmit(e: Event): Promise<void> {
  e.preventDefault();
  setFeedback(null);

  const btn = e.currentTarget as HTMLButtonElement;
  const form = btn.closest("form") as HTMLFormElement | null;
  if (!form) return;

  const emailInput = form.querySelector('input[type="email"]') as HTMLInputElement | null;
  if (!emailInput) return;

  const email = emailInput.value.trim();
  if (!email) {
    updateFieldValidation(emailInput, false, "Introduce tu email para recibir el enlace.");
    setFeedback("Introduce tu email.");
    return;
  }

  const isEmailValid = validateEmail(email);
  updateFieldValidation(emailInput, isEmailValid, "Introduce un correo válido.");
  if (!isEmailValid) {
    setFeedback("Introduce un correo electrónico válido.");
    return;
  }

  setFormDisabledState(form, true);
  btn.classList.add("is-loading");

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) {
      setFeedback(translateError(error));
    } else {
      setFeedback("Enlace de acceso enviado. Revisa tu correo.", "success");
      form.reset();
      form.querySelectorAll("input").forEach(inp => inp.classList.remove("is-valid", "is-invalid"));
      form.querySelectorAll(".validation-message").forEach(span => {
        span.textContent = "";
        span.classList.remove("is-valid", "is-invalid");
      });
    }
  } catch (err) {
    setFeedback("Error al conectar con el servidor.");
  } finally {
    setFormDisabledState(form, false);
    btn.classList.remove("is-loading");
  }
}

// Alterna visualmente entre las vistas del modal
function toggleView(viewToShow: "login" | "register" | "recover" | "reset"): void {
  const dom = getDom();
  setFeedback(null);

  const views = [dom.vLogin, dom.vReg, dom.vRecover, dom.vReset];
  const activeView = views.find(v => v && !v.hidden);
  const targetView = 
    viewToShow === "login" ? dom.vLogin :
    viewToShow === "register" ? dom.vReg :
    viewToShow === "recover" ? dom.vRecover :
    dom.vReset;

  // Limpiar clases de validación al conmutar vistas
  const inputs = document.querySelectorAll("#auth-modal input");
  inputs.forEach(inp => inp.classList.remove("is-valid", "is-invalid"));
  const spans = document.querySelectorAll("#auth-modal .validation-message");
  spans.forEach(span => {
    span.textContent = "";
    span.classList.remove("is-valid", "is-invalid");
  });

  if (activeView && targetView && activeView !== targetView) {
    // 1. Añadir clase de salida a la vista actual
    activeView.classList.add("auth-view-exiting");
    activeView.classList.remove("auth-view-entering");
    
    // 2. Esperar a que la transición termine (150ms)
    setTimeout(() => {
      activeView.hidden = true;
      activeView.classList.remove("auth-view-exiting");
      
      // 3. Preparar la nueva vista para entrar
      if (targetView) {
        targetView.hidden = false;
        targetView.classList.add("auth-view-entering");
        
        // Forzar un reflujo (reflow) en el navegador
        void targetView.offsetHeight;
        
        // 4. Iniciar la transición de entrada
        targetView.classList.remove("auth-view-entering");
        
        // Foco en el primer input de la nueva vista
        const firstInput = targetView.querySelector("input") as HTMLInputElement | null;
        if (firstInput) {
          requestAnimationFrame(() => firstInput.focus({ preventScroll: true }));
        }
      }
    }, 150);
  } else {
    // Sin vista activa o cambio instantáneo inicial
    views.forEach(v => {
      if (v) {
        v.hidden = v !== targetView;
        v.classList.remove("auth-view-exiting", "auth-view-entering");
      }
    });
    const firstInput = targetView?.querySelector("input") as HTMLInputElement | null;
    if (firstInput) {
      requestAnimationFrame(() => firstInput.focus({ preventScroll: true }));
    }
  }
}

// Muestra la vista de restablecer contraseña (llamado al retornar del correo de recuperación)
export function showResetPasswordView(): void {
  toggleView("reset");
  openAuthModal();
}

// Inicializa todos los formularios y listeners de autenticación
export function initAuthForms(): void {
  const dom = getDom();
  if (!dom.fLogin) return;

  dom.fLogin.addEventListener("submit", e => { void handleSubmit(e, true); });
  dom.fReg.addEventListener("submit", e => { void handleSubmit(e, false); });
  
  if (dom.fRecover) {
    dom.fRecover.addEventListener("submit", e => { void handleRecoverSubmit(e); });
  }
  if (dom.fReset) {
    dom.fReset.addEventListener("submit", e => { void handleResetPasswordSubmit(e); });
  }
  if (dom.btnMagic) {
    dom.btnMagic.addEventListener("click", e => { void handleMagicLinkSubmit(e); });
  }
  
  dom.btnToReg?.addEventListener("click", () => toggleView("register"));
  dom.btnToLog?.addEventListener("click", () => toggleView("login"));
  dom.btnToRecover?.addEventListener("click", () => toggleView("recover"));
  dom.btnRecoverBack?.addEventListener("click", () => toggleView("login"));

  // Configurar validadores interactivos
  const emailInputs = document.querySelectorAll('#auth-modal input[type="email"]');
  emailInputs.forEach(input => setupEmailValidation(input as HTMLInputElement));

  const passwordInputs = document.querySelectorAll('#auth-modal input[type="password"]');
  passwordInputs.forEach(input => setupPasswordValidation(input as HTMLInputElement));

  // Configurar botones de mostrar/ocultar contraseña
  const setupPasswordToggles = () => {
    const wrappers = document.querySelectorAll(".password-wrapper");
    wrappers.forEach(wrapper => {
      const input = wrapper.querySelector('input') as HTMLInputElement | null;
      const toggleBtn = wrapper.querySelector(".password-toggle-btn") as HTMLButtonElement | null;
      if (!input || !toggleBtn) return;
      
      toggleBtn.addEventListener("click", () => {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        toggleBtn.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");
        
        if (isPassword) {
          toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
        } else {
          toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        }
      });
    });
  };
  setupPasswordToggles();
}
