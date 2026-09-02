import { resolveOrThrow } from "../resolve.js";
import { loadStore, saveStore } from "../store.js";
import { bold, dim, green } from "../colors.js";

export async function rmCommand(token: string): Promise<void> {
  const store = await loadStore();
  const pin = resolveOrThrow(store.pins, token);
  if (pin.status === "unpinned") {
    console.log(`"${pin.name}" is already unpinned. Use \`pin purge\` to delete it.`);
    return;
  }
  pin.status = "unpinned";
  await saveStore(store);
  printUnpinned(pin.name, pin.sessionId);
}

export async function rmByCwd(cwd: string): Promise<void> {
  const store = await loadStore();
  const matches = store.pins.filter((p) => p.projectPath === cwd && p.status === "pinned");
  if (matches.length === 0) throw new Error(`No pinned sessions in ${cwd}.`);
  matches.sort((a, b) => (b.pinnedAt || "").localeCompare(a.pinnedAt || ""));
  const target = matches[0];
  target.status = "unpinned";
  await saveStore(store);
  printUnpinned(target.name, target.sessionId);
}

function printUnpinned(name: string, sessionId: string): void {
  console.log(bold(`✗ Unpinned "${name}"`));
  console.log(`  ${dim("id")}  ${green(sessionId)}`);
}
