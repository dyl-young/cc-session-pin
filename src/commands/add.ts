import { findByPrefix, latestForCwd, type SessionEntry } from "../providers/index.js";
import { loadStore, saveStore, type Pin } from "../store.js";
import { bold, dim, green, yellow } from "../colors.js";

export type AddOptions = {
  sessionToken?: string;
  name?: string;
};

export async function addCommand(opts: AddOptions): Promise<void> {
  const entry = await locateSession(opts.sessionToken);

  const store = await loadStore();
  const existing = store.pins.find((p) => p.sessionId === entry.sessionId);
  if (existing) {
    existing.summary = entry.summary || existing.summary;
    existing.firstPrompt = entry.firstPrompt || existing.firstPrompt;
    existing.lastModified = entry.modified || existing.lastModified;
    existing.gitBranch = entry.gitBranch ?? existing.gitBranch;
    if (opts.name?.trim()) existing.name = opts.name.trim();
    else if (entry.summary) existing.name = entry.summary;
    if (existing.status === "unpinned") {
      existing.status = "pinned";
      existing.pinnedAt = new Date().toISOString();
      await saveStore(store);
      printPinSummary("Re-pinned", existing);
      return;
    }
    await saveStore(store);
    printPinSummary("Already pinned", existing, { footer: "cache refreshed" });
    return;
  }

  const name = opts.name?.trim() || entry.summary || entry.firstPrompt.slice(0, 60) || "untitled";

  const pin: Pin = {
    sessionId: entry.sessionId,
    provider: entry.provider,
    projectPath: entry.projectPath,
    name,
    pinnedAt: new Date().toISOString(),
    status: "pinned",
    summary: entry.summary,
    firstPrompt: entry.firstPrompt,
    lastModified: entry.modified,
    gitBranch: entry.gitBranch || undefined,
  };

  store.pins.push(pin);
  await saveStore(store);
  printPinSummary("Pinned", pin);
}

function printPinSummary(verb: string, pin: Pin, opts: { footer?: string } = {}): void {
  console.log(bold(`⚲ ${verb} "${pin.name}"`));
  console.log(
    `  ${dim("id")}  ${green(pin.sessionId)}   ${dim("·")}   ${dim(pin.projectPath)}`,
  );
  if (opts.footer) console.log(`  ${yellow(opts.footer)}`);
}

async function locateSession(token: string | undefined): Promise<SessionEntry> {
  if (!token) {
    const latest = await latestForCwd(process.cwd());
    if (!latest) {
      throw new Error(`No agent sessions found for ${process.cwd()}. Provide a session id explicitly.`);
    }
    return latest;
  }

  const matches = await findByPrefix(token);
  if (matches.length === 0) throw new Error(`No session found matching "${token}".`);
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m.sessionId}  ${m.summary || m.firstPrompt.slice(0, 50)}`).join("\n");
    throw new Error(`Ambiguous session prefix "${token}". Candidates:\n${list}`);
  }
  return matches[0];
}
