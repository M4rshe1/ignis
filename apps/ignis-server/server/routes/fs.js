const express = require("express");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const config = require("../config");
const {
  writeCoalescer,
  encodeContentDispositionFilename,
  resolveVaultPath,
  sanitizeError,
} = require("@ignis/server-core");
const { writeCoalesced, getPending } = writeCoalescer;
const bootstrapRoutes = require("./bootstrap");
const authConfig = require("../auth/config");
const authorize = require("../auth/authorize");

const router = express.Router();

// Default ACL action inferred from the HTTP method when a route doesn't
// specify one explicitly.
function defaultAction(req) {
  if (req.method === "GET") {
    return "read";
  }

  if (req.method === "DELETE") {
    return "delete";
  }

  return "write";
}

// Vault-relative POSIX path for a resolved absolute path.
function toRelPath(vaultRoot, resolved) {
  return path.relative(vaultRoot, resolved).split(path.sep).join("/");
}

// Enforce path-level ACL. Returns true when allowed (or auth disabled);
// otherwise writes a 401/403 response and returns false.
function enforcePath(req, res, vaultRoot, resolved, action) {
  if (!authConfig.enabled) {
    return true;
  }

  if (!req.principal) {
    res.status(401).json({ error: "Authentication required", code: "EAUTH" });
    return false;
  }

  const rel = toRelPath(vaultRoot, resolved);

  if (!authorize.can(req.principal, req._vaultId, rel, action)) {
    res.status(403).json({ error: "Forbidden", code: "EACCES" });
    return false;
  }

  return true;
}

// Resolve the vault root for a request. Reads vault ID from query or body.
function getVaultRoot(req, res) {
  const vaultId = req.query.vault || req.body?.vault || config.defaultVaultId;
  const vaultPath = config.getVaultPath(vaultId);

  if (!vaultPath) {
    res.status(404).json({ error: "Vault not found", id: vaultId });
    return null;
  }

  req._vaultId = vaultId;

  // Vault-level gate: the principal must have at least one grant on the vault.
  if (authConfig.enabled) {
    if (!req.principal) {
      res.status(401).json({ error: "Authentication required", code: "EAUTH" });
      return null;
    }

    if (!authorize.canVault(req.principal, vaultId)) {
      res.status(403).json({ error: "Forbidden", code: "EACCES" });
      return null;
    }
  }

  return vaultPath;
}

function invalidateBootstrap(req) {
  if (req._vaultId) {
    bootstrapRoutes.invalidateVault(req._vaultId);
  }
}

function guardPath(req, res, source = "query", action) {
  const vaultRoot = getVaultRoot(req, res);

  if (!vaultRoot) {
    return null;
  }

  const p = source === "body" ? req.body?.path : req.query.path;

  if (p === undefined || p === null) {
    res.status(400).json({ error: "Missing path parameter" });
    return null;
  }

  // Empty string = vault root, which is valid
  const resolved = resolveVaultPath(vaultRoot, p);

  if (!resolved) {
    res.status(403).json({ error: "Path traversal rejected" });
    return null;
  }

  if (!enforcePath(req, res, vaultRoot, resolved, action || defaultAction(req))) {
    return null;
  }

  req._vaultRoot = vaultRoot;
  return resolved;
}

// GET /api/fs/stat?path=...
router.get("/stat", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    // If a coalesced write is pending, report its size instead of stale disk data
    const buffered = getPending(resolved);

    if (buffered) {
      const diskStat = await fs.promises.stat(resolved).catch(() => null);
      const size = Buffer.isBuffer(buffered.data)
        ? buffered.data.length
        : Buffer.byteLength(buffered.data, buffered.encoding || "utf-8");

      res.json({
        type: "file",
        size,
        mtime: Date.now(),
        ctime: diskStat ? diskStat.ctimeMs : Date.now(),
      });

      return;
    }

    const stat = await fs.promises.stat(resolved);

    res.json({
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      mtime: stat.mtimeMs,
      ctime: stat.ctimeMs,
    });
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

// GET /api/fs/readdir?path=...
router.get("/readdir", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    // Check if path is a file. return ENOTDIR instead of crashing
    const stat = await fs.promises.stat(resolved);

    if (!stat.isDirectory()) {
      return res
        .status(400)
        .json({ error: "ENOTDIR: not a directory", code: "ENOTDIR" });
    }

    const entries = await fs.promises.readdir(resolved, {
      withFileTypes: true,
    });

    res.json(
      entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
      })),
    );
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

