const { Plugin, Setting, Notice, TFile, TFolder } = require("obsidian");

window.__obsidianAPI = require("obsidian");

function getVaultId() {
  return window.__currentVaultId || "";
}

function triggerDownload(endpoint, filePath, downloadName) {
  const vaultId = getVaultId();
  const url =
    `/api/fs/${endpoint}` +
    `?vault=${encodeURIComponent(vaultId)}` +
    `&path=${encodeURIComponent(filePath)}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  a.click();
}

function createNavEl(tab, setting) {
  const nav = document.createElement("div");
  nav.className = "vertical-tab-nav-item tappable";

  const title = document.createElement("div");
  title.className = "vertical-tab-nav-item-title";
  title.textContent = tab.name;
  nav.appendChild(title);

  const chevron = document.createElement("div");
  chevron.className = "vertical-tab-nav-item-chevron";
  nav.appendChild(chevron);

  nav.addEventListener("click", () => {
    setting.openTab(tab);
  });

  return nav;
}

function createIgnisTab(id, name, displayFn) {
  const tab = {
    id,
    name,
    containerEl: createDiv("vertical-tab-content"),
    navEl: null,

    display() {
      this.containerEl.empty();
      displayFn(this.containerEl);
    },

    hide() {
      this.containerEl.empty();
    },
  };

  return tab;
}

class IgnisBridgePlugin extends Plugin {
  async onload() {
    console.log("[ignis-bridge] Plugin loaded");

    this.patchSettingsModal();

    this.addRibbonIcon("upload", "Upload file", () => {
      this.showFilePicker();
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) {
          this.addFileMenuItems(menu, file);
        } else if (file instanceof TFolder) {
          this.addFolderMenuItems(menu, file);
        }
      }),
    );
  }

  patchSettingsModal() {
    const original = this.app.setting.onOpen;
    const self = this;
    this._originalOnOpen = original;

    this.app.setting.onOpen = function () {
      original.call(this);
      self.injectIgnisSettings(this);
    };
  }

  injectIgnisSettings(setting) {
    const group = document.createElement("div");
    group.className = "vertical-tab-header-group";

    const title = document.createElement("div");
    title.className = "vertical-tab-header-group-title";
    title.textContent = "Ignis";
    group.appendChild(title);

    const items = document.createElement("div");
    items.className = "vertical-tab-header-group-items";
    group.appendChild(items);

    const generalTab = createIgnisTab(
      "ignis-general",
      "General",
      (containerEl) => {
        containerEl.createEl("h2", { text: "Ignis General Settings" });

        new Setting(containerEl)
          .setName("Example toggle")
          .setDesc("This is a test toggle to prove the Setting API works.")
          .addToggle((toggle) => {
            toggle.setValue(false);
            toggle.onChange((value) => {
              console.log("[ignis] Toggle:", value);
            });
          });
      },
    );

    const pluginsTab = createIgnisTab(
      "ignis-server-plugins",
      "Server Plugins",
      (containerEl) => {
        containerEl.createEl("h2", { text: "Server Plugins" });

        new Setting(containerEl)
          .setName("Example text input")
          .setDesc("This is a test input to prove a second tab works.")
          .addText((text) => {
            text.setPlaceholder("Type something...");
          });
      },
    );

    generalTab.navEl = createNavEl(generalTab, setting);
    pluginsTab.navEl = createNavEl(pluginsTab, setting);

    items.appendChild(generalTab.navEl);
    items.appendChild(pluginsTab.navEl);

    setting.tabHeadersEl.appendChild(group);
  }

  addFileMenuItems(menu, file) {
    menu.addItem((item) => {
      item
        .setTitle("Download")
        .setIcon("download")
        .onClick(() => triggerDownload("download", file.path, file.name));
    });
  }

  addFolderMenuItems(menu, folder) {
    menu.addItem((item) => {
      item
        .setTitle("Download as ZIP")
        .setIcon("download")
        .onClick(() =>
          triggerDownload("download-zip", folder.path, `${folder.name}.zip`),
        );
    });

    menu.addItem((item) => {
      item
        .setTitle("Upload file")
        .setIcon("upload")
        .onClick(() => this.showFilePicker(folder));
    });
  }

  showFilePicker(targetFolder = null) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;

      const folder = targetFolder || this.app.vault.getRoot();
      const folderPath = folder.path;

      new Notice(`Uploading ${files.length} file(s)...`);

      let successCount = 0;
      let errorCount = 0;

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const targetPath = folderPath
            ? `${folderPath}/${file.name}`
            : file.name;

          await this.app.vault.createBinary(targetPath, arrayBuffer);
          successCount++;
        } catch (e) {
          console.error("[ignis-bridge] Upload failed:", file.name, e);
          errorCount++;
        }
      }

      if (successCount > 0) {
        new Notice(`Uploaded ${successCount} file(s) successfully`);
      }

      if (errorCount > 0) {
        new Notice(`Failed to upload ${errorCount} file(s)`, 5000);
      }

      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  }

  onunload() {
    if (this._originalOnOpen) {
      this.app.setting.onOpen = this._originalOnOpen;
    }

    console.log("[ignis-bridge] Plugin unloaded");
  }
}

module.exports = IgnisBridgePlugin;
