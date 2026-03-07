// Shim for remote.shell
// Obsidian uses: openExternal, openPath, showItemInFolder

export const shellShim = {
  openExternal(url) {
    window.open(url, '_blank');
    return Promise.resolve();
  },

  openPath(filePath) {
    // TODO: could trigger a server-side download or preview
    console.log('[shim:shell] openPath (stub):', filePath);
    return Promise.resolve('');
  },

  showItemInFolder(filePath) {
    // No OS file manager in browser context
    console.log('[shim:shell] showItemInFolder (stub):', filePath);
  },
};
