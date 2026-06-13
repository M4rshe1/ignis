import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSameOrigin } from "./url.js";

describe("isSameOrigin", () => {
  beforeEach(() => {
    global.window = { location: { origin: "https://vault.example.com" } };
  });

  afterEach(() => {
    delete global.window;
  });

  it("treats a root-relative path as same-origin", () => {
    expect(isSameOrigin("/api/fs/readFile")).toBe(true);
  });

  it("treats a protocol-relative URL as cross-origin", () => {
    expect(isSameOrigin("//evil.com/x")).toBe(false);
  });

  it("matches the page origin and rejects a different host", () => {
    expect(isSameOrigin("https://vault.example.com/x")).toBe(true);
    expect(isSameOrigin("https://evil.com/x")).toBe(false);
  });
});
