import { vaultService } from "@ignis/services";
import { authService } from "@ignis/services";
import InsecureContextNotice from "./components/layout/InsecureContextNotice.svelte";
import AdminLauncher from "./components/layout/AdminLauncher.svelte";

let adminLauncher = null;
let authAdminOpen = false;

function showAuthAdmin() {
  if (authAdminOpen || !window.IgnisUI?.AuthAdmin) {
    return;
  }

  authAdminOpen = true;

  const panel = new window.IgnisUI.AuthAdmin({
    target: document.body,
  });

  panel.$on("close", () => {
    authAdminOpen = false;
    panel.$destroy();
  });
}

function mountSessionBar(me) {
  if (document.querySelector(".session-bar")) {
    return;
  }

  if (adminLauncher) {
    try {
      adminLauncher.$destroy();
    } catch {
      // already destroyed
    }

    adminLauncher = null;
  }

  adminLauncher = new AdminLauncher({
    target: document.body,
    props: {
      displayName: me.displayName || me.username || "",
      isSuperadmin: me.globalRole === "superadmin",
    },
  });

  adminLauncher.$on("open", showAuthAdmin);
}

async function ensureSessionBar() {
  try {
    const status = await fetch("/api/auth/status", { credentials: "same-origin" }).then(
      (r) => (r.ok ? r.json() : { enabled: false }),
    );

    if (!status.enabled) {
      return;
    }

    const me = await authService.me();

    if (me) {
      mountSessionBar(me);
    }
  } catch {
    // Auth unavailable or not logged in.
  }
}

function startSessionBarWatch() {
  ensureSessionBar();

  // Obsidian mounts late and can sit above early fixed UI; retry after load.
  window.addEventListener(
    "load",
    () => {
      setTimeout(ensureSessionBar, 500);
      setTimeout(ensureSessionBar, 3000);
    },
    { once: true },
  );

  const ready = window.__ignisBootReady;

  if (ready && typeof ready.then === "function") {
    ready.finally(() => setTimeout(ensureSessionBar, 500));
  }
}

function showVaultManager() {
  if (document.querySelector(".vault-manager-overlay")) return;

  new window.IgnisUI.VaultManager({
    target: document.body,
    props: { vaultService },
  });
}

function showMessageDialog(title, message) {
  return new Promise((resolve) => {
    const dialog = new window.IgnisUI.MessageDialog({
      target: document.body,
      props: { title, message },
    });

    dialog.$on("confirm", () => {
      dialog.$destroy();
      resolve();
    });
  });
}

function showConfirmDialog(title, message, description, confirmText = "OK") {
  return new Promise((resolve) => {
    const dialog = new window.IgnisUI.ConfirmDialog({
      target: document.body,
      props: { title, message, description, confirmText },
    });

    dialog.$on("confirm", () => {
      dialog.$destroy();
      resolve(true);
    });

    dialog.$on("cancel", () => {
      dialog.$destroy();
      resolve(false);
    });
  });
}

function showPromptDialog(
  title,
  label,
  placeholder = "",
  value = "",
  confirmText = "OK",
) {
  return new Promise((resolve) => {
    const dialog = new window.IgnisUI.PromptDialog({
      target: document.body,
      props: { title, label, placeholder, value, confirmText },
    });

    dialog.$on("confirm", (event) => {
      dialog.$destroy();
      resolve(event.detail);
    });

    dialog.$on("cancel", () => {
      dialog.$destroy();
      resolve(null);
    });
  });
}

if (typeof window !== "undefined" && window.__ignis_registerUI) {
  window.__ignis_registerUI({
    showVaultManager,
    showAuthAdmin,
    showMessageDialog,
    showConfirmDialog,
    showPromptDialog,
  });
} else if (typeof window !== "undefined") {
  console.warn(
    "[ignis] __ignis_registerUI not available; UI handlers not registered",
  );
}

if (typeof window !== "undefined") {
  const runSessionBar = () => startSessionBarWatch();

  if (document.body) {
    runSessionBar();
  } else {
    window.addEventListener("DOMContentLoaded", runSessionBar, {
      once: true,
    });
  }
}

// On a non-secure context the browser gates certain APIs causing certain features to break.
// Show a notice about the degraded experience and how to fix it.
function showInsecureContextNotice() {
  if (window.isSecureContext) {
    return;
  }

  if (document.getElementById("ignis-insecure-banner")) {
    return;
  }

  const notice = new InsecureContextNotice({ target: document.body });
  notice.$on("dismiss", () => notice.$destroy());
}

if (typeof window !== "undefined") {
  if (document.body) {
    showInsecureContextNotice();
  } else {
    window.addEventListener("DOMContentLoaded", showInsecureContextNotice, {
      once: true,
    });
  }
}
