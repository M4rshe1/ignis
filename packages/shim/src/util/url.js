// True when a request URL targets the page's own origin (so it can skip the cross-origin proxy).
function isSameOrigin(url) {
  if (
    !url ||
    url.startsWith("/") ||
    url.startsWith("./") ||
    url.startsWith("../")
  ) {
    return true;
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return true;
  }
}

export { isSameOrigin };
