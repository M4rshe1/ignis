import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const authorize = require("./authorize.js");
const aclStore = require("./acl-store.js");

// Override the grant store with an in-memory list for these tests.
let GRANTS = [];
aclStore.listGrants = () => GRANTS;

function grant(subject, vault, path, actions, effect = "allow") {
  return { id: subject + path, subject, vault, path, actions, effect };
}

const userPrincipal = authorize.resolvePrincipal({
  id: "u_bob",
  globalRole: "user",
  groups: ["contractors"],
});

const multiGroupPrincipal = authorize.resolvePrincipal({
  id: "u_carol",
  globalRole: "user",
  groups: ["contractors", "editors"],
});

const superadmin = authorize.resolvePrincipal({
  id: "u_admin",
  globalRole: "superadmin",
  groups: [],
});

beforeEach(() => {
  GRANTS = [];
});

describe("resolvePrincipal", () => {
  it("builds user and group subjects", () => {
    expect(userPrincipal.subjects).toEqual([
      "user:u_bob",
      "group:contractors",
    ]);
  });
});

describe("can - deny by default", () => {
  it("denies when there are no grants", () => {
    expect(authorize.can(userPrincipal, "team", "Projects/x.md", "read")).toBe(
      false,
    );
  });

  it("allows a path covered by a group grant", () => {
    GRANTS = [
      grant("group:contractors", "team", "Projects/ClientA/**", [
        "list",
        "read",
        "write",
      ]),
    ];

    expect(
      authorize.can(userPrincipal, "team", "Projects/ClientA/notes.md", "read"),
    ).toBe(true);
    expect(
      authorize.can(userPrincipal, "team", "Projects/ClientB/secret.md", "read"),
    ).toBe(false);
  });

  it("does not leak another vault's grant", () => {
    GRANTS = [
      grant("group:contractors", "other", "**", ["read"]),
    ];

    expect(authorize.can(userPrincipal, "team", "a.md", "read")).toBe(false);
  });
});

describe("can - group union", () => {
  it("unions grants from all of a user's groups", () => {
    GRANTS = [
      grant("group:contractors", "team", "Projects/ClientA/**", ["read"]),
      grant("group:editors", "team", "Shared/**", ["read"]),
    ];

    // carol is in both groups
    expect(
      authorize.can(multiGroupPrincipal, "team", "Projects/ClientA/x.md", "read"),
    ).toBe(true);
    expect(
      authorize.can(multiGroupPrincipal, "team", "Shared/y.md", "read"),
    ).toBe(true);

    // bob is only a contractor
    expect(authorize.can(userPrincipal, "team", "Shared/y.md", "read")).toBe(
      false,
    );
  });
});

describe("can - user-specific grants", () => {
  const soloUser = authorize.resolvePrincipal({
    id: "u_solo",
    username: "solo",
    globalRole: "user",
    groups: [],
  });

  it("allows access from a direct user grant", () => {
    GRANTS = [grant("user:u_solo", "team", "Private/**", ["read", "write"])];

    expect(authorize.can(soloUser, "team", "Private/x.md", "read")).toBe(true);
    expect(authorize.can(soloUser, "team", "Other/x.md", "read")).toBe(false);
  });

  it("matches grants stored by username", () => {
    GRANTS = [grant("user:solo", "team", "Private/**", ["read"])];

    expect(authorize.can(soloUser, "team", "Private/x.md", "read")).toBe(true);
  });

  it("treats write as read for opening files", () => {
    GRANTS = [grant("user:u_solo", "team", "Drafts/**", ["write", "list"])];

    expect(authorize.can(soloUser, "team", "Drafts/x.md", "read")).toBe(true);
    expect(authorize.can(soloUser, "team", "Drafts/x.md", "write")).toBe(true);
  });
});

describe("can - specificity and deny", () => {
  it("lets a more specific rule win", () => {
    GRANTS = [
      grant("group:contractors", "team", "**", ["read"]),
      grant(
        "group:contractors",
        "team",
        "Projects/ClientA/**",
        ["read"],
        "deny",
      ),
    ];

    expect(authorize.can(userPrincipal, "team", "notes.md", "read")).toBe(true);
    expect(
      authorize.can(userPrincipal, "team", "Projects/ClientA/secret.md", "read"),
    ).toBe(false);
  });

  it("deny wins on a specificity tie", () => {
    GRANTS = [
      grant("user:u_bob", "team", "Projects/**", ["read"]),
      grant("group:contractors", "team", "Projects/**", ["read"], "deny"),
    ];

    expect(authorize.can(userPrincipal, "team", "Projects/x.md", "read")).toBe(
      false,
    );
  });
});

describe("can - implicit rights", () => {
  it("grants implicit read/list on .obsidian to anyone with vault access", () => {
    GRANTS = [grant("group:contractors", "team", "Projects/**", ["read"])];

    expect(
      authorize.can(userPrincipal, "team", ".obsidian/app.json", "read"),
    ).toBe(true);
    expect(authorize.can(userPrincipal, "team", ".obsidian", "list")).toBe(
      true,
    );
  });

  it("does not grant implicit write on .obsidian", () => {
    GRANTS = [grant("group:contractors", "team", "Projects/**", ["read"])];

    expect(
      authorize.can(userPrincipal, "team", ".obsidian/app.json", "write"),
    ).toBe(false);
  });

  it("allows listing ancestor directories of a granted path", () => {
    GRANTS = [
      grant("group:contractors", "team", "Projects/ClientA/**", ["read"]),
    ];

    expect(authorize.can(userPrincipal, "team", "", "list")).toBe(true);
    expect(authorize.can(userPrincipal, "team", "Projects", "list")).toBe(true);
    expect(
      authorize.can(userPrincipal, "team", "Projects/ClientA", "list"),
    ).toBe(true);
    expect(authorize.can(userPrincipal, "team", "Other", "list")).toBe(false);
  });
});

describe("superadmin", () => {
  it("bypasses all checks", () => {
    expect(authorize.can(superadmin, "any", "any/path.md", "write")).toBe(true);
    expect(authorize.canVault(superadmin, "any")).toBe(true);
  });
});

describe("canVault and filterVaults", () => {
  it("reflects whether the principal has any grant in a vault", () => {
    GRANTS = [grant("group:contractors", "team", "Projects/**", ["read"])];

    expect(authorize.canVault(userPrincipal, "team")).toBe(true);
    expect(authorize.canVault(userPrincipal, "other")).toBe(false);
    expect(authorize.filterVaults(userPrincipal, ["team", "other"])).toEqual([
      "team",
    ]);
  });
});

describe("filterTree", () => {
  it("keeps only readable files and listable directories", () => {
    GRANTS = [
      grant("group:contractors", "team", "Projects/ClientA/**", [
        "list",
        "read",
      ]),
    ];

    const tree = {
      Projects: { type: "directory" },
      "Projects/ClientA": { type: "directory" },
      "Projects/ClientA/a.md": { type: "file", size: 1 },
      "Projects/ClientB": { type: "directory" },
      "Projects/ClientB/secret.md": { type: "file", size: 1 },
    };

    const filtered = authorize.filterTree(userPrincipal, "team", tree);

    expect(Object.keys(filtered).sort()).toEqual([
      "Projects",
      "Projects/ClientA",
      "Projects/ClientA/a.md",
    ]);
  });
});
