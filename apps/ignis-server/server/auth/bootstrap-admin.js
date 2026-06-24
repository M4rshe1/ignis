// First-run bootstrap: ensure at least one superadmin exists when local auth is
// enabled. Reads credentials from AUTH_BOOTSTRAP_USER / AUTH_BOOTSTRAP_PASSWORD.

const authConfig = require("./config");
const users = require("./users");

function ensureBootstrapAdmin() {
  if (users.countUsers() > 0) {
    return;
  }

  const username = authConfig.bootstrapUser;
  const password = authConfig.bootstrapPassword;

  if (!username || !password) {
    throw new Error(
      "AUTH_MODE=local but no users exist. Set AUTH_BOOTSTRAP_USER and " +
        "AUTH_BOOTSTRAP_PASSWORD to create the initial superadmin.",
    );
  }

  users.createUser({
    username,
    password,
    displayName: username,
    globalRole: "superadmin",
    groups: [],
  });

  console.log(
    `[auth] Created bootstrap superadmin "${username}". ` +
      "Change the password after first login.",
  );
}

module.exports = { ensureBootstrapAdmin };
