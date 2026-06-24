// Load KEY=VALUE pairs from the repo-root .env file into process.env.
// Node does not read .env automatically; without this, AUTH_MODE and other
// settings in .env are ignored when starting the server.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const ENV_FILE = path.join(REPO_ROOT, ".env");

function loadEnv(filePath = ENV_FILE) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq < 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Do not override variables already set in the shell.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnv();

module.exports = { loadEnv, ENV_FILE };
