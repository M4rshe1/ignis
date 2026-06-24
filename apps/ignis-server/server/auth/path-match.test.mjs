import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { matchPattern, specificity, literalBasePath } = require("./path-match.js");

describe("matchPattern", () => {
  it("matches exact paths", () => {
    expect(matchPattern("readme.md", "readme.md")).toBe(true);
    expect(matchPattern("readme.md", "other.md")).toBe(false);
  });

  it("matches a single-segment wildcard within one segment only", () => {
    expect(matchPattern("*.md", "readme.md")).toBe(true);
    expect(matchPattern("*.md", "docs/readme.md")).toBe(false);
    expect(matchPattern("Notes/*/index.md", "Notes/foo/index.md")).toBe(true);
    expect(matchPattern("Notes/*/index.md", "Notes/foo/bar/index.md")).toBe(
      false,
    );
  });

  it("matches recursive ** including the base directory itself", () => {
    expect(matchPattern("Projects/ClientA/**", "Projects/ClientA")).toBe(true);
    expect(matchPattern("Projects/ClientA/**", "Projects/ClientA/foo.md")).toBe(
      true,
    );
    expect(
      matchPattern("Projects/ClientA/**", "Projects/ClientA/sub/deep.md"),
    ).toBe(true);
    expect(matchPattern("Projects/ClientA/**", "Projects/ClientB/foo.md")).toBe(
      false,
    );
  });

  it("matches a bare ** against everything", () => {
    expect(matchPattern("**", "")).toBe(true);
    expect(matchPattern("**", "anything/here.md")).toBe(true);
  });
});

describe("specificity", () => {
  it("ranks deeper literal prefixes higher", () => {
    expect(specificity("Projects/ClientA/**")).toBeGreaterThan(
      specificity("Projects/**"),
    );
    expect(specificity("**")).toBe(0);
  });
});

describe("literalBasePath", () => {
  it("returns the literal directory prefix of a glob", () => {
    expect(literalBasePath("Projects/ClientA/**")).toBe("Projects/ClientA");
    expect(literalBasePath("Notes/*/index.md")).toBe("Notes");
  });

  it("drops a trailing literal file segment", () => {
    expect(literalBasePath("readme.md")).toBe("");
    expect(literalBasePath("Projects/notes.md")).toBe("Projects");
  });
});
