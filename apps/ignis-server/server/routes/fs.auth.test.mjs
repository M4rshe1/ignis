// End-to-end ACL enforcement test for the filesystem routes.
//
// Spins up the real fs router behind the real auth middleware over a temporary
// vault, then drives it through HTTP with session cookies to confirm a user
// only reaches the paths their grants allow.

import os from "os";
import fs from "fs";
import path from "path";
import http from "http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-auth-test-"));
const dataRoot = path.join(tmpRoot, "data");
const vaultRoot = path.join(tmpRoot, "vaults");
const vaultName = "team";
const vaultDir = path.join(vaultRoot, vaultName);

// Env must be set before requiring config/auth, which read it at load time.
process.env.AUTH_MODE = "local";
process.env.DATA_ROOT = dataRoot;
process.env.VAULT_ROOT = vaultRoot;
process.env.AUTH_BOOTSTRAP_USER = "root";
process.env.AUTH_BOOTSTRAP_PASSWORD = "rootpw";

fs.mkdirSync(path.join(vaultDir, ".obsidian"), { recursive: true });
fs.mkdirSync(path.join(vaultDir, "Projects", "ClientA"), { recursive: true });
fs.mkdirSync(path.join(vaultDir, "Projects", "ClientB"), { recursive: true });
fs.writeFileSync(path.join(vaultDir, "Projects", "ClientA", "a.md"), "alpha");
fs.writeFileSync(
  path.join(vaultDir, "Projects", "ClientB", "secret.md"),
  "top secret",
);

const express = require("express");
const config = require("../config");
const sessions = require("./../auth/sessions.js");
const users = require("./../auth/users.js");
const groups = require("./../auth/groups.js");
const aclStore = require("./../auth/acl-store.js");
const { attachUser, gateApi } = require("./../auth/middleware.js");
const fsRoutes = require("./fs.js");

let server;
let baseUrl;
let bobCookie;
let carolCookie;

beforeAll(async () => {
  config.refreshVaults();

  groups.createGroup({ name: "contractors", displayName: "Contractors" });
  const bob = users.createUser({
    username: "bob",
    password: "pw",
    groups: ["contractors"],
  });

  aclStore.createGrant({
    subject: "group:contractors",
    vault: vaultName,
    path: "Projects/ClientA/**",
    actions: ["list", "read", "write"],
  });

  const sessionId = sessions.createSession(bob.id);
  bobCookie = `${sessions.COOKIE_NAME}=${sessionId}`;

  const carol = users.createUser({
    username: "carol",
    password: "pw",
    groups: [],
  });

  aclStore.createGrant({
    subject: "user:" + carol.id,
    vault: vaultName,
    path: "Projects/ClientA/**",
    actions: ["write", "list"],
  });

  const carolSessionId = sessions.createSession(carol.id);
  carolCookie = `${sessions.COOKIE_NAME}=${carolSessionId}`;

  const app = express();
  app.use(express.json());
  app.use(attachUser);
  app.use(gateApi);
  app.use("/api/fs", fsRoutes);

  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function get(urlPath, cookie) {
  return fetch(baseUrl + urlPath, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

describe("fs route ACL enforcement", () => {
  it("rejects unauthenticated API calls", async () => {
    const res = await get(
      `/api/fs/readFile?vault=${vaultName}&path=Projects/ClientA/a.md`,
    );
    expect(res.status).toBe(401);
  });

  it("allows reading a granted path", async () => {
    const res = await get(
      `/api/fs/readFile?vault=${vaultName}&path=Projects/ClientA/a.md`,
      bobCookie,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("alpha");
  });

  it("forbids reading a path outside the grant", async () => {
    const res = await get(
      `/api/fs/readFile?vault=${vaultName}&path=Projects/ClientB/secret.md`,
      bobCookie,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("EACCES");
  });

  it("omits denied paths from batch-read instead of leaking them", async () => {
    const res = await fetch(baseUrl + "/api/fs/batch-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bobCookie },
      body: JSON.stringify({
        vault: vaultName,
        paths: ["Projects/ClientA/a.md", "Projects/ClientB/secret.md"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files["Projects/ClientA/a.md"]).toBe("alpha");
    expect(body.files["Projects/ClientB/secret.md"]).toBeUndefined();
  });

  it("filters the metadata tree to allowed nodes", async () => {
    const res = await get(`/api/fs/tree?vault=${vaultName}`, bobCookie);
    expect(res.status).toBe(200);
    const tree = await res.json();

    expect(tree["Projects/ClientA/a.md"]).toBeTruthy();
    expect(tree["Projects/ClientB"]).toBeUndefined();
    expect(tree["Projects/ClientB/secret.md"]).toBeUndefined();
  });

  it("allows user-specific grants without group membership", async () => {
    const res = await get(
      `/api/fs/readFile?vault=${vaultName}&path=Projects/ClientA/a.md`,
      carolCookie,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("alpha");
  });
});
