// Auth HTTP routes: public login/session endpoints plus superadmin-only admin
// CRUD for users, groups, and ACL grants.

const express = require("express");
const config = require("../config");
const authConfig = require("./config");
const sessions = require("./sessions");
const users = require("./users");
const groups = require("./groups");
const aclStore = require("./acl-store");
const authorize = require("./authorize");
const { requireSuperadmin } = require("./middleware");
const { sanitizeError } = require("@ignis/server-core");

const router = express.Router();

// --- Public endpoints -----------------------------------------------------

router.get("/status", (req, res) => {
  res.json({ enabled: authConfig.enabled, mode: authConfig.authMode });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password required" });
  }

  const user = users.findByUsername(username);

  // Verify even when the user is missing to keep timing consistent.
  const ok =
    user && !user.disabled && users.verifyPassword(password, user.passwordHash);

  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const sessionId = sessions.createSession(user.id);
  sessions.setSessionCookie(res, sessionId);

  res.json({ ok: true, user: { username, ...users.publicUser(user) } });
});

router.post("/logout", (req, res) => {
  const sessionId = sessions.sessionIdFromReq(req);

  if (sessionId) {
    sessions.destroySession(sessionId);
  }

  sessions.clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user || !req.principal) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const allVaultIds = Object.keys(config.vaults);
  const vaults = authorize.filterVaults(req.principal, allVaultIds);

  res.json({
    username: req.user.username,
    id: req.user.id,
    displayName: req.user.displayName,
    globalRole: req.user.globalRole,
    groups: req.principal.groupNames,
    vaults,
  });
});

// --- Admin endpoints (superadmin only) ------------------------------------

const admin = express.Router();
admin.use(requireSuperadmin);

function handle(res, fn) {
  try {
    return fn();
  } catch (e) {
    // Store helpers throw deliberate, safe messages tagged with statusCode.
    // Anything untagged is unexpected and gets sanitized.
    if (e.statusCode) {
      // leak-allow
      return res.status(e.statusCode).json({ error: e.message });
    }

    res.status(500).json(sanitizeError(e));
  }
}

// Normalize user:<id|username> to user:<id> and verify the user exists.
function normalizeGrantSubject(subject) {
  if (typeof subject !== "string" || !subject.startsWith("user:")) {
    return subject;
  }

  const ident = subject.slice("user:".length);

  if (!ident) {
    const err = new Error("subject must be 'user:<id>' or 'group:<name>'");
    err.statusCode = 400;
    throw err;
  }

  const byId = users.findById(ident);

  if (byId) {
    return "user:" + byId.id;
  }

  const byName = users.findByUsername(ident);

  if (byName) {
    return "user:" + byName.id;
  }

  const err = new Error(`Unknown user: ${ident}`);
  err.statusCode = 400;
  throw err;
}

function normalizeGrantBody(body) {
  const next = { ...body };

  if (typeof next.subject === "string") {
    next.subject = normalizeGrantSubject(next.subject);
  }

  if (typeof next.name === "string") {
    next.name = next.name.trim();
  }

  return next;
}

