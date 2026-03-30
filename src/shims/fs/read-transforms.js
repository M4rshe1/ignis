// Post-read transforms for specific file paths.
// Allows patching file content after reading but before returning to the caller.
// Used to prevent synced config files from activating conflicting features.

const transforms = new Map();

function normalize(p) {
  return (p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function registerReadTransform(path, fn) {
  transforms.set(normalize(path), fn);
}

export function removeReadTransform(path) {
  transforms.delete(normalize(path));
}

export function applyReadTransform(path, data) {
  const norm = normalize(path);
  const fn = transforms.get(norm);

  if (!fn) {
    return data;
  }

  try {
    return fn(data);
  } catch {
    return data;
  }
}

export function hasReadTransform(path) {
  return transforms.has(normalize(path));
}
