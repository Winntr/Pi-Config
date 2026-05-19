import { describe, it, expect } from "vitest";
import { normalizeWritePath } from "./index.ts";

describe("normalizeWritePath", () => {
  const cwd = "/home/me/proj";

  it("rewrites /<bare-filename> to <cwd>/<bare-filename>", () => {
    // The model anchoring at filesystem root is the bug we're fixing.
    expect(normalizeWritePath("/foo.md", cwd)).toEqual({
      path: "/home/me/proj/foo.md",
      rewrittenFrom: "/foo.md",
    });
    expect(normalizeWritePath("/person.md", cwd)).toEqual({
      path: "/home/me/proj/person.md",
      rewrittenFrom: "/person.md",
    });
  });

  it("resolves bare filenames against cwd (no rewrite flag — already cwd-relative)", () => {
    expect(normalizeWritePath("foo.md", cwd)).toEqual({
      path: "/home/me/proj/foo.md",
    });
  });

  it("resolves nested relative paths against cwd", () => {
    expect(normalizeWritePath("sub/foo.md", cwd)).toEqual({
      path: "/home/me/proj/sub/foo.md",
    });
    expect(normalizeWritePath("a/b/c.md", cwd)).toEqual({
      path: "/home/me/proj/a/b/c.md",
    });
  });

  it("leaves genuine absolute paths alone (path has an intermediate directory)", () => {
    // /etc/hosts has an intermediate directory, so it's a legitimate
    // absolute path. We don't rewrite it.
    expect(normalizeWritePath("/etc/hosts", cwd)).toEqual({
      path: "/etc/hosts",
    });
    expect(normalizeWritePath("/tmp/foo.log", cwd)).toEqual({
      path: "/tmp/foo.log",
    });
  });

  it("leaves deep absolute paths in cwd untouched", () => {
    // Model handing back its own cwd-prefixed path: unchanged.
    expect(normalizeWritePath("/home/me/proj/notes/plan.md", cwd)).toEqual({
      path: "/home/me/proj/notes/plan.md",
    });
  });
});
