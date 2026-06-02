// Override window.requestUrl to proxy external requests through our server, bypassing CORS.
// Obsidian sets window.requestUrl in app.js, so we override it after app.js loads.

import { isSameOrigin } from "./util/url.js";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./util/base64.js";

async function proxyRequestUrl(request) {
  if (typeof request === "string") {
    request = { url: request };
  }

  // Same-origin requests don't need the proxy.
  if (isSameOrigin(request.url)) {
    const res = await fetch(request.url, {
      method: request.method || "GET",
      headers: request.headers || {},
      body: request.body,
    });

    const arrayBuf = await res.arrayBuffer();

    return makeResponse(
      request,
      res.status,
      Object.fromEntries(res.headers),
      arrayBuf,
    );
  }

  // Cross-origin: route through server proxy
  let body = request.body;
  let binary = false;

  if (body instanceof ArrayBuffer) {
    body = arrayBufferToBase64(body);
    binary = true;
  }

  const res = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: request.url,
      method: request.method || "GET",
      headers: request.headers || {},
      body,
      binary,
    }),
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: "Proxy request failed" }));
    throw new Error(err.error);
  }

  const proxyResult = await res.json();
  const arrayBuf = base64ToArrayBuffer(proxyResult.body);

  return makeResponse(
    request,
    proxyResult.status,
    proxyResult.headers,
    arrayBuf,
  );
}

function makeResponse(request, status, headers, arrayBuf) {
  const text = new TextDecoder().decode(arrayBuf);
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status, headers, arrayBuffer: arrayBuf, text, json };
}

export function installRequestUrlShim() {
  // Obsidian sets window.requestUrl in app.js. We override it once the page loads.
  // Use a getter so it intercepts even if app.js sets it later.
  let _original = null;

  Object.defineProperty(window, "requestUrl", {
    get() {
      return proxyRequestUrl;
    },
    set(val) {
      _original = val;
    },
    configurable: true,
  });
}
