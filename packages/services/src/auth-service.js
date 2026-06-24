const API_BASE = "/api/auth";

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { credentials: "same-origin", ...options });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const authService = {
  // Whether the server has auth enabled. Synchronous so the shim can branch
  // during its blocking boot sequence.
  getStatusSync() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", API_BASE + "/status", false);
      xhr.send();

      if (xhr.status === 200) {
        return JSON.parse(xhr.responseText);
      }
    } catch {
      // Treat an unreachable status endpoint as auth-disabled.
    }

    return { enabled: false, mode: "none" };
  },

  // Returns the current user, or null when not authenticated (401).
  getMeSync() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", API_BASE + "/me", false);
      xhr.send();

      if (xhr.status === 200) {
        return JSON.parse(xhr.responseText);
      }
    } catch {
      // fall through
    }

    return null;
  },

  async me() {
    try {
      return await fetchJson(API_BASE + "/me");
    } catch (e) {
      if (e.status === 401) {
        return null;
      }

      throw e;
    }
  },

  async login(username, password) {
    return fetchJson(API_BASE + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return fetchJson(API_BASE + "/logout", { method: "POST" });
  },

  // --- Admin API (superadmin only) ----------------------------------------

  listUsers() {
    return fetchJson(API_BASE + "/admin/users");
  },

  createUser(body) {
    return fetchJson(API_BASE + "/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  updateUser(username, patch) {
    return fetchJson(API_BASE + "/admin/users/" + encodeURIComponent(username), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteUser(username) {
    return fetchJson(API_BASE + "/admin/users/" + encodeURIComponent(username), {
      method: "DELETE",
    });
  },

  listGroups() {
    return fetchJson(API_BASE + "/admin/groups");
  },

  createGroup(body) {
    return fetchJson(API_BASE + "/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  updateGroup(name, patch) {
    return fetchJson(API_BASE + "/admin/groups/" + encodeURIComponent(name), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteGroup(name) {
    return fetchJson(API_BASE + "/admin/groups/" + encodeURIComponent(name), {
      method: "DELETE",
    });
  },

  listGrants() {
    return fetchJson(API_BASE + "/admin/grants");
  },

  createGrant(body) {
    return fetchJson(API_BASE + "/admin/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  updateGrant(id, patch) {
    return fetchJson(API_BASE + "/admin/grants/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteGrant(id) {
    return fetchJson(API_BASE + "/admin/grants/" + encodeURIComponent(id), {
      method: "DELETE",
    });
  },
};
