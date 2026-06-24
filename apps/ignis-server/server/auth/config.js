// Auth configuration, derived from environment variables.
//
// AUTH_MODE controls the whole feature:
//   "none"  (default) - no auth; every request is allowed (legacy behaviour)
//   "local"           - built-in username/password with file-backed users

const path = require("path");
const config = require("../config");

const AUTH_MODES = ["none", "local"];

const authMode = AUTH_MODES.includes(process.env.AUTH_MODE)
  ? process.env.AUTH_MODE
  : "none";

const authDataDir = path.join(config.dataRoot, "auth");

const authSessionTtlMs =
  parseInt(process.env.AUTH_SESSION_TTL_MS, 10) || 7 * 24 * 60 * 60 * 1000;

module.exports = {
  AUTH_MODES,
  authMode,
  enabled: authMode !== "none",
  authDataDir,
  authSessionTtlMs,
  cookieName: "ignis-session",
  usersFile: path.join(authDataDir, "users.json"),
  groupsFile: path.join(authDataDir, "groups.json"),
  aclFile: path.join(authDataDir, "acl.json"),
  sessionsFile: path.join(authDataDir, "sessions.json"),
  bootstrapUser: process.env.AUTH_BOOTSTRAP_USER || "",
  bootstrapPassword: process.env.AUTH_BOOTSTRAP_PASSWORD || "",
};
