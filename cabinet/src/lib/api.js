/*
 * Every call into the main process goes through here.
 *
 * The bridge returns { ok, data | error }; unwrap() turns a failure into a
 * thrown Error so views can use try/catch, and gives the UI one honest place
 * to notice that it is running outside Electron.
 */

export const isDesktop = typeof window !== 'undefined' && !!window.cabinet;

async function unwrap(promise) {
  if (!isDesktop) {
    throw new Error('This feature needs the desktop app — run "npm start" rather than the browser preview.');
  }
  const result = await promise;
  if (!result || result.ok === false) throw new Error((result && result.error) || 'Something went wrong.');
  return result.data;
}

const bridge = () => window.cabinet;

export const api = {
  info: () => unwrap(bridge().app.info()),
  openPath: (p) => unwrap(bridge().app.openPath(p)),
  revealPath: (p) => unwrap(bridge().app.revealPath(p)),

  settings: {
    get: () => unwrap(bridge().settings.get()),
    update: (patch) => unwrap(bridge().settings.update(patch)),
    chooseLibraryRoot: () => unwrap(bridge().settings.chooseLibraryRoot()),
    pickImage: () => unwrap(bridge().settings.pickImage()),
  },

  scan: {
    chooseFolder: () => unwrap(bridge().scan.chooseFolder()),
    chooseFiles: () => unwrap(bridge().scan.chooseFiles()),
    start: (roots) => unwrap(bridge().scan.start(roots)),
    cancel: () => unwrap(bridge().scan.cancel()),
    fileOne: (file) => unwrap(bridge().scan.fileOne({ file })),
    fileAll: (files) => unwrap(bridge().scan.fileAll({ files })),
    onProgress: (fn) => (isDesktop ? bridge().scan.onProgress(fn) : () => {}),
  },

  library: {
    companies: () => unwrap(bridge().library.companies()),
    documents: (company) => unwrap(bridge().library.documents(company)),
    document: (id) => unwrap(bridge().library.document(id)),
    tree: () => unwrap(bridge().library.tree()),
    stats: () => unwrap(bridge().library.stats()),
    setConfidentiality: (id, level) => unwrap(bridge().library.setConfidentiality(id, level)),
    remove: (id) => unwrap(bridge().library.remove(id)),
  },

  studio: {
    generate: (prompt) => unwrap(bridge().studio.generate(prompt)),
    preview: (payload) => unwrap(bridge().studio.preview(payload)),
    exportAs: (format, payload) => unwrap(bridge().studio.exportAs({ format, payload })),
    saveToLibrary: (payload) => unwrap(bridge().studio.saveToLibrary(payload)),
    onStage: (fn) => (isDesktop ? bridge().studio.onStage(fn) : () => {}),
  },
};
