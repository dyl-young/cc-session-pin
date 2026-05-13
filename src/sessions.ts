import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTS_DIR, projectIndexFile } from "./paths.js";

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
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function readSessionsForProject(projectPath: string): Promise<SessionEntry[]> {
  return readIndex(projectIndexFile(projectPath));
}

export async function findSession(sessionId: string): Promise<SessionEntry | undefined> {
  const dirs = await listProjectDirs();
  for (const dir of dirs) {
    const entries = await readIndex(join(PROJECTS_DIR, dir, "sessions-index.json"));
    const hit = entries.find((e) => e.sessionId === sessionId);
    if (hit) return hit;
  }
  return undefined;
}

export async function findSessionByPrefix(prefix: string): Promise<SessionEntry[]> {
  const matches: SessionEntry[] = [];
  const dirs = await listProjectDirs();
  for (const dir of dirs) {
    const entries = await readIndex(join(PROJECTS_DIR, dir, "sessions-index.json"));
    for (const e of entries) {
      if (e.sessionId.startsWith(prefix)) matches.push(e);
    }
  }
  return matches;
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
    return await readdir(PROJECTS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
