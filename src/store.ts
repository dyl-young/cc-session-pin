import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PINS_DIR, PINS_FILE } from "./paths.js";

export type PinStatus = "pinned" | "unpinned";

export type Pin = {
  sessionId: string;
  projectPath: string;
  name: string;
  pinnedAt: string;
  status: PinStatus;
  summary?: string;
  firstPrompt?: string;
  lastModified?: string;
  gitBranch?: string;
};

export type PinStoreState = {
  shellHintShown?: boolean;
};

export type PinStore = {
  version: 1;
  pins: Pin[];
  state?: PinStoreState;
};

const EMPTY: PinStore = { version: 1, pins: [] };

export async function loadStore(): Promise<PinStore> {
  try {
    const raw = await readFile(PINS_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      version: number;
      pins: Array<Record<string, unknown>>;
      state?: PinStoreState;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.pins)) {
      throw new Error(`Unexpected pins.json shape at ${PINS_FILE}`);
    }
    return { version: 1, pins: parsed.pins.map(stripLegacy), state: parsed.state };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

function stripLegacy(raw: Record<string, unknown>): Pin {
  // Drop fields that are no longer part of the model (e.g. `alias`).
  const { alias: _alias, ...rest } = raw;
  return rest as Pin;
}

export async function saveStore(store: PinStore): Promise<void> {
  await mkdir(PINS_DIR, { recursive: true });
  const tmp = `${PINS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(tmp), { recursive: true });
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  await rename(tmp, PINS_FILE);
}
