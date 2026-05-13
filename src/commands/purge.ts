import { loadStore, saveStore } from "../store.js";

export async function purgeCommand(): Promise<void> {
  const store = await loadStore();
  const before = store.pins.length;
  store.pins = store.pins.filter((p) => p.status !== "unpinned");
  const removed = before - store.pins.length;
  if (removed === 0) {
    console.log("Nothing to purge.");
    return;
  }
  await saveStore(store);
  console.log(`Purged ${removed} unpinned ${removed === 1 ? "entry" : "entries"}.`);
}
