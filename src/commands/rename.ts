import { resolveOrThrow } from "../resolve.js";
import { loadStore, saveStore } from "../store.js";

export async function renameCommand(token: string, newName: string): Promise<void> {
  if (!newName.trim()) throw new Error("New name cannot be empty.");
  const store = await loadStore();
  const pin = resolveOrThrow(store.pins, token);
  const old = pin.name;
  pin.name = newName.trim();
  await saveStore(store);
  console.log(`Renamed: "${old}" → "${pin.name}" (${pin.sessionId}).`);
}
