// Glob path matching for vault-relative ACL patterns.
//
// Patterns are POSIX-style, vault-relative (no leading slash):
//   **            recursive wildcard, matches any number of segments
//   *             matches within a single path segment (no slash)
//   exact text    matched literally
//
// Examples:
//   "Projects/ClientA/**" matches "Projects/ClientA" and everything beneath it
//   "*.md"                matches "readme.md" but not "docs/readme.md"
//   "Notes/*/index.md"    matches "Notes/foo/index.md"

function escapeRegexChar(c) {
  return c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// Compile a glob pattern to an anchored RegExp.
function globToRegExp(glob) {
  let re = "";
  let i = 0;

  while (i < glob.length) {
    const c = glob[i];

    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" matches zero or more leading segments; bare "**" matches the rest.
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else {
      re += escapeRegexChar(c);
      i += 1;
    }
  }

  return new RegExp("^" + re + "$");
}

// Does the grant pattern cover the target relative path?
// A trailing "/**" also matches the base directory itself so the granted
// folder node is visible, not just its contents.
function matchPattern(pattern, target) {
  if (pattern === target) {
    return true;
  }

  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);

    if (target === base) {
      return true;
    }
  }

  return globToRegExp(pattern).test(target);
}

// Specificity = length of the literal prefix before the first wildcard.
// Used so a deeper, more specific rule wins over a broader one.
function specificity(pattern) {
  const star = pattern.indexOf("*");
  return star === -1 ? pattern.length : star;
}

// The deepest guaranteed-literal directory prefix of a pattern.
// "Projects/ClientA/**" -> "Projects/ClientA"
// "Notes/*/index.md"    -> "Notes"
// "readme.md"           -> "" (root-level file, only the root is an ancestor)
function literalBasePath(pattern) {
  const segments = pattern.split("/");
  const literal = [];

  for (const seg of segments) {
    if (seg.includes("*")) {
      break;
    }

    literal.push(seg);
  }

  // A literal final segment with no wildcards is a file/dir, not a guaranteed
  // ancestor directory, so drop it unless the pattern was a directory glob.
  if (literal.length === segments.length && !pattern.endsWith("/**")) {
    literal.pop();
  }

  return literal.join("/");
}

module.exports = {
  globToRegExp,
  matchPattern,
  specificity,
  literalBasePath,
};
