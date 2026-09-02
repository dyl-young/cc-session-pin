import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { PINS_DIR, PINS_FILE } from "./paths.js";
import type { ProviderId } from "./providers/types.js";

export type PinStatus = "pinned" | "unpinned";

export type Pin = {
  sessionId: string;
  provider: ProviderId;
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
    const parsed = JSON.parse(raw) as PinStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.pins)) {
      throw new Error(`Unexpected pins.json shape at ${PINS_FILE}`);
    }
    const pins = parsed.pins.map((p) => ({ ...p, provider: p.provider ?? "claude" }));
    return { version: 1, pins, state: parsed.state };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

export async function saveStore(store: PinStore): Promise<void> {
  await mkdir(PINS_DIR, { recursive: true });
  const tmp = `${PINS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  await rename(tmp, PINS_FILE);
}
