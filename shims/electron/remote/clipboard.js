// Shim for remote.clipboard
// Obsidian uses: readText, writeText, readImage, writeImage, readHTML, writeHTML

export const clipboardShim = {
  readText() {
    // navigator.clipboard.readText() is async; return empty for sync calls
    // TODO: maintain a local mirror updated via async reads
    return '';
  },

  writeText(text) {
    navigator.clipboard.writeText(text).catch((e) => {
      console.warn('[shim:clipboard] writeText failed:', e);
    });
  },

  readHTML() {
    return '';
  },

  writeHTML(html) {
    // TODO: use clipboard API with text/html mime type
    console.log('[shim:clipboard] writeHTML (stub)');
  },

  readImage() {
    // TODO: implement if needed
    return { isEmpty: () => true, toPNG: () => new Uint8Array(0) };
  },

  writeImage(image) {
    console.log('[shim:clipboard] writeImage (stub)');
  },

  has(format) {
    return false;
  },

  read(format) {
    return '';
  },

  clear() {
    navigator.clipboard.writeText('').catch(() => {});
  },
};
