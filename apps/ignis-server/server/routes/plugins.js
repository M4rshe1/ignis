const express = require("express");
const {
  getDiscoveredPlugins,
  enablePluginForVault,
  disablePluginForVault,
} = require("../plugin-system/manager");
const { sanitizeError } = require("@ignis/server-core");
const authConfig = require("../auth/config");
const authorize = require("../auth/authorize");

const router = express.Router();

// Enabling/disabling a plugin for a vault requires admin rights on that vault.
function requireVaultAdmin(req, res, vaultId) {
  if (!authConfig.enabled) {
    return true;
  }

  if (!req.principal || !authorize.can(req.principal, vaultId, "", "admin")) {
    res.status(403).json({ error: "Forbidden", code: "EACCES" });
    return false;
  }

  return true;
}

router.get("/", (req, res) => {
  res.json(getDiscoveredPlugins());
});

router.post("/:pluginId/enable", async (req, res) => {
  const vaultId = req.body?.vault;

  if (!vaultId) {
    return res.status(400).json({ error: "Missing vault ID" });
  }

  if (!requireVaultAdmin(req, res, vaultId)) {
    return;
  }

  try {
    await enablePluginForVault(req.params.pluginId, vaultId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json(sanitizeError(e));
  }
});

router.post("/:pluginId/disable", async (req, res) => {
  const vaultId = req.body?.vault;

  if (!vaultId) {
    return res.status(400).json({ error: "Missing vault ID" });
  }

  if (!requireVaultAdmin(req, res, vaultId)) {
    return;
  }

  try {
    await disablePluginForVault(req.params.pluginId, vaultId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json(sanitizeError(e));
  }
});

module.exports = router;