// GET /api/fs/readFile?path=...&encoding=...
router.get("/readFile", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    const stat = await fs.promises.stat(resolved);

    if (stat.isDirectory()) {
      return res.status(400).json({
        error: "EISDIR: illegal operation on a directory",
        code: "EISDIR",
      });
    }

    // Serve buffered content if a coalesced write is pending for this path
    const buffered = getPending(resolved);

    if (buffered) {
      const encoding = req.query.encoding;

      if (encoding === "utf8" || encoding === "utf-8") {
        res.type("text/plain").send(buffered.data);
      } else {
        res.type("application/octet-stream").send(buffered.data);
      }

      return;
    }

    const encoding = req.query.encoding;

    if (encoding === "utf8" || encoding === "utf-8") {
      const data = await fs.promises.readFile(resolved, "utf-8");

      res.type("text/plain").send(data);
    } else {
      const data = await fs.promises.readFile(resolved);

      res.type("application/octet-stream").send(data);
    }
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

// POST /api/fs/writeFile { path, content, encoding?, vault? }
router.post("/writeFile", async (req, res) => {
  const resolved = guardPath(req, res, "body");

  if (!resolved) {
    return;
  }

  try {
    // Ensure parent directory exists
    const dir = path.dirname(resolved);
    await fs.promises.mkdir(dir, { recursive: true });

    const encoding = req.body.encoding || "utf-8";
    let data = req.body.content;

    if (req.body.base64) {
      data = Buffer.from(req.body.content, "base64");
    }

    const result = await writeCoalesced(resolved, data, encoding);

    invalidateBootstrap(req);
    res.json({ ok: true, mtime: result.mtime, size: result.size });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/fs/appendFile { path, content, vault? }
router.post("/appendFile", async (req, res) => {
  const resolved = guardPath(req, res, "body");

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.appendFile(resolved, req.body.content, "utf-8");

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/fs/mkdir { path, recursive?, vault? }
router.post("/mkdir", async (req, res) => {
  const resolved = guardPath(req, res, "body");

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.mkdir(resolved, {
      recursive: !!req.body.recursive,
    });

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/fs/rename { oldPath, newPath, vault? }
router.post("/rename", async (req, res) => {
  const vaultRoot = getVaultRoot(req, res);

  if (!vaultRoot) {
    return;
  }

  if (!req.body?.oldPath || !req.body?.newPath) {
    return res.status(400).json({ error: "Missing oldPath or newPath" });
  }

  const oldResolved = resolveVaultPath(vaultRoot, req.body.oldPath);
  const newResolved = resolveVaultPath(vaultRoot, req.body.newPath);

  if (!oldResolved || !newResolved) {
    return res.status(403).json({ error: "Invalid path" });
  }

  // Moving requires removing the source and writing the destination.
  if (
    !enforcePath(req, res, vaultRoot, oldResolved, "delete") ||
    !enforcePath(req, res, vaultRoot, newResolved, "write")
  ) {
    return;
  }

  try {
    await fs.promises.rename(oldResolved, newResolved);

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/fs/copyFile { src, dest, vault? }
router.post("/copyFile", async (req, res) => {
  const vaultRoot = getVaultRoot(req, res);

  if (!vaultRoot) {
    return;
  }

  if (!req.body?.src || !req.body?.dest) {
    return res.status(400).json({ error: "Missing src or dest" });
  }

  const srcResolved = resolveVaultPath(vaultRoot, req.body.src);
  const destResolved = resolveVaultPath(vaultRoot, req.body.dest);

  if (!srcResolved || !destResolved) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (
    !enforcePath(req, res, vaultRoot, srcResolved, "read") ||
    !enforcePath(req, res, vaultRoot, destResolved, "write")
  ) {
    return;
  }

  try {
    await fs.promises.copyFile(srcResolved, destResolved);

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// DELETE /api/fs/unlink?path=...
router.delete("/unlink", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.unlink(resolved);

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "ENOENT") {
      // File already gone  -  desired outcome achieved
      res.json({ ok: true });
    } else {
      res.status(500).json(sanitizeError(e));
    }
  }
});

// DELETE /api/fs/rmdir?path=...
router.delete("/rmdir", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.rmdir(resolved);

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// DELETE /api/fs/rm?path=...&recursive=true
router.delete("/rm", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.rm(resolved, {
      recursive: req.query.recursive === "true",
    });

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

router.get("/access", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.access(resolved);

    res.json({ ok: true });
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

// POST /api/fs/utimes { path, atime, mtime, vault? }
router.post("/utimes", async (req, res) => {
  const resolved = guardPath(req, res, "body");

  if (!resolved) {
    return;
  }

  try {
    await fs.promises.utimes(
      resolved,
      req.body.atime / 1000,
      req.body.mtime / 1000,
    );

    invalidateBootstrap(req);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// POST /api/fs/batch-read { paths, vault } - bulk read text file contents
// Used by the indexer pre-fetcher to avoid N round trips during startup.
router.post("/batch-read", async (req, res) => {
  const vaultRoot = getVaultRoot(req, res);

  if (!vaultRoot) {
    return;
  }

  const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];

  // The indexer prefetcher (the only caller) batches at 50, so a much larger list is not legitimate.
  if (paths.length > 1000) {
    return res.status(400).json({ error: "too many paths in batch-read" });
  }

  if (paths.length === 0) {
    return res.json({ files: {} });
  }

  const files = {};

  const enforce = authConfig.enabled;

  await Promise.all(
    paths.map(async (relPath) => {
      const resolved = resolveVaultPath(vaultRoot, relPath);

      if (!resolved) {
        return;
      }

      // Silently omit paths the principal can't read; never leak content or
      // error the whole batch.
      if (
        enforce &&
        !authorize.can(req.principal, req._vaultId, toRelPath(vaultRoot, resolved), "read")
      ) {
        return;
      }

      try {
        const buffered = getPending(resolved);

        if (buffered) {
          if (typeof buffered.data === "string") {
            files[relPath] = buffered.data;
          } else if (
            buffered.encoding === "utf8" ||
            buffered.encoding === "utf-8"
          ) {
            files[relPath] = buffered.data.toString("utf-8");
          }
          return;
        }

        const data = await fs.promises.readFile(resolved, "utf-8");
        files[relPath] = data;
      } catch {
        // Skip unreadable files silently. The client falls back to a
        // normal readFile when a path isn't in the response.
      }
    }),
  );

  res.json({ files });
});

// GET /api/fs/tree?path=...&vault=... returns full recursive file tree with metadata
router.get("/tree", async (req, res) => {
  const vaultRoot = getVaultRoot(req, res);

  if (!vaultRoot) {
    return;
  }

  const rootPath = req.query.path
    ? resolveVaultPath(vaultRoot, req.query.path)
    : vaultRoot;

  if (!rootPath) {
    return res.status(403).json({ error: "Invalid path" });
  }

  // Vault-relative prefix of the requested subtree, used both to gate the
  // request and to map subtree-relative keys to vault-relative ACL paths.
  const basePrefix = toRelPath(vaultRoot, rootPath);

  if (authConfig.enabled) {
    if (!req.principal) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "EAUTH" });
    }

    if (!authorize.can(req.principal, req._vaultId, basePrefix, "list")) {
      return res.status(403).json({ error: "Forbidden", code: "EACCES" });
    }
  }

  try {
    const tree = {};

    async function walk(dir, prefix) {
      const entries = await fs.promises.readdir(dir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const rel = prefix ? prefix + "/" + entry.name : entry.name;
        const full = path.join(dir, entry.name);
        const vaultRel = basePrefix ? basePrefix + "/" + rel : rel;

        if (entry.isDirectory()) {
          if (
            authConfig.enabled &&
            !authorize.can(req.principal, req._vaultId, vaultRel, "list")
          ) {
            continue;
          }

          tree[rel] = { type: "directory" };

          await walk(full, rel);
        } else {
          if (
            authConfig.enabled &&
            !authorize.can(req.principal, req._vaultId, vaultRel, "read")
          ) {
            continue;
          }

          const stat = await fs.promises.stat(full);

          tree[rel] = {
            type: "file",
            size: stat.size,
            mtime: stat.mtimeMs,
            ctime: stat.ctimeMs,
          };
        }
      }
    }

    await walk(rootPath, "");

    res.json(tree);
  } catch (e) {
    res.status(500).json(sanitizeError(e));
  }
});

// GET /api/fs/download?path=...&vault=...
router.get("/download", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    const stat = await fs.promises.stat(resolved);

    if (stat.isDirectory()) {
      return res
        .status(400)
        .json({ error: "Use /download-zip for directories" });
    }

    const filename = path.basename(resolved);
    res.setHeader(
      "Content-Disposition",
      encodeContentDispositionFilename(filename),
    );
    res.sendFile(resolved);
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

// GET /api/fs/download-zip?path=...&vault=...
router.get("/download-zip", async (req, res) => {
  const resolved = guardPath(req, res);

  if (!resolved) {
    return;
  }

  try {
    const stat = await fs.promises.stat(resolved);

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }

    const folderName = path.basename(resolved);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      encodeContentDispositionFilename(folderName + ".zip"),
    );

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("error", (err) => {
      res.status(500).end();
    });

    archive.pipe(res);
    // Skip symlinked entries so the zip cannot carry a link that escapes the vault on extraction.
    archive.directory(resolved, folderName, (entry) =>
      entry.stats && entry.stats.isSymbolicLink() ? false : entry,
    );
    archive.finalize();
  } catch (e) {
    res
      .status(e.code === "ENOENT" ? 404 : 500)
      .json(sanitizeError(e));
  }
});

module.exports = router;
