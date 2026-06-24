// User records: file-backed store + scrypt password hashing.
//
// Hash format: scrypt$N$r$p$saltB64$hashB64

const crypto = require("crypto");
const authConfig = require("./config");
const store = require("./json-store");

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string") {
    return false;
  }

  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  let derived;

  try {
    derived = crypto.scryptSync(password, salt, expected.length, {
      N: parseInt(n, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    });
  } catch {
    return false;
  }

  if (derived.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expected);
}

function loadAll() {
  const data = store.load(authConfig.usersFile, { users: {} });
  return data.users || {};
}

function saveAll(users) {
  store.save(authConfig.usersFile, { users });
}

function newUserId() {
  return "u_" + crypto.randomBytes(8).toString("hex");
}

// Strip the password hash before returning a user to a client.
function publicUser(user) {
  if (!user) {
    return null;
  }

  const rest = { ...user };
  delete rest.passwordHash;
  return rest;
}

function findByUsername(username) {
  const users = loadAll();
  return users[username] || null;
}

function findById(id) {
  const users = loadAll();

  for (const username of Object.keys(users)) {
    if (users[username].id === id) {
      return { username, ...users[username] };
    }
  }

  return null;
}

function listUsers() {
  const users = loadAll();
  return Object.keys(users).map((username) => ({
    username,
    ...publicUser(users[username]),
  }));
}

function createUser({
  username,
  password,
  displayName,
  globalRole = "user",
  groups = [],
}) {
  const users = loadAll();

  if (users[username]) {
    const err = new Error("User already exists");
    err.statusCode = 409;
    throw err;
  }

  const user = {
    id: newUserId(),
    passwordHash: hashPassword(password),
    displayName: displayName || username,
    globalRole: globalRole === "superadmin" ? "superadmin" : "user",
    groups: Array.isArray(groups) ? groups : [],
    disabled: false,
    createdAt: new Date().toISOString(),
  };

  users[username] = user;
  saveAll(users);

  return { username, ...publicUser(user) };
}

function updateUser(username, patch) {
  const users = loadAll();
  const user = users[username];

  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  if (patch.password) {
    user.passwordHash = hashPassword(patch.password);
  }

  if (typeof patch.displayName === "string") {
    user.displayName = patch.displayName;
  }

  if (patch.globalRole === "superadmin" || patch.globalRole === "user") {
    user.globalRole = patch.globalRole;
  }

  if (Array.isArray(patch.groups)) {
    user.groups = patch.groups;
  }

  if (typeof patch.disabled === "boolean") {
    user.disabled = patch.disabled;
  }

  users[username] = user;
  saveAll(users);

  return { username, ...publicUser(user) };
}

function deleteUser(username) {
  const users = loadAll();

  if (!users[username]) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  delete users[username];
  saveAll(users);
}

// Drop a deleted group from every user's membership list.
// Returns affected user ids so callers can invalidate sessions.
function removeGroupFromAllUsers(groupName) {
  const users = loadAll();
  const affectedUserIds = [];
  let changed = false;

  for (const username of Object.keys(users)) {
    const user = users[username];

    if (!Array.isArray(user.groups) || !user.groups.includes(groupName)) {
      continue;
    }

    user.groups = user.groups.filter((g) => g !== groupName);
    users[username] = user;
    affectedUserIds.push(user.id);
    changed = true;
  }

  if (changed) {
    saveAll(users);
  }

  return affectedUserIds;
}

function countUsers() {
  return Object.keys(loadAll()).length;
}

module.exports = {
  hashPassword,
  verifyPassword,
  publicUser,
  findByUsername,
  findById,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  removeGroupFromAllUsers,
  countUsers,
};
