import { promises as fs } from "node:fs";
import path from "node:path";
import type { SignatureRecord } from "./types";

/**
 * Prototype persistence: a JSON file on disk, mirrored by an in-memory array.
 * Swap `load`/`save` for Postgres/Redis/S3 later — nothing else needs to change.
 */
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "signatures.json");
const MAX_SIGNATURES = 2000;

type Store = { items: SignatureRecord[] | null; writing: Promise<void> };

// Survive Next.js hot-reloads (module scope is re-evaluated on every edit).
const globalStore = globalThis as unknown as { __signatureStore?: Store };
const store: Store = (globalStore.__signatureStore ??= { items: null, writing: Promise.resolve() });

async function load(): Promise<SignatureRecord[]> {
  if (store.items) return store.items;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    store.items = Array.isArray(parsed) ? (parsed as SignatureRecord[]) : [];
  } catch {
    store.items = [];
  }
  return store.items;
}

function save(items: SignatureRecord[]) {
  // Serialize writes so concurrent POSTs can't interleave and truncate the file.
  store.writing = store.writing
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DATA_FILE, JSON.stringify(items), "utf8");
    })
    .catch((err) => {
      console.warn("[store] could not persist signatures:", err);
    });
  return store.writing;
}

export async function listSignatures(): Promise<SignatureRecord[]> {
  return [...(await load())];
}

export async function addSignature(
  input: Omit<SignatureRecord, "id" | "createdAt">,
): Promise<SignatureRecord> {
  const items = await load();
  const record: SignatureRecord = {
    ...input,
    id: `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  items.push(record);
  if (items.length > MAX_SIGNATURES) items.splice(0, items.length - MAX_SIGNATURES);
  await save(items);
  return record;
}

export async function clearSignatures(): Promise<void> {
  const items = await load();
  items.length = 0;
  await save(items);
}
