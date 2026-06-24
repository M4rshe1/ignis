import os from "os";
import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-users-groups-"));

process.env.AUTH_MODE = "local";
process.env.DATA_ROOT = tmpRoot;
process.env.AUTH_BOOTSTRAP_USER = "root";
process.env.AUTH_BOOTSTRAP_PASSWORD = "rootpw";

const require = createRequire(import.meta.url);
const users = require("./users.js");
const groups = require("./groups.js");

beforeAll(() => {
  groups.createGroup({ name: "editors", displayName: "Editors" });
  groups.createGroup({ name: "viewers", displayName: "Viewers" });

  users.createUser({
    username: "alice",
    password: "pw",
    groups: ["editors", "viewers"],
  });
  users.createUser({
    username: "bob",
    password: "pw",
    groups: ["editors"],
  });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("removeGroupFromAllUsers", () => {
  it("removes the group from every user membership", () => {
    const affected = users.removeGroupFromAllUsers("editors");

    expect(affected).toHaveLength(2);

    const alice = users.findByUsername("alice");
    const bob = users.findByUsername("bob");

    expect(alice.groups).toEqual(["viewers"]);
    expect(bob.groups).toEqual([]);
  });
});
