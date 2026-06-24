// Express middleware for local auth: resolve identity on every request and
// gate API routes when no valid session is present.

const sessions = require("./sessions");
const users = require("./users");
const authorize = require("./authorize");

// Resolve the current user (and principal) from the session cookie and attach
// them to the request. Never blocks; gating is done separately.
function attachUser(req, res, next) {
  const sessionId = sessions.sessionIdFromReq(req);
  const session = sessionId ? sessions.getSession(sessionId) : null;

  if (session) {
    const user = users.findById(session.userId);

    if (user && !user.disabled) {
      sessions.touchSession(sessionId);
      req.user = user;
      req.principal = authorize.resolvePrincipal(user);
    }
  }

  next();
}

// Paths under /api that are reachable without a session.
function isPublicApiPath(pathname) {
  return (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/status" ||
    pathname === "/api/auth/me"
  );
}

// Block API calls that require a session. Non-API requests (the HTML shell,
// static assets, the login UI) pass through so the client can render a login
// screen and call the auth endpoints.
function gateApi(req, res, next) {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  if (isPublicApiPath(req.path)) {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required", code: "EAUTH" });
  }

  next();
}

// Guard a route to superadmins only.
function requireSuperadmin(req, res, next) {
  if (!req.principal || !authorize.isSuperadmin(req.principal)) {
    return res.status(403).json({ error: "Forbidden", code: "EFORBIDDEN" });
  }

  next();
}

module.exports = { attachUser, gateApi, requireSuperadmin, isPublicApiPath };
