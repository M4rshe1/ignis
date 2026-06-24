// Session management for local auth. Sessions live in memory and are persisted
// to disk so a server restart doesn't force everyone to log in again.

const crypto = require("crypto");
const authConfig = require("./config");
const store = require("./json-store");

const COOKIE_NAME = authConfig.cookieName;

// sessionId -> { userId, createdAt, lastActivity }
const sessions = new Map();

const SESSION_ID_RE = /^[a-f0-9]{48}$/;

function isValidSessionId(id) {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

function loadFromDisk() {
  const data = store.load(authConfig.sessionsFile, { sessions: {} });
  const now = Date.now();

  for (const [id, s] of Object.entries(data.sessions || {})) {
    if (!isValidSessionId(id)) {
      continue;
    }

    if (now - s.lastActivity > authConfig.authSessionTtlMs) {
      continue;
    }

    sessions.set(id, s);
  }
}

function persist() {
  const obj = {};

  for (const [id, s] of sessions) {
    obj[id] = s;
  }

  try {
    store.save(authConfig.sessionsFile, { sessions: obj });
  } catch (e) {
    console.warn("[auth] failed to persist sessions:", e.message);
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;

  if (!header) {
    return {};
  }

  const out = {};

  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");

    if (eq < 0) {
      continue;
    }

    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }

  return out;
}

function createSession(userId) {
  const id = crypto.randomBytes(24).toString("hex");
  const now = Date.now();

  sessions.set(id, { userId, createdAt: now, lastActivity: now });
  persist();

  return id;
}

function getSession(id) {
  if (!isValidSessionId(id)) {
    return null;
  }

  const s = sessions.get(id);

  if (!s) {
    return null;
  }

  if (Date.now() - s.lastActivity > authConfig.authSessionTtlMs) {
    sessions.delete(id);
    persist();
    return null;
  }

  return s;
}

function touchSession(id) {
  const s = sessions.get(id);

  if (s) {
    s.lastActivity = Date.now();
  }
}

function destroySession(id) {
  if (sessions.delete(id)) {
    persist();
  }
}

// Remove every session for a user (e.g. on disable/delete/password change).
// Pass exceptSessionId to keep one session alive (e.g. when editing your own account).
function destroyUserSessions(userId, exceptSessionId) {
  let changed = false;

  for (const [id, s] of sessions) {
    if (s.userId === userId && id !== exceptSessionId) {
      sessions.delete(id);
      changed = true;
    }
  }

  if (changed) {
    persist();
  }
}

function setSessionCookie(res, sessionId) {
  const secure = process.env.AUTH_COOKIE_SECURE === "true";
  const maxAgeSec = Math.floor(authConfig.authSessionTtlMs / 1000);

  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSec}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

// Resolve the session id from a request's cookies.
function sessionIdFromReq(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}

module.exports = {
  COOKIE_NAME,
  loadFromDisk,
  parseCookies,
  createSession,
  getSession,
  touchSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
  clearSessionCookie,
  sessionIdFromReq,
};
