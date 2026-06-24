const express = require("express");
const fs = require("fs");
const config = require("../config");
const path = require("path");
const bootstrapRoutes = require("./bootstrap");
const { sanitizeError } = require("@ignis/server-core");
const authConfig = require("../auth/config");
const authorize = require("../auth/authorize");

const router = express.Router();

// Vault management (rename/delete/create) requires broad admin rights.
function requireVaultAdmin(req, res, vaultId) {
  if (!authConfig.enabled) {
    return true;
  }

  if (!req.principal) {
    res.status(401).json({ error: "Authentication required", code: "EAUTH" });
    return false;
  }

  if (!authorize.can(req.principal, vaultId, "", "admin")) {
    res.status(403).json({ error: "Forbidden", code: "EACCES" });
    return false;
  }

  return true;
}

// Vault names become directories under VAULT_ROOT; reject traversal, hidden, and reserved-device names.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function isValidVaultName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 255) {
    return false;
  }

  if (/[/\\:*?"<>|]/.test(name)) {
    return false;
  }

  if (name.startsWith(".")) {
    return false;
  }

  return !WINDOWS_RESERVED.test(name);
}

// GET /api/vault/list - returns all discovered vaults (re-scans on each call)
router.get("/list", (req, res) => {
  config.refreshVaults();

  let entries = Object.entries(config.vaults);

  // Only expose vaults the principal can access.
  if (authConfig.enabled) {
    const allowed = new Set(
      authorize.filterVaults(
        req.principal,
        entries.map(([id]) => id),
      ),
    );
    entries = entries.filter(([id]) => allowed.has(id));
  }

  const list = entries.map(([id, vaultPath]) => ({
    id,
    name: id,
    path: vaultPath,
  }));

  res.json(list);
});

// GET /api/vault/info?vault=<id> - returns info for a specific vault
router.get("/info", async (req, res) => {
  const vaultId = req.query.vault || config.defaultVaultId;
  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    return res.status(404).json({ error: "Vault not found", id: vaultId });
  }

  if (authConfig.enabled) {
    if (!req.principal) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "EAUTH" });
    }

    if (!authorize.canVault(req.principal, vaultId)) {
      return res.status(403).json({ error: "Forbidden", code: "EACCES" });
    }
  }

  res.json({
    id: vaultId,
    name: vaultId,
    path: vaultPath,
    platform: process.platform,
    version: config.obsidianVersion,
  });
});

// POST /api/vault/create { name } - create a new vault in VAULT_ROOT
router.post("/create", async (req, res) => {
  // Creating new vaults is a superadmin operation when auth is enabled.
  if (authConfig.enabled && !authorize.isSuperadmin(req.principal)) {
    return res.status(403).json({ error: "Forbidden", code: "EACCES" });
  }

  const name = req.body?.name;

  if (!isValidVaultName(name)) {
    return res.status(400).json({ error: "Invalid vault name" });
  }

  const vaultPath = path.join(config.vaultRoot, name);

  try {
    await fs.promises.mkdir(vaultPath, { recursive: false });
    await fs.promises.mkdir(path.join(vaultPath, ".obsidian"), {
      recursive: false,
    });

    config.refreshVaults();
    bootstrapRoutes.invalidateVault(name);

    res.json({ ok: true, id: name, path: vaultPath });
  } catch (e) {
    if (e.code === "EEXIST") {
      return res.status(409).json({ error: "Vault already exists" });
    }

    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/vault/rename { vault, name } - rename a vault
router.post("/rename", async (req, res) => {
  const vaultId = req.body?.vault;
  const newName = req.body?.name;

  if (!isValidVaultName(newName)) {
    return res.status(400).json({ error: "Invalid vault name" });
  }

  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    return res.status(404).json({ error: "Vault not found" });
  }

  if (!requireVaultAdmin(req, res, vaultId)) {
    return;
  }

  const newPath = path.join(config.vaultRoot, newName);

  try {
    await fs.promises.rename(vaultPath, newPath);

    config.refreshVaults();
    bootstrapRoutes.invalidateVault(vaultId);
    bootstrapRoutes.invalidateVault(newName);

    res.json({ ok: true, id: newName, path: newPath });
  } catch (e) {
    if (e.code === "ENOTEMPTY" || e.code === "EEXIST") {
      return res
        .status(409)
        .json({ error: "A vault with that name already exists" });
    }

    res.status(500).json(sanitizeError(e));
  }
});

// DELETE /api/vault/remove?vault=<id> - remove a vault from disk
router.delete("/remove", async (req, res) => {
  const vaultId = req.query.vault;
  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    return res.status(404).json({ error: "Vault not found" });
  }

  if (!requireVaultAdmin(req, res, vaultId)) {
    return;
  }

  try {
    await fs.promises.rm(vaultPath, { recursive: true });

    config.refreshVaults();
    bootstrapRoutes.invalidateVault(vaultId);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

module.exports = router;
