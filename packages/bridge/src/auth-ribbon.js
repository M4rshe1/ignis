import { authService } from "@ignis/services";

const AUTH_RIBBON_FIRST_CLASS = "ignis-auth-ribbon-first";

let loggingOut = false;

function openAuthAdmin() {
  window.__ignis?.showAuthAdmin?.();
}

async function signOut() {
  if (loggingOut) {
    return;
  }

  loggingOut = true;

  try {
    await authService.logout();
    window.location.reload();
  } catch {
    loggingOut = false;
  }
}

function addAuthRibbonIcon(plugin, icon, title, callback, isFirst) {
  const el = plugin.addRibbonIcon(icon, title, callback);
  el.addClass("ignis-auth-ribbon");

  if (isFirst) {
    el.addClass(AUTH_RIBBON_FIRST_CLASS);
  }

  return el;
}

export function initAuthRibbon(plugin) {
  const status = authService.getStatusSync();

  if (!status?.enabled) {
    return;
  }

  const me = authService.getMeSync();

  if (!me) {
    return;
  }

  const displayName = me.displayName || me.username || "";
  const isSuperadmin = me.globalRole === "superadmin";
  let firstAuthIcon = true;

  if (isSuperadmin) {
    addAuthRibbonIcon(
      plugin,
      "shield",
      "Access control",
      openAuthAdmin,
      firstAuthIcon,
    );
    firstAuthIcon = false;

    plugin.addCommand({
      id: "open-access-control",
      name: "Open access control",
      callback: openAuthAdmin,
    });
  }

  const signOutTitle = displayName ? `Sign out (${displayName})` : "Sign out";

  addAuthRibbonIcon(plugin, "log-out", signOutTitle, signOut, firstAuthIcon);

  plugin.addCommand({
    id: "sign-out",
    name: "Sign out",
    callback: signOut,
  });
}
