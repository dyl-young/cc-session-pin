import { findSession, findSessionByPrefix, latestSessionForCwd, type SessionEntry } from "../sessions.js";
import { loadStore, saveStore, type Pin } from "../store.js";
import { uniqueAlias } from "../slug.js";

export type AddOptions = {
  sessionToken?: string;
  name?: string;
  alias?: string;
};

export async function addCommand(opts: AddOptions): Promise<void> {
  const entry = await locateSession(opts.sessionToken);

  const store = await loadStore();
  const existing = store.pins.find((p) => p.sessionId === entry.sessionId);
  if (existing) {
    existing.summary = entry.summary || existing.summary;
    existing.firstPrompt = entry.firstPrompt || existing.firstPrompt;
    existing.lastModified = entry.modified || existing.lastModified;
    if (opts.name?.trim()) existing.name = opts.name.trim();
    if (existing.status === "unpinned") {
      existing.status = "pinned";
      existing.pinnedAt = new Date().toISOString();
      await saveStore(store);
      console.log(`Re-pinned ${existing.alias} (${entry.sessionId.slice(0, 8)})`);
      return;
    }
    await saveStore(store);
    console.log(`Already pinned as ${existing.alias} (${entry.sessionId.slice(0, 8)}); cache refreshed.`);
    return;
  }

  const taken = new Set(store.pins.map((p) => p.alias));
  const name = opts.name?.trim() || entry.summary || entry.firstPrompt.slice(0, 60) || "untitled";
  const alias = opts.alias?.trim() ? assertFreeAlias(opts.alias.trim(), taken) : uniqueAlias(name, taken);

  const pin: Pin = {
    alias,
    sessionId: entry.sessionId,
    projectPath: entry.projectPath,
    name,
    pinnedAt: new Date().toISOString(),
    status: "pinned",
    summary: entry.summary,
    firstPrompt: entry.firstPrompt,
    lastModified: entry.modified,
  };

  store.pins.push(pin);
  await saveStore(store);
  console.log(`Pinned "${name}" as ${alias}  (${entry.sessionId.slice(0, 8)}, ${entry.projectPath})`);
}

async function locateSession(token: string | undefined): Promise<SessionEntry> {
  if (!token) {
    const latest = await latestSessionForCwd(process.cwd());
    if (!latest) {
      throw new Error(`No Claude Code sessions found for ${process.cwd()}. Provide a session id explicitly.`);
    }
    return latest;
  }

  if (isUuid(token)) {
    const exact = await findSession(token);
    if (!exact) throw new Error(`No session found with id ${token}.`);
    return exact;
  }

  const matches = await findSessionByPrefix(token);
  if (matches.length === 0) throw new Error(`No session found matching "${token}".`);
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m.sessionId}  ${m.summary || m.firstPrompt.slice(0, 50)}`).join("\n");
    throw new Error(`Ambiguous session prefix "${token}". Candidates:\n${list}`);
  }
  return matches[0];
}

function assertFreeAlias(alias: string, taken: Set<string>): string {
  if (taken.has(alias)) throw new Error(`Alias "${alias}" is already in use.`);
  return alias;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
