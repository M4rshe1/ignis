// Current auth session snapshot for plugins and DataviewJS.
//
// Populated during boot from /api/auth/status and /api/auth/me. Does not
// include the session cookie itself.

import { authService } from "@ignis/services";

let sessionSnapshot = {
  enabled: false,
  mode: "none",
  authenticated: false,
  user: null,
};

export function refreshSession() {
  const status = authService.getStatusSync();

  if (!status?.enabled) {
    sessionSnapshot = {
      enabled: false,
      mode: status?.mode || "none",
      authenticated: false,
      user: null,
    };

    return sessionSnapshot;
  }

  const user = authService.getMeSync();

  sessionSnapshot = {
    enabled: true,
    mode: status.mode,
    authenticated: user !== null,
    user,
  };

  return sessionSnapshot;
}

export function getSession() {
  return sessionSnapshot;
}
