// Login gate shown during boot when the server requires authentication and the
// current request has no valid session. Rendered as a self-contained DOM
// overlay so it works at the synchronous boot point, before Obsidian's scripts
// (and the Svelte UI bundle's later hooks) are guaranteed to be available.

import { authService } from "@ignis/services";

// Returns true if auth is enabled and the user is not authenticated.
export function authRequired() {
  const status = authService.getStatusSync();

  if (!status || !status.enabled) {
    return false;
  }

  return authService.getMeSync() === null;
}

function styleEl(el, styles) {
  Object.assign(el.style, styles);
}

export function showLoginOverlay() {
  if (document.querySelector(".ignis-login-overlay")) {
    return;
  }

  // Hide the boot splash so the login form is visible immediately.
  const splash = document.getElementById("ignis-status");

  if (splash) {
    splash.style.display = "none";
  }

  const overlay = document.createElement("div");
  overlay.className = "ignis-login-overlay";
  styleEl(overlay, {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1e1e1e",
    color: "#dcddde",
    zIndex: "2147483647",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  });

  const card = document.createElement("form");
  styleEl(card, {
    width: "320px",
    maxWidth: "90vw",
    padding: "32px",
    background: "#262626",
    borderRadius: "12px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  });

  const title = document.createElement("h1");
  title.textContent = "Sign in to Ignis";
  styleEl(title, {
    margin: "0 0 6px",
    fontSize: "20px",
    fontWeight: "600",
    textAlign: "center",
  });

  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.placeholder = "Username";
  userInput.autocomplete = "username";
  userInput.autofocus = true;

  const passInput = document.createElement("input");
  passInput.type = "password";
  passInput.placeholder = "Password";
  passInput.autocomplete = "current-password";

  for (const input of [userInput, passInput]) {
    styleEl(input, {
      padding: "10px 12px",
      borderRadius: "6px",
      border: "1px solid #3a3a3a",
      background: "#1e1e1e",
      color: "#dcddde",
      fontSize: "14px",
      outline: "none",
    });
  }

  const error = document.createElement("div");
  styleEl(error, {
    color: "#ff6b6b",
    fontSize: "13px",
    minHeight: "16px",
    textAlign: "center",
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Sign in";
  styleEl(submit, {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  });

  card.append(title, userInput, passInput, error, submit);
  overlay.append(card);
  document.body.append(overlay);

  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Signing in...";

    try {
      await authService.login(userInput.value, passInput.value);
      // Reload so the full boot sequence re-runs with the new session cookie.
      window.location.reload();
    } catch (err) {
      error.textContent =
        err && err.status === 401
          ? "Invalid username or password"
          : "Sign-in failed. Please try again.";
      submit.disabled = false;
      submit.textContent = "Sign in";
      passInput.value = "";
      passInput.focus();
    }
  });
}
