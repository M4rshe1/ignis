import os from "os";
import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

describe("per-user-obsidian", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-per-user-"));
    process.env.DATA_ROOT = tmpDir;
    process.env.AUTH_MODE = "local";

    delete require.cache[require.resolve("./auth/config.js")];
    delete require.cache[require.resolve("./settings.js")];
    delete require.cache[require.resolve("./per-user-obsidian.js")];

    const settings = require("./settings.js");
    settings.update({
      perUserObsidianFiles: [
        ".obsidian/workspace.json",
        ".obsidian/workspace.*.json",
        ".obsidian/appearance.json",
      ],
    });
  });

  afterEach(() => {
    delete process.env.DATA_ROOT;
    delete process.env.AUTH_MODE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("maps configured logical paths to a user directory", () => {
    const perUserObsidian = require("./per-user-obsidian.js");
    const vaultRoot = path.join(tmpDir, "vault");
    fs.mkdirSync(vaultRoot, { recursive: true });

    const storage = perUserObsidian.resolveStorage(
      vaultRoot,
      ".obsidian/workspace.json",
      { userId: "user_1" },
    );

    expect(storage.perUser).toBe(true);
    expect(storage.logical).toBe(".obsidian/workspace.json");
    expect(storage.physical).toBe(
      path.join(vaultRoot, ".obsidian/users/user_1/workspace.json"),
    );
  });

  it("matches workspace variant globs", () => {
    const perUserObsidian = require("./per-user-obsidian.js");

    expect(
      perUserObsidian.matchesConfiguredPath(".obsidian/workspace.Home.json"),
    ).toBe(true);
    expect(
      perUserObsidian.matchesConfiguredPath(".obsidian/core-plugins.json"),
    ).toBe(false);
  });

  it("denies access to another user's storage path", () => {
    const perUserObsidian = require("./per-user-obsidian.js");
    const vaultRoot = path.join(tmpDir, "vault");
    fs.mkdirSync(vaultRoot, { recursive: true });

    const storage = perUserObsidian.resolveStorage(
      vaultRoot,
      ".obsidian/users/user_2/workspace.json",
      { userId: "user_1" },
    );

    expect(storage).toBeNull();
  });

  it("remaps watcher events to logical paths for the owning user", () => {
    const perUserObsidian = require("./per-user-obsidian.js");

    const mapped = perUserObsidian.mapWatcherEvent(
      { type: "modified", path: ".obsidian/users/user_1/appearance.json" },
      { userId: "user_1" },
    );

    expect(mapped.path).toBe(".obsidian/appearance.json");
  });

  it("drops watcher events for other users", () => {
    const perUserObsidian = require("./per-user-obsidian.js");

    const mapped = perUserObsidian.mapWatcherEvent(
      { type: "modified", path: ".obsidian/users/user_2/appearance.json" },
      { userId: "user_1" },
    );

    expect(mapped).toBeNull();
  });

  it("filters user storage from bootstrap trees", () => {
    const perUserObsidian = require("./per-user-obsidian.js");

    const tree = {
      "notes/a.md": { type: "file" },
      ".obsidian/app.json": { type: "file" },
      ".obsidian/users/user_1/workspace.json": { type: "file" },
    };

    const filtered = perUserObsidian.filterBootstrapTree(tree);

    expect(filtered[".obsidian/users/user_1/workspace.json"]).toBeUndefined();
    expect(filtered[".obsidian/app.json"]).toBeDefined();
  });
});
