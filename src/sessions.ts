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
  return scanDir(join(PROJECTS_DIR, encodeProjectPath(projectPath)), projectPath);
}

async function scanEncodedDir(encodedName: string): Promise<SessionEntry[]> {
  return scanDir(join(PROJECTS_DIR, encodedName), null);
}

async function scanDir(dir: string, fallbackProjectPath: string | null): Promise<SessionEntry[]> {
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
      const meta = await readJsonlMeta(full);
      const projectPath = meta.cwd || fallbackProjectPath;
      if (!projectPath) continue; // can't pin without a real path
      out.push({
        sessionId,
        fullPath: full,
        fileMtime: stats.mtimeMs,
        firstPrompt: meta.firstPrompt,
        summary: meta.aiTitle || meta.firstPrompt.slice(0, 60),
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

type JsonlMeta = {
  firstPrompt: string;
  aiTitle: string;
  cwd: string;
};

async function readJsonlMeta(jsonlPath: string): Promise<JsonlMeta> {
  const meta: JsonlMeta = { firstPrompt: "", aiTitle: "", cwd: "" };
  try {
    const raw = await readFile(jsonlPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      let parsed: {
        type?: string;
        aiTitle?: string;
        cwd?: string;
        message?: { role?: string; content?: unknown };
      };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.type === "ai-title" && typeof parsed.aiTitle === "string") {
        meta.aiTitle = parsed.aiTitle; // latest wins
      } else if (parsed.type === "user" && parsed.message?.role === "user") {
        if (!meta.cwd && typeof parsed.cwd === "string") meta.cwd = parsed.cwd;
        if (!meta.firstPrompt) {
          const c = parsed.message.content;
          const text = typeof c === "string" ? c : Array.isArray(c) ? extractText(c) : "";
          const trimmed = text.trim();
          if (trimmed) meta.firstPrompt = trimmed.slice(0, 200);
        }
      }
    }
  } catch {
    // fall through
  }
  return meta;
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
    // Pick up sessions not yet in the index (live ones) by scanning raw jsonls.
    // scanEncodedDir reads cwd directly from the jsonl, so we don't need to
    // un-encode the directory name.
    const scanned = await scanEncodedDir(dir);
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
