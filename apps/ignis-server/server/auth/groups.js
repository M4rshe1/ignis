// Group records: file-backed store. Groups are referenced by their slug `name`
// from both user membership arrays and ACL grant subjects (group:<name>).

const crypto = require("crypto");
const authConfig = require("./config");
const store = require("./json-store");

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function isValidGroupName(name) {
  return typeof name === "string" && NAME_RE.test(name) && name !== "superadmin";
}

function loadAll() {
  const data = store.load(authConfig.groupsFile, { groups: {} });
  return data.groups || {};
}

function saveAll(groups) {
  store.save(authConfig.groupsFile, { groups });
}

function exists(name) {
  return Object.prototype.hasOwnProperty.call(loadAll(), name);
}

function listGroups() {
  const groups = loadAll();
  return Object.keys(groups).map((name) => groups[name]);
}

function createGroup({ name, displayName, description }) {
  if (!isValidGroupName(name)) {
    const err = new Error(
      "Invalid group name (lowercase alphanumeric, dash/underscore, not 'superadmin')",
    );
    err.statusCode = 400;
    throw err;
  }

  const groups = loadAll();

  if (groups[name]) {
    const err = new Error("Group already exists");
    err.statusCode = 409;
    throw err;
  }

  const group = {
    id: "grp_" + crypto.randomBytes(6).toString("hex"),
    name,
    displayName: displayName || name,
    description: description || "",
    createdAt: new Date().toISOString(),
  };

  groups[name] = group;
  saveAll(groups);

  return group;
}

function updateGroup(name, patch) {
  const groups = loadAll();
  const group = groups[name];

  if (!group) {
    const err = new Error("Group not found");
    err.statusCode = 404;
    throw err;
  }

  if (typeof patch.displayName === "string") {
    group.displayName = patch.displayName;
  }

  if (typeof patch.description === "string") {
    group.description = patch.description;
  }

  groups[name] = group;
  saveAll(groups);

  return group;
}

function deleteGroup(name) {
  const groups = loadAll();

  if (!groups[name]) {
    const err = new Error("Group not found");
    err.statusCode = 404;
    throw err;
  }

  delete groups[name];
  saveAll(groups);
}

module.exports = {
  isValidGroupName,
  exists,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
};
