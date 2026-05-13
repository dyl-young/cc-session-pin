import { resolvePin } from "../resolve.js";
import { loadStore, saveStore } from "../store.js";
import { bold } from "../colors.js";

export async function rmCommand(token: string): Promise<void> {
  const store = await loadStore();
  const result = resolvePin(store.pins, token);
  if (!result.ok) {
    if (result.reason === "not-found") throw new Error(`No pin matches "${token}".`);
    const list = result.candidates.map((p) => `  ${p.alias}  ${p.sessionId}  ${p.name}`).join("\n");
    throw new Error(`Ambiguous token "${token}". Candidates:\n${list}`);
  }
  if (result.pin.status === "unpinned") {
    console.log(`${result.pin.alias} is already unpinned. Use \`cc-pin purge\` to delete it.`);
    return;
  }
  result.pin.status = "unpinned";
  await saveStore(store);
  console.log(`${bold("✗ Unpinned")} ${result.pin.alias} (${result.pin.sessionId.slice(0, 8)}).`);
}

export async function rmByCwd(cwd: string): Promise<void> {
  const store = await loadStore();
  const matches = store.pins.filter((p) => p.projectPath === cwd && p.status === "pinned");
  if (matches.length === 0) throw new Error(`No pinned sessions in ${cwd}.`);
  matches.sort((a, b) => (b.pinnedAt || "").localeCompare(a.pinnedAt || ""));
  const target = matches[0];
  target.status = "unpinned";
  await saveStore(store);
  console.log(`${bold("✗ Unpinned")} ${target.alias} (${target.sessionId.slice(0, 8)}).`);
}