function groupsEqual(a, b) {
  const left = [...(a || [])].sort();
  const right = [...(b || [])].sort();

  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function userPatchRequiresSessionInvalidation(existing, patch) {
  if (patch.password) {
    return true;
  }

  if (typeof patch.disabled === "boolean" && patch.disabled !== existing.disabled) {
    return true;
  }

  if (patch.globalRole && patch.globalRole !== existing.globalRole) {
    return true;
  }

  if (Array.isArray(patch.groups) && !groupsEqual(existing.groups, patch.groups)) {
    return true;
  }

  return false;
}

function invalidateUserSessionsAfterUpdate(req, res, existing, updated, patch) {
  if (!userPatchRequiresSessionInvalidation(existing, patch)) {
    return;
  }

  const isSelf = req.user?.username === updated.username;
  const currentSessionId = sessions.sessionIdFromReq(req);

  if (patch.password) {
    sessions.destroyUserSessions(updated.id);

    if (isSelf && !updated.disabled) {
      const newSessionId = sessions.createSession(updated.id);
      sessions.setSessionCookie(res, newSessionId);
    }

    return;
  }

  if (isSelf && currentSessionId) {
    sessions.destroyUserSessions(updated.id, currentSessionId);
    return;
  }

  sessions.destroyUserSessions(updated.id);
}

// Users
admin.get("/users", (req, res) => {
  res.json(users.listUsers());
});

admin.post("/users", (req, res) => {
  const { username, password, displayName, globalRole, groups: userGroups } =
    req.body || {};

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password required" });
  }

  if (Array.isArray(userGroups)) {
    for (const g of userGroups) {
      if (!groups.exists(g)) {
        return res.status(400).json({ error: `Unknown group: ${g}` });
      }
    }
  }

  handle(res, () => {
    const created = users.createUser({
      username,
      password,
      displayName,
      globalRole,
      groups: userGroups || [],
    });
    res.status(201).json(created);
  });
});

admin.patch("/users/:username", (req, res) => {
  const patch = req.body || {};

  if (Array.isArray(patch.groups)) {
    for (const g of patch.groups) {
      if (!groups.exists(g)) {
        return res.status(400).json({ error: `Unknown group: ${g}` });
      }
    }
  }

  handle(res, () => {
    const existing = users.findByUsername(req.params.username);

    if (!existing) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    const updated = users.updateUser(req.params.username, patch);
    invalidateUserSessionsAfterUpdate(req, res, existing, updated, patch);

    res.json(updated);
  });
});

admin.delete("/users/:username", (req, res) => {
  handle(res, () => {
    const existing = users.findByUsername(req.params.username);
    users.deleteUser(req.params.username);

    if (existing) {
      sessions.destroyUserSessions(existing.id);
    }

    res.json({ ok: true });
  });
});

// Groups
admin.get("/groups", (req, res) => {
  res.json(groups.listGroups());
});

admin.post("/groups", (req, res) => {
  handle(res, () => {
    const created = groups.createGroup(req.body || {});
    res.status(201).json(created);
  });
});

admin.patch("/groups/:name", (req, res) => {
  handle(res, () => {
    res.json(groups.updateGroup(req.params.name, req.body || {}));
  });
});

admin.delete("/groups/:name", (req, res) => {
  if (aclStore.anyGrantReferencesGroup(req.params.name)) {
    return res.status(409).json({
      error: "Group is referenced by ACL grants; remove those grants first",
    });
  }

  handle(res, () => {
    const affectedUserIds = users.removeGroupFromAllUsers(req.params.name);
    groups.deleteGroup(req.params.name);

    for (const userId of affectedUserIds) {
      sessions.destroyUserSessions(userId);
    }

    res.json({ ok: true });
  });
});

// Grants
admin.get("/grants", (req, res) => {
  res.json(aclStore.listGrants());
});

admin.post("/grants", (req, res) => {
  const body = normalizeGrantBody(req.body || {});

  if (typeof body.subject === "string" && body.subject.startsWith("group:")) {
    const name = body.subject.slice("group:".length);

    if (!groups.exists(name)) {
      return res.status(400).json({ error: `Unknown group: ${name}` });
    }
  }

  handle(res, () => {
    const created = aclStore.createGrant(body);
    res.status(201).json(created);
  });
});

admin.patch("/grants/:id", (req, res) => {
  handle(res, () => {
    res.json(aclStore.updateGrant(req.params.id, normalizeGrantBody(req.body || {})));
  });
});

admin.delete("/grants/:id", (req, res) => {
  handle(res, () => {
    aclStore.deleteGrant(req.params.id);
    res.json({ ok: true });
  });
});

router.use("/admin", admin);

module.exports = router;
