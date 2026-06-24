// Per-user storage for selected .obsidian config files when local auth is enabled.
//
// Logical paths (what Obsidian reads/writes) are mapped to:
//   .obsidian/users/<userId>/<rest-of-path>
// Reads fall back to the shared vault copy when the user file does not exist yet.

const path = require("path");
const { resolveVaultPath } = require("@ignis/server-core");
const authConfig = require("./auth/config");
const settings = require("./settings");
const { matchPattern } = require("./auth/path-match");

const USERS_ROOT = ".obsidian/users";
const USERS_ROOT_PREFIX = USERS_ROOT + "/";

function getPatterns() {
  const list = settings.get("perUserObsidianFiles");

  return Array.isArray(list) ? list : [];
}

function isActive() {
  return authConfig.enabled && getPatterns().length > 0;
}

function matchesConfiguredPath(relPath) {
  const patterns = getPatterns();

  for (const pattern of patterns) {
    if (matchPattern(pattern, relPath)) {
      return true;
    }
  }

  return false;
}

function isUserStoragePath(relPath) {
  return relPath === USERS_ROOT || relPath.startsWith(USERS_ROOT_PREFIX);
}

function userIdFromStoragePath(relPath) {
  if (!relPath.startsWith(USERS_ROOT_PREFIX)) {
    return null;
  }

  const rest = relPath.slice(USERS_ROOT_PREFIX.length);
  const slash = rest.indexOf("/");

  if (slash === -1) {
    return rest || null;
  }

  return rest.slice(0, slash);
}

function storageRelPath(userId, logicalRelPath) {
  const suffix = logicalRelPath.startsWith(".obsidian/")
    ? logicalRelPath.slice(".obsidian/".length)
    : logicalRelPath;

  return `${USERS_ROOT}/${userId}/${suffix}`;
}

// Resolve logical vault-relative path to disk locations for this principal.
// Returns null when the path is another user's storage (access denied).
function resolveStorage(vaultRoot, logicalRelPath, principal) {
  const logicalResolved = resolveVaultPath(vaultRoot, logicalRelPath);

  if (!logicalResolved) {
    return null;
  }

  if (!isActive() || !principal?.userId) {
    return {
      logical: logicalRelPath,
      physical: logicalResolved,
      shared: logicalResolved,
      perUser: false,
    };
  }

  if (isUserStoragePath(logicalRelPath)) {
    const ownerId = userIdFromStoragePath(logicalRelPath);

    if (ownerId && ownerId !== principal.userId) {
      return null;
    }
  }

  if (!matchesConfiguredPath(logicalRelPath)) {
    return {
      logical: logicalRelPath,
      physical: logicalResolved,
      shared: logicalResolved,
      perUser: false,
    };
  }

  const userRel = storageRelPath(principal.userId, logicalRelPath);
  const physical = resolveVaultPath(vaultRoot, userRel);

  if (!physical) {
    return null;
  }

  return {
    logical: logicalRelPath,
    physical,
    shared: logicalResolved,
    perUser: true,
  };
}

function shouldHideReaddirEntry(parentRel, name) {
  if (!isActive()) {
    return false;
  }

  const parent = parentRel || "";

  if (parent === ".obsidian" && name === "users") {
    return true;
  }

  if (parent === USERS_ROOT) {
    return true;
  }

  return false;
}

function filterBootstrapTree(tree) {
  if (!isActive()) {
    return tree;
  }

  const filtered = {};

  for (const [rel, meta] of Object.entries(tree)) {
    if (rel === USERS_ROOT || rel.startsWith(USERS_ROOT_PREFIX)) {
      continue;
    }

    filtered[rel] = meta;
  }

  return filtered;
}

// Map a physical watcher path back to the logical path for the connected user.
// Returns null to drop the event for this client.
function mapWatcherEvent(event, ctx) {
  if (!isActive() || !event?.path || !ctx?.userId) {
    return event;
  }

  const rel = event.path.replace(/\\/g, "/");

  if (!isUserStoragePath(rel)) {
    return event;
  }

  const ownerId = userIdFromStoragePath(rel);

  if (!ownerId || ownerId !== ctx.userId) {
    return null;
  }

  const suffix = rel.slice((USERS_ROOT + "/" + ownerId + "/").length);

  if (!suffix) {
    return null;
  }

  const logical = ".obsidian/" + suffix;

  if (!matchesConfiguredPath(logical)) {
    return null;
  }

  return { ...event, path: logical };
}

module.exports = {
  USERS_ROOT,
  getPatterns,
  isActive,
  matchesConfiguredPath,
  resolveStorage,
  shouldHideReaddirEntry,
  filterBootstrapTree,
  mapWatcherEvent,
};
