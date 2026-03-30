const { PluginSettingTab, Setting, Notice } = require("obsidian");
const api = require("./api");
const auth = require("./auth");

class HeadlessSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this._cancelWait = null;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    let serverStatus;

    try {
      serverStatus = await api.getStatus();
    } catch (e) {
      containerEl.createEl("p", {
        text: "Failed to connect to Headless Sync server plugin.",
        cls: "mod-warning",
      });
      return;
    }

    if (!serverStatus.installed) {
      containerEl.createEl("p", {
        text: "obsidian-headless (ob CLI) is not installed on the server. Install it to enable sync.",
        cls: "mod-warning",
      });
      return;
    }

    this.renderAuthSection(containerEl, serverStatus);
    await this.renderSyncSection(containerEl, serverStatus.authenticated);
  }

  renderAuthSection(containerEl, serverStatus) {
    const localToken = auth.getObsidianSyncToken();

    if (serverStatus.authenticated) {
      // State C: connected to server
      new Setting(containerEl)
        .setName("Obsidian Sync account")
        .setDesc(
          `Signed in as ${serverStatus.name || "unknown"} (${serverStatus.email || "unknown"})`,
        )
        .addButton((btn) => {
          btn.setButtonText("Disconnect");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api.logout();
              new Notice("Disconnected from Headless Sync");
              this.display();
            } catch (e) {
              new Notice(`Failed to disconnect: ${e.message}`);
            }
          });
        });
    } else if (localToken) {
      // State B: signed into Obsidian, not connected to server
      new Setting(containerEl)
        .setName("Obsidian Sync account detected")
        .setDesc(`${localToken.name} (${localToken.email})`)
        .addButton((btn) => {
          btn
            .setButtonText("Use this account for Headless Sync")
            .setCta()
            .onClick(async () => {
              try {
                await auth.sendTokenToServer(localToken);
                new Notice("Connected to Headless Sync");
                this.display();
              } catch (e) {
                new Notice(`Failed to connect: ${e.message}`);
              }
            });
        });
    } else {
      // State A: not signed into Obsidian
      new Setting(containerEl)
        .setName("Obsidian Sync account")
        .setDesc("Sign in to your Obsidian account to enable sync.")
        .addButton((btn) => {
          btn.setButtonText("Log in to Obsidian Sync").onClick(() => {
              const triggered = auth.triggerLogin(this.app);

              if (!triggered) {
                new Notice("Could not open login dialog. Try logging in from Settings > General.");
                return;
              }

              this._cancelWait = auth.waitForLogin((token) => {
                this._cancelWait = null;

                if (token) {
                  new Notice(`Detected login: ${token.name}`);
                  this.display();
                }
              });
            });
        });
    }
  }

  async renderSyncSection(containerEl, authenticated) {
    containerEl.createEl("h3", { text: "Vault sync" });

    if (!authenticated) {
      new Setting(containerEl)
        .setName("Sync not configured")
        .setDesc("Sign in to your Obsidian Sync account to set up sync.")
        .addButton((btn) => {
          btn.setButtonText("Set up sync");
          btn.buttonEl.disabled = true;
        });

      return;
    }

    const vaultId = this.app.vault.getName();

    let vaultsData;

    try {
      vaultsData = await api.getVaults();
    } catch (e) {
      containerEl.createEl("p", {
        text: `Failed to load sync state: ${e.message}`,
        cls: "mod-warning",
      });
      return;
    }

    const vaultState = vaultsData.vaults.find((v) => v.vaultId === vaultId);

    if (!vaultState) {
      new Setting(containerEl)
        .setName("Sync not configured")
        .setDesc("This vault has not been linked to a remote vault yet.")
        .addButton((btn) => {
          btn
            .setButtonText("Set up sync")
            .setCta()
            .onClick(() => {
              const scope = this.app.setting.scope;
              const prevFocusContainer = scope.tabFocusContainerEl;
              scope.tabFocusContainerEl = null;

              const cleanup = () => {
                scope.tabFocusContainerEl = prevFocusContainer;
              };

              const modal = new window.IgnisUI.SyncSetupModal({
                target: document.body,
                props: {
                  vaultId,
                  onSuccess: () => {
                    cleanup();
                    modal.$destroy();
                    this.display();
                  },
                },
              });

              modal.$on("close", () => {
                cleanup();
                modal.$destroy();
              });
            });
        });

      return;
    }

    // Show current sync config
    new Setting(containerEl)
      .setName("Remote vault")
      .setDesc(vaultState.remoteVaultName || vaultState.remoteVault || "unknown")
      .addButton((btn) => {
        btn.setButtonText("Unlink");
        btn.buttonEl.addClass("mod-destructive");
        btn.onClick(async () => {
          try {
            await api.unlinkVault(vaultId);
            new Notice("Vault unlinked");
            this.display();
          } catch (e) {
            new Notice(`Failed to unlink: ${e.message}`);
          }
        });
      });

    new Setting(containerEl)
      .setName("Sync mode")
      .setDesc(vaultState.config?.mode || "bidirectional");

    // Sync controls
    const statusText =
      vaultState.status === "running"
        ? "Sync is running"
        : vaultState.status === "error"
          ? `Error: ${vaultState.error}`
          : "Sync is stopped";

    new Setting(containerEl)
      .setName("Status")
      .setDesc(statusText)
      .addButton((btn) => {
        if (vaultState.status === "running") {
          btn.setButtonText("Stop sync");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api.stopSync(vaultId);
              new Notice("Sync stopped");
              this.display();
            } catch (e) {
              new Notice(`Failed to stop: ${e.message}`);
            }
          });
        } else {
          btn.setButtonText("Start sync").setCta().onClick(async () => {
            try {
              await api.startSync(vaultId);
              new Notice("Sync started");
              this.display();
            } catch (e) {
              new Notice(`Failed to start: ${e.message}`);
            }
          });
        }
      });

    // Log viewer (collapsible)
    await this.renderLogs(containerEl, vaultId);
  }

  async renderLogs(containerEl, vaultId) {
    const details = containerEl.createEl("details", {
      cls: "ignis-log-details",
    });

    details.createEl("summary", { text: "Sync logs" });

    const logBox = details.createEl("pre", { cls: "ignis-log-terminal" });
    const codeEl = logBox.createEl("code");

    let logsData;

    try {
      logsData = await api.getLogs(vaultId, 50);
    } catch (e) {
      codeEl.textContent = `Failed to load logs: ${e.message}`;
      return;
    }

    if (logsData.logs.length === 0) {
      codeEl.textContent = "No log entries yet.";
    } else {
      const lines = logsData.logs.map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `[${time}] ${entry.line}`;
      });

      codeEl.textContent = lines.join("\n");
    }

    logBox.scrollTop = logBox.scrollHeight;

    // Live updates via WebSocket
    const wsListener = this.plugin.wsListener;

    if (!wsListener) {
      return;
    }

    const onLog = (payload) => {
      if (payload.vaultId !== vaultId) {
        return;
      }

      const time = new Date().toLocaleTimeString();
      const line = `[${time}] ${payload.line}`;

      if (codeEl.textContent === "No log entries yet.") {
        codeEl.textContent = line;
      } else {
        codeEl.textContent += "\n" + line;
      }

      const isNearBottom =
        logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 50;

      if (isNearBottom) {
        logBox.scrollTop = logBox.scrollHeight;
      }
    };

    wsListener.on("sync-log", onLog);
    this._logCleanup = () => wsListener.off("sync-log", onLog);
  }

  hide() {
    if (this._cancelWait) {
      this._cancelWait();
      this._cancelWait = null;
    }

    if (this._logCleanup) {
      this._logCleanup();
      this._logCleanup = null;
    }

    super.hide();
  }
}

module.exports = { HeadlessSyncSettingTab };
