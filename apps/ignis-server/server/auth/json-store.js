// Tiny synchronous JSON file store used by the auth module.
//
// Auth data is small (users, groups, ACL grants) so synchronous reads/writes
// keep the call sites simple and avoid races. Writes are atomic via a temp
// file + rename so a crash mid-write can't truncate the file.

const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function load(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      return fallback;
    }

    throw e;
  }
}

function save(filePath, data) {
  ensureDir(filePath);

  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

module.exports = { load, save };
