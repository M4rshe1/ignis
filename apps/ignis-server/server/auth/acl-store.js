// ACL grant store. A grant binds a subject (user or group) to a set of
// allowed/denied actions on a glob path within a vault.

const crypto = require("crypto");
const authConfig = require("./config");
const store = require("./json-store");

const VALID_ACTIONS = ["list", "read", "write", "delete", "admin"];

function loadAll() {
  const data = store.load(authConfig.aclFile, { grants: [] });
  return Array.isArray(data.grants) ? data.grants : [];
}

function saveAll(grants) {
  store.save(authConfig.aclFile, { grants });
}

function listGrants() {
  return loadAll();
}

function isValidSubject(subject) {
  return (
    typeof subject === "string" &&
    (subject.startsWith("user:") || subject.startsWith("group:")) &&
    subject.length > 5
  );
}

function createGrant({ subject, vault, path: relPath, actions, effect }) {
  if (!isValidSubject(subject)) {
    const err = new Error("subject must be 'user:<id>' or 'group:<name>'");
    err.statusCode = 400;
    throw err;
  }

  if (typeof vault !== "string" || !vault) {
    const err = new Error("vault is required");
    err.statusCode = 400;
    throw err;
  }

  if (typeof relPath !== "string") {
    const err = new Error("path is required");
    err.statusCode = 400;
    throw err;
  }

  if (
    !Array.isArray(actions) ||
    actions.length === 0 ||
    actions.some((a) => !VALID_ACTIONS.includes(a))
  ) {
    const err = new Error(`actions must be a subset of ${VALID_ACTIONS.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  const grant = {
    id: "grant_" + crypto.randomBytes(6).toString("hex"),
    subject,
    vault,
    path: relPath.replace(/^\/+/, ""),
    actions,
    effect: effect === "deny" ? "deny" : "allow",
  };

  const grants = loadAll();
  grants.push(grant);
  saveAll(grants);

  return grant;
}

function updateGrant(id, patch) {
  const grants = loadAll();
  const grant = grants.find((g) => g.id === id);

  if (!grant) {
    const err = new Error("Grant not found");
    err.statusCode = 404;
    throw err;
  }

  if (patch.subject !== undefined) {
    if (!isValidSubject(patch.subject)) {
      const err = new Error("subject must be 'user:<id>' or 'group:<name>'");
      err.statusCode = 400;
      throw err;
    }

    grant.subject = patch.subject;
  }

  if (typeof patch.vault === "string") {
    grant.vault = patch.vault;
  }

  if (typeof patch.path === "string") {
    grant.path = patch.path.replace(/^\/+/, "");
  }

  if (Array.isArray(patch.actions)) {
    if (patch.actions.some((a) => !VALID_ACTIONS.includes(a))) {
      const err = new Error(`actions must be a subset of ${VALID_ACTIONS.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    grant.actions = patch.actions;
  }

  if (patch.effect === "allow" || patch.effect === "deny") {
    grant.effect = patch.effect;
  }

  saveAll(grants);

  return grant;
}

function deleteGrant(id) {
  const grants = loadAll();
  const next = grants.filter((g) => g.id !== id);

  if (next.length === grants.length) {
    const err = new Error("Grant not found");
    err.statusCode = 404;
    throw err;
  }

  saveAll(next);
}

// True if any grant targets the given group subject (used to block deletion).
function anyGrantReferencesGroup(groupName) {
  const subject = "group:" + groupName;
  return loadAll().some((g) => g.subject === subject);
}

module.exports = {
  VALID_ACTIONS,
  listGrants,
  createGrant,
  updateGrant,
  deleteGrant,
  anyGrantReferencesGroup,
};
