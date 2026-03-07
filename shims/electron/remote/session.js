// Shim for remote.session
// Mostly no-op; Obsidian's use is minimal

export const sessionShim = {
  defaultSession: {
    clearCache() {
      return Promise.resolve();
    },

    clearStorageData() {
      return Promise.resolve();
    },

    setSpellCheckerLanguages(langs) {},
    getSpellCheckerLanguages() { return []; },

    on() {},
    once() {},
    removeListener() {},
  },
};
