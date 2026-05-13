import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PINS_DIR, PINS_FILE } from "./paths.js";

export type PinStatus = "pinned" | "unpinned";

export type Pin = {
  alias: string;
  sessionId: string;
  projectPath: string;
  name: string;
  pinnedAt: string;
  status: PinStatus;
  summary?: string;
  firstPrompt?: string;
  lastModified?: string;
};

export type PinStore = {
  version: 1;
  pins: Pin[];
};

const EMPTY: PinStore = { version: 1, pins: [] };

export async function loadStore(): Promise<PinStore> {
  try {
    const raw = await readFile(PINS_FILE, "utf8");
    const parsed = JSON.parse(raw) as PinStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.pins)) {
      throw new Error(`Unexpected pins.json shape at ${PINS_FILE}`);
    }
    return parsed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

export async function saveStore(store: PinStore): Promise<void> {
  await mkdir(PINS_DIR, { recursive: true });
  const tmp = `${PINS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(tmp), { recursive: true });
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  await rename(tmp, PINS_FILE);
}
