import os from "os";
import fs from "fs";
import path from "path";
import http from "http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-user-update-"));
const dataRoot = path.join(tmpRoot, "data");

process.env.AUTH_MODE = "local";
process.env.DATA_ROOT = dataRoot;
process.env.AUTH_BOOTSTRAP_USER = "root";
process.env.AUTH_BOOTSTRAP_PASSWORD = "rootpw";

const express = require("express");
const { ensureBootstrapAdmin } = require("./bootstrap-admin.js");
const sessions = require("./sessions.js");
const users = require("./users.js");
const authRoutes = require("./routes.js");
const { attachUser, gateApi } = require("./middleware.js");

ensureBootstrapAdmin();

let server;
let baseUrl;
let adminCookie;

beforeAll(async () => {
  const admin = users.findByUsername("root");
  const sessionId = sessions.createSession(admin.id);
  adminCookie = `${sessions.COOKIE_NAME}=${sessionId}`;

  const app = express();
  app.use(express.json());
  app.use(attachUser);
  app.use(gateApi);
  app.use("/api/auth", authRoutes);

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

describe("admin self-update", () => {
  it("keeps the current session when only the display name changes", async () => {
    const patchRes = await fetch(`${baseUrl}/api/auth/admin/users/root`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        displayName: "Root Admin",
        globalRole: "superadmin",
        groups: [],
        disabled: false,
      }),
    });

    expect(patchRes.status).toBe(200);

    const listRes = await fetch(`${baseUrl}/api/auth/admin/users`, {
      headers: { Cookie: adminCookie },
    });

    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.find((user) => user.username === "root")?.displayName).toBe(
      "Root Admin",
    );
  });
});
