import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { PROJECTS_DIR, encodeProjectPath, projectIndexFile } from "./paths.js";

export type SessionEntry = {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
  projectPath: string;
  isSidechain?: boolean;
};

type SessionsIndex = {
  version: number;
  entries: SessionEntry[];
};

async function readIndex(indexPath: string): Promise<SessionEntry[]> {
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as SessionsIndex;
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
}

export async function readSessionsForProject(projectPath: string): Promise<SessionEntry[]> {
  const indexed = await readIndex(projectIndexFile(projectPath));
  if (indexed.length > 0) return indexed;
  return scanProjectDir(projectPath);
}

async function scanProjectDir(projectPath: string): Promise<SessionEntry[]> {
  const dir = join(PROJECTS_DIR, encodeProjectPath(projectPath));
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const jsonls = entries.filter((e) => extname(e) === ".jsonl");
  const out: SessionEntry[] = [];
  for (const file of jsonls) {
    const full = join(dir, file);
    const sessionId = file.slice(0, -".jsonl".length);
    try {
      const stats = await stat(full);
      const firstPrompt = await readFirstUserPrompt(full);
      out.push({
        sessionId,
        fullPath: full,
        fileMtime: stats.mtimeMs,
        firstPrompt,
        summary: firstPrompt.slice(0, 60),
        messageCount: 0,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        projectPath,
        isSidechain: false,
      });
    } catch {
      // ignore unreadable files
    }
  }
  return out;
}

async function readFirstUserPrompt(jsonlPath: string): Promise<string> {
  try {
    const raw = await readFile(jsonlPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      let parsed: { type?: string; message?: { role?: string; content?: unknown } };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.type !== "user" || parsed.message?.role !== "user") continue;
      const c = parsed.message.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? extractText(c) : "";
      const trimmed = text.trim();
      if (trimmed) return trimmed.slice(0, 200);
    }
  } catch {
    // fall through
  }
  return "";
}

function extractText(parts: unknown[]): string {
  for (const p of parts) {
    if (p && typeof p === "object" && "text" in p && typeof (p as { text: unknown }).text === "string") {
      return (p as { text: string }).text;
    }
  }
  return "";
}

export async function findSession(sessionId: string): Promise<SessionEntry | undefined> {
  for await (const entry of iterAllSessions()) {
    if (entry.sessionId === sessionId) return entry;
  }
  return undefined;
}

export async function findSessionByPrefix(prefix: string): Promise<SessionEntry[]> {
  const matches: SessionEntry[] = [];
  for await (const entry of iterAllSessions()) {
    if (entry.sessionId.startsWith(prefix)) matches.push(entry);
  }
  return matches;
}

async function* iterAllSessions(): AsyncGenerator<SessionEntry> {
  const dirs = await listProjectDirs();
  for (const dir of dirs) {
    const indexed = await readIndex(join(PROJECTS_DIR, dir, "sessions-index.json"));
    const known = new Set<string>();
    for (const e of indexed) {
      known.add(e.sessionId);
      yield e;
    }
    // Sessions not yet in the index (e.g. live ones) — pull from raw jsonls.
    // We pass projectPath via the index when available; otherwise we can't recover
    // the un-encoded path, so we skip the synth scan.
    if (indexed.length === 0) continue;
    const projectPath = indexed[0].projectPath;
    const scanned = await scanProjectDir(projectPath);
    for (const s of scanned) {
      if (!known.has(s.sessionId)) yield s;
    }
  }
}

export async function latestSessionForCwd(cwd: string): Promise<SessionEntry | undefined> {
  const entries = await readSessionsForProject(cwd);
  if (entries.length === 0) return undefined;
  return entries
    .filter((e) => !e.isSidechain)
    .sort((a, b) => b.fileMtime - a.fileMtime)[0];
}

async function listProjectDirs(): Promise<string[]> {
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
