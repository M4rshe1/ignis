// Auth module entrypoint. Wires local-auth middleware and routes onto the
// Express app. No-op when AUTH_MODE=none so existing deployments are unchanged.

const config = require("../config");
const authConfig = require("./config");
const sessions = require("./sessions");
const users = require("./users");
const authorize = require("./authorize");
const { attachUser, gateApi } = require("./middleware");
const { ensureBootstrapAdmin } = require("./bootstrap-admin");
const authRoutes = require("./routes");

// Resolve a principal directly from a raw request (used by the WebSocket
// upgrade and any path outside the normal Express middleware chain).
function principalFromReq(req) {
  const sessionId = sessions.sessionIdFromReq(req);
  const session = sessionId ? sessions.getSession(sessionId) : null;

  if (!session) {
    return null;
  }

  const user = users.findById(session.userId);

  if (!user || user.disabled) {
    return null;
  }

  return authorize.resolvePrincipal(user);
}

// Mount auth middleware + routes. Call before the API routes are mounted.
function setupAuth(app) {
  if (!authConfig.enabled) {
    return;
  }

  if (config.demoMode) {
    throw new Error(
      "AUTH_MODE and DEMO_MODE cannot both be enabled. Disable one.",
    );
  }

  console.log(`[auth] Local auth enabled (mode: ${authConfig.authMode})`);

  sessions.loadFromDisk();
  ensureBootstrapAdmin();

  app.use(attachUser);
  app.use(gateApi);
  app.use("/api/auth", authRoutes);
}

module.exports = { setupAuth, principalFromReq, enabled: authConfig.enabled };
