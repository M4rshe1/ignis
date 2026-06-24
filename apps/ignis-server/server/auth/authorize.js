// Core authorization logic: deny-by-default path ACL with user + group subjects.
//
// A "principal" is the resolved identity for a request: the user plus the set
// of subjects (user:<id> and group:<name>) used to match ACL grants.

const aclStore = require("./acl-store");
const { matchPattern, specificity, literalBasePath } = require("./path-match");

// Build the principal once per request from a user record.
function resolvePrincipal(user) {
  if (!user) {
    return null;
  }

  const groupNames = Array.isArray(user.groups) ? user.groups : [];

  const subjects = ["user:" + user.id];

  // Also match legacy grants stored as user:<username>.
  if (user.username) {
    subjects.push("user:" + user.username);
  }

  for (const g of groupNames) {
    subjects.push("group:" + g);
  }

  return {
    userId: user.id,
    username: user.username,
    globalRole: user.globalRole,
    groupNames,
    subjects,
  };
}

// Does this grant authorize the requested action? Write implies read so
// edit-only grants still let Obsidian open existing notes.
function grantCoversAction(grant, action) {
  if (grant.actions.includes(action)) {
    return true;
  }

  if (action === "read" && grant.actions.includes("write")) {
    return true;
  }

  return false;
}

function isSuperadmin(principal) {
  return !!principal && principal.globalRole === "superadmin";
}

function isSystemPath(relPath) {
  return relPath === ".obsidian" || relPath.startsWith(".obsidian/");
}

// Grants that apply to this principal in this vault.
function applicableGrants(principal, vaultId) {
  if (!principal) {
    return [];
  }

  const subjects = new Set(principal.subjects);

  return aclStore
    .listGrants()
    .filter((g) => g.vault === vaultId && subjects.has(g.subject));
}

// Evaluate allow/deny for a path + action across pre-filtered grants.
// Most specific rule wins; deny wins on a specificity tie.
function evaluate(grants, relPath, action) {
  let best = null;

  for (const g of grants) {
    if (!grantCoversAction(g, action)) {
      continue;
    }

    if (!matchPattern(g.path, relPath)) {
      continue;
    }

    const spec = specificity(g.path);
    const effect = g.effect === "deny" ? "deny" : "allow";

    if (
      !best ||
      spec > best.spec ||
      (spec === best.spec && effect === "deny")
    ) {
      best = { effect, spec };
    }
  }

  return best ? best.effect === "allow" : false;
}

// Does the principal have any allow grant at all in this vault?
function hasAnyVaultGrant(grants) {
  return grants.some((g) => g.effect !== "deny");
}

// Is relPath an ancestor directory of some path the principal can reach?
// Needed so a user granted "Projects/A/**" can still list "Projects".
function isAncestorOfGranted(grants, relPath) {
  if (relPath === "") {
    return hasAnyVaultGrant(grants);
  }

  for (const g of grants) {
    if (g.effect === "deny") {
      continue;
    }

    const base = literalBasePath(g.path);

    if (base === relPath || base.startsWith(relPath + "/")) {
      return true;
    }
  }

  return false;
}

// Core predicate. `grants` may be passed in to avoid re-reading the store.
function can(principal, vaultId, relPath, action, grants) {
  if (isSuperadmin(principal)) {
    return true;
  }

  if (!principal) {
    return false;
  }

  const norm = (relPath || "").replace(/^\/+/, "");
  const g = grants || applicableGrants(principal, vaultId);

  // Obsidian needs to read its own config to boot; grant implicit read/list
  // on .obsidian to anyone with any access to the vault.
  if (
    isSystemPath(norm) &&
    (action === "read" || action === "list") &&
    hasAnyVaultGrant(g)
  ) {
    return true;
  }

  if (action === "list" && isAncestorOfGranted(g, norm)) {
    return true;
  }

  return evaluate(g, norm, action);
}

// Vault-level access: at least one allow grant (or superadmin).
function canVault(principal, vaultId) {
  if (isSuperadmin(principal)) {
    return true;
  }

  if (!principal) {
    return false;
  }

  return hasAnyVaultGrant(applicableGrants(principal, vaultId));
}

// Filter a flat vault id list down to those the principal can access.
function filterVaults(principal, vaultIds) {
  if (isSuperadmin(principal)) {
    return vaultIds.slice();
  }

  if (!principal) {
    return [];
  }

  return vaultIds.filter((id) => canVault(principal, id));
}

// Strip metadata-tree nodes the principal cannot see.
// `tree` is { relPath: { type, ... } }. Directories are kept when listable,
// files when readable.
function filterTree(principal, vaultId, tree) {
  if (isSuperadmin(principal)) {
    return tree;
  }

  if (!principal) {
    return {};
  }

  const grants = applicableGrants(principal, vaultId);
  const out = {};

  for (const relPath of Object.keys(tree)) {
    const node = tree[relPath];
    const action = node.type === "directory" ? "list" : "read";

    if (can(principal, vaultId, relPath, action, grants)) {
      out[relPath] = node;
    }
  }

  return out;
}

// A stable hash of the principal's identity + group membership, used as part of
// the per-principal bootstrap cache key.
function principalHash(principal) {
  if (!principal) {
    return "anon";
  }

  if (isSuperadmin(principal)) {
    return "superadmin:" + principal.userId;
  }

  const groups = principal.groupNames.slice().sort().join(",");
  return principal.userId + "|" + groups;
}

module.exports = {
  resolvePrincipal,
  isSuperadmin,
  isSystemPath,
  grantCoversAction,
  applicableGrants,
  can,
  canVault,
  filterVaults,
  filterTree,
  principalHash,
};
