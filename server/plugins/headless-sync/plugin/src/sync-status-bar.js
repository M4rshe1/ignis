const { setIcon } = require("obsidian");
const api = require("./api");

const TOOLTIP_MAP = {
  running: "Syncing...",
  synced: "Synced",
  stopped: "Sync stopped",
  error: "Sync error",
};

function initSyncStatusBar(plugin, wsListener) {
  const vaultId = plugin.app.vault.getName();
  const item = plugin.addStatusBarItem();
  item.addClass("ignis-sync-statusbar");
  item.style.display = "none";

  const iconEl = item.createEl("span", { cls: "ignis-sync-icon" });
  setIcon(iconEl, "refresh-cw");

  let popoverEl = null;
  let popoverOpen = false;
  let currentStatus = "stopped";
  let outsideClickHandler = null;

  function updateState(status, error) {
    currentStatus = status;

    iconEl.className = "ignis-sync-icon";

    if (status === "running") {
      iconEl.addClass("ignis-sync-syncing");
      iconEl.addClass("ignis-sync-spinning");
    } else if (status === "error") {
      iconEl.addClass("ignis-sync-error");
    } else if (status === "stopped") {
      iconEl.addClass("ignis-sync-stopped");
    } else {
      iconEl.addClass("ignis-sync-synced");
    }

    const tooltip = error || TOOLTIP_MAP[status] || status;
    item.setAttribute("aria-label", tooltip);
    item.setAttribute("data-tooltip-position", "top");
  }

  function showPopover(text) {
    if (popoverEl) {
      const span = popoverEl.querySelector(".ignis-sync-popover-filename");

      if (span) {
        span.textContent = text;
      }

      return;
    }

    popoverEl = item.createEl("div", { cls: "ignis-sync-popover" });
    popoverEl.createEl("span", {
      text: text,
      cls: "ignis-sync-popover-filename",
    });

    popoverOpen = true;

    outsideClickHandler = (e) => {
      if (!item.contains(e.target)) {
        hidePopover();
      }
    };

    setTimeout(() => {
      document.addEventListener("click", outsideClickHandler, true);
    }, 0);
  }

  function hidePopover() {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }

    if (outsideClickHandler) {
      document.removeEventListener("click", outsideClickHandler, true);
      outsideClickHandler = null;
    }

    popoverOpen = false;
  }

  function truncatePath(path, maxLen) {
    if (path.length <= maxLen) {
      return path;
    }

    return "\u2026" + path.slice(-(maxLen - 1));
  }

  function formatPopoverText(prefix, path) {
    return `${prefix}: ${truncatePath(path, 46 - prefix.length)}`;
  }

  function updatePopoverText(text) {
    if (!popoverOpen) {
      return;
    }

    const span = popoverEl?.querySelector(".ignis-sync-popover-filename");

    if (span) {
      span.textContent = text;
    }
  }

  function extractFileActivity(line) {
    // Downloading/Downloaded path
    let match = line.match(/^(?:Downloading|Downloaded)\s+(.+)$/);

    if (match) {
      return { prefix: "Syncing", path: match[1].trim() };
    }

    // Deleting path
    match = line.match(/^Deleting\s+(.+)$/);

    if (match) {
      return { prefix: "Deleting", path: match[1].trim() };
    }

    // Push: path (updated)
    match = line.match(/^Push:\s+(.+?)\s+\(updated\)$/);

    if (match) {
      return { prefix: "Syncing", path: match[1].trim() };
    }

    // Push: path (deleted)
    match = line.match(/^Push:\s+(.+?)\s+\(deleted\)$/);

    if (match) {
      return { prefix: "Deleting", path: match[1].trim() };
    }

    return null;
  }

  function isFullySynced(line) {
    return /Fully synced/i.test(line);
  }

  // Click toggles popover
  item.addEventListener("click", () => {
    if (popoverOpen) {
      hidePopover();
    } else {
      showPopover(TOOLTIP_MAP[currentStatus] || currentStatus);
    }
  });

  // Listen for status updates
  const onStatus = (payload) => {
    if (payload.vaultId !== vaultId) {
      return;
    }

    item.style.display = "";

    // "running" from server means the process is alive, but we refine
    // the visual state based on log activity.
    if (payload.status === "running") {
      updateState("synced");
    } else {
      updateState(payload.status, payload.error);
    }
  };

  wsListener.on("sync-status", onStatus);

  // Debounce the transition to "synced" state to avoid flickering
  // during rapid delete cycles (Fully synced -> Deleting -> Fully synced).
  let syncedTimer = null;

  function deferSynced() {
    if (syncedTimer) {
      clearTimeout(syncedTimer);
    }

    syncedTimer = setTimeout(() => {
      syncedTimer = null;
      updateState("synced");
      updatePopoverText("Synced");
    }, 2000);
  }

  function cancelDeferredSynced() {
    if (syncedTimer) {
      clearTimeout(syncedTimer);
      syncedTimer = null;
    }
  }

  // Listen for log lines
  const onLog = (payload) => {
    if (payload.vaultId !== vaultId) {
      return;
    }

    if (isFullySynced(payload.line)) {
      deferSynced();
      return;
    }

    const activity = extractFileActivity(payload.line);

    if (activity) {
      cancelDeferredSynced();
      updateState("running");
      updatePopoverText(formatPopoverText(activity.prefix, activity.path));
    }
  };

  wsListener.on("sync-log", onLog);

  // Fetch initial state
  api
    .getVaults()
    .then((data) => {
      const vaults = data.vaults || [];
      const vault = vaults.find((v) => v.vaultId === vaultId);

      if (vault) {
        item.style.display = "";
        updateState(vault.status, vault.error);
      }
    })
    .catch(() => {});

  // Poll WebSocket state to detect server disconnect/reconnect
  let wasDisconnected = false;

  const wsCheckInterval = setInterval(() => {
    const ws = window.__ignisWs;
    const disconnected = !ws || ws.readyState !== WebSocket.OPEN;

    if (disconnected && currentStatus === "running") {
      updateState("error", "Server connection lost");
      wasDisconnected = true;
    } else if (!disconnected && wasDisconnected) {
      wasDisconnected = false;

      api
        .getVaults()
        .then((data) => {
          const vaults = data.vaults || [];
          const vault = vaults.find((v) => v.vaultId === vaultId);

          if (vault) {
            updateState(vault.status, vault.error);
          }
        })
        .catch(() => {});
    }
  }, 3000);

  // Return cleanup function
  return () => {
    clearInterval(wsCheckInterval);
    cancelDeferredSynced();
    wsListener.off("sync-status", onStatus);
    wsListener.off("sync-log", onLog);
    hidePopover();
  };
}

module.exports = { initSyncStatusBar };
