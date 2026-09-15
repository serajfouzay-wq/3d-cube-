# Cabinet

A local desktop application that reads the documents already scattered across a
machine, files them by company, and then writes new proposals from what it found.

Everything happens on the machine it runs on. Documents are read in the main
process and never leave it, except for the excerpts sent to a drafting model —
and only if you switch that on and supply a key.

---

## The two features

### A — Smart file scanner and organiser

1. **Scan local files** — pick a folder (Desktop, Downloads, a project archive)
   or individual documents.
2. **Phase 1, discovery.** A recursive walk that reads metadata only, so a
   folder of thousands of documents reports progress in about a second.
   `node_modules`, system folders, Office lock files, empty and oversized files
   are skipped and counted.
3. **Phase 2, reading.** Each PDF, Word, Excel and text file is opened and its
   text extracted. A classifier works out the **company** (from a "Bill to"
   label, a trading-name suffix such as *Sdn Bhd* / *Ltd* / *LLC*, or the file
   name) and the **document type**, with a confidence score. Company variants
   are merged, so "Meridian Logistics" and "Meridian Logistics Sdn Bhd" do not
   become two folders.
4. **Review before filing.** Anything scored below 0.70 lands in a review queue
   with the reason and Cabinet's best guess. Nothing is filed until you approve.
5. **Filing.** Approved documents are placed at:

   ```
   <Library folder>/<Company Name>/<Document Type>/<Cleaned_Name.ext>
   ```

   Copy is the default, so the original stays where it is. Collisions are never
   overwritten — they get a numeric suffix.

### B — Proposal generator

1. Describe what you need in plain words: *"a fixed-price proposal for Meridian
   Logistics covering a 12 week warehouse automation rollout"*.
2. Cabinet parses the request, resolves the client against companies it holds,
   and retrieves relevant passages itself. You never link or attach anything.
3. The draft is rendered as a designed document — cover page with both logos,
   photograph plates, numbered sections, a schedule band, an investment table,
   assumptions and a signature block.
4. Export to **PDF** (Chromium's own print engine, on the same HTML the preview
   shows) or **Word**, or save back into the library so the next proposal can
   draw on it.

---

## Two rules the app will not break

**The numeric firewall.** No monetary amount is ever generated — not by the
model, not by the fallback. Every draft is scanned on the way out and any figure
that appeared is replaced with `[amount to be confirmed]`. Every price is typed
by a human, and downloads stay locked until every line has one. A price a
language model invented and nobody checked is a commercial liability.

**Tenancy is a filter, not a hope.** Retrieval runs three passes: this client's
own history (everything, including their pricing — it is their file), comparable
work for *other* clients (only documents explicitly marked reusable, and never a
pricing passage), and a keyword sweep under the same rules. The filter is applied
inside the query, so material that must not be reused cannot reach the drafter
even when it scores highest. The app tells you what it excluded and why.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron 33** | Real file-system access, native dialogs, and Chromium's print engine for PDF |
| UI | **React 18 + Vite 6** | Fast HMR in development, a plain static bundle in production |
| Styling | **Tailwind CSS 3** | A design system in one config file rather than scattered CSS |
| Database | **SQLite** | `better-sqlite3` when its native binding matches Electron's ABI, `node-sqlite3-wasm` otherwise — same file, same SQL, no failed installs |
| PDF text | **pdfjs-dist** | Pure JS, and its positioned fragments are reassembled into lines so headings survive |
| Word / Excel | **mammoth**, **SheetJS** | Text extraction without Office installed |
| Drafting | **@anthropic-ai/sdk** | Optional. Without a key, drafts are assembled from retrieved passages |

### Security posture

`nodeIntegration` is off, `contextIsolation` is on, and the renderer reaches the
machine only through the explicit channel list in `electron/preload.js`. Document
text stays in the main process; the UI receives previews. The preview iframe is
fully sandboxed. Retrieved passages are fenced in the prompt and the system
prompt states they are reference material, never instruction.

---

## Running it

```bash
npm install
npm run dev      # Vite + Electron with hot reload
npm start        # production build, then launch
npm run test:e2e # 38 checks across the whole pipeline
npm run dist     # package with electron-builder
```

If `npm install` cannot build `better-sqlite3` for Electron, nothing breaks —
the WebAssembly engine takes over and Settings says so. To switch to the native
build later:

```bash
npx electron-rebuild -f -w better-sqlite3
```

### Layout

```
electron/
  main.js                 window, IPC surface, lifecycle
  preload.js              the only bridge to the renderer
  lib/
    db.js                 SQLite schema and queries (engine-agnostic)
    settings.js           brand identity and storage location
    scan.js               phase 1 — recursive discovery
    extract.js            phase 2 — PDF / DOCX / XLSX / text
    classify.js           company and document-type detection
    organize.js           physical filing, safe names, no overwrites
    chunk.js              passage splitting with section labels
    retrieve.js           intent parsing, entity resolution, retrieval
    generate.js           drafting and the numeric firewall
    document-template.js  the designed document — preview, PDF and Word
    exporters.js          PDF / Word / HTML output
src/
  App.jsx                 shell and navigation
  views/                  Dashboard · Scanner · Library · Studio · Settings
  components/ui.jsx       buttons, cards, toasts, icons
test/
  e2e.js                  end-to-end run inside a real Electron process
  fixtures.js             sample documents built on the fly
```

## Where things are kept

| What | Where |
|---|---|
| Filed documents | The library folder you choose (default `~/Documents/Cabinet Library`) |
| Index and settings | Electron's per-user data directory — shown in Settings |

The library is plain folders and files. Nothing is locked inside the app.
