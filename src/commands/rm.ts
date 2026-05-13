import { resolvePin } from "../resolve.js";
import { loadStore, saveStore } from "../store.js";
import { bold, dim, green } from "../colors.js";

export async function rmCommand(token: string): Promise<void> {
  const store = await loadStore();
  const result = resolvePin(store.pins, token);
  if (!result.ok) {
    if (result.reason === "not-found") throw new Error(`No pin matches "${token}".`);
    throw new Error(`Ambiguous token "${token}". Candidates:\n${formatCandidates(result.candidates)}`);
  }
  if (result.pin.status === "unpinned") {
    console.log(`"${result.pin.name}" is already unpinned. Use \`cc-pin purge\` to delete it.`);
    return;
  }
  result.pin.status = "unpinned";
  await saveStore(store);
  printUnpinned(result.pin.name, result.pin.sessionId);
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

function formatCandidates(candidates: { sessionId: string; name: string }[]): string {
  return candidates.map((c) => `  ${c.sessionId}  ${c.name}`).join("\n");
}
