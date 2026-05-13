import { resolvePin } from "../resolve.js";
import { loadStore, saveStore } from "../store.js";

export async function renameCommand(token: string, newName: string): Promise<void> {
  if (!newName.trim()) throw new Error("New name cannot be empty.");
  const store = await loadStore();
  const result = resolvePin(store.pins, token);
  if (!result.ok) {
    if (result.reason === "not-found") throw new Error(`No pin matches "${token}".`);
    const list = result.candidates.map((p) => `  ${p.alias}  ${p.sessionId}  ${p.name}`).join("\n");
    throw new Error(`Ambiguous token "${token}". Candidates:\n${list}`);
  }
  const old = result.pin.name;
  result.pin.name = newName.trim();
  await saveStore(store);
  console.log(`Renamed ${result.pin.alias}: "${old}" → "${result.pin.name}".`);
}
