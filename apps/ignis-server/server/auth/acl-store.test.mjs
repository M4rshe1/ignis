import os from "os";
import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-acl-store-"));
const dataRoot = path.join(tmpRoot, "data");

process.env.AUTH_MODE = "local";
process.env.DATA_ROOT = dataRoot;

const aclStore = require("./acl-store.js");

function resetStore() {
  fs.rmSync(path.join(dataRoot, "auth"), { recursive: true, force: true });
}

describe("acl-store grant names", () => {
  beforeEach(() => {
    resetStore();
  });

  it("stores an optional name on create", () => {
    const grant = aclStore.createGrant({
      subject: "group:contractors",
      vault: "team",
      path: "Projects/**",
      actions: ["read"],
      name: "Contractors read access",
    });

    expect(grant.name).toBe("Contractors read access");
    expect(aclStore.listGrants()[0].name).toBe("Contractors read access");
  });

  it("allows grants without a name for backward compatibility", () => {
    const grant = aclStore.createGrant({
      subject: "group:contractors",
      vault: "team",
      path: "Projects/**",
      actions: ["read"],
    });

    expect(grant.name).toBeUndefined();
  });

  it("updates and validates names", () => {
    const grant = aclStore.createGrant({
      subject: "group:contractors",
      vault: "team",
      path: "Projects/**",
      actions: ["read"],
      name: "Old name",
    });

    const updated = aclStore.updateGrant(grant.id, {
      name: "  New name  ",
    });

    expect(updated.name).toBe("New name");
  });

  it("rejects empty names", () => {
    expect(() =>
      aclStore.createGrant({
        subject: "group:contractors",
        vault: "team",
        path: "Projects/**",
        actions: ["read"],
        name: "   ",
      }),
    ).toThrow(/name cannot be empty/i);
  });
});
