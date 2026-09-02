import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { CURSOR_CHATS_DIR, cursorWorkspaceHash } from "../paths.js";
import { currentBranch } from "../git.js";
import type { Provider, SessionEntry } from "./types.js";

/**
 * Cursor writes a sidecar next to each chat's store.db. It is a cache derived
 * from store.db's `name` metadata (see chat-session-sidecar.ts in the agent
 * bundle), which is why we only ever read it.
 */
type CursorMeta = {
  schemaVersion?: number;
  createdAtMs?: number;
  updatedAtMs?: number;
  hasConversation?: boolean;
  isSubagent?: boolean;
  title?: string;
  cwd?: string;
};

async function readMeta(chatDir: string): Promise<CursorMeta | undefined> {
  try {
    return JSON.parse(await readFile(join(chatDir, "meta.json"), "utf8")) as CursorMeta;
  } catch {
    // Missing sidecar (Cursor backfills it lazily) or unparseable; skip.
    return undefined;
  }
}

/** Cursor's own picker skips slash commands here, so we do too. */
function firstRealPrompt(history: unknown): string {
  if (!Array.isArray(history)) return "";
  for (const entry of history) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed && !trimmed.startsWith("/")) return trimmed.slice(0, 200);
  }
  return "";
}

async function readFirstPrompt(chatDir: string): Promise<string> {
  try {
    const raw = await readFile(join(chatDir, "prompt_history.json"), "utf8");
    return firstRealPrompt(JSON.parse(raw));
  } catch {
    return "";
  }
}

async function toEntry(
  chatId: string,
  chatDir: string,
  meta: CursorMeta,
  projectPath: string,
): Promise<SessionEntry | undefined> {
  // Empty chats and subagent runs are noise; Cursor hides both in its picker.
  if (meta.hasConversation !== true) return undefined;
  if (meta.isSubagent === true) return undefined;

  // Every store.db on disk can share an mtime after a bulk sync, so trust
  // updatedAtMs first and only fall back to the filesystem.
  let mtime = typeof meta.updatedAtMs === "number" && meta.updatedAtMs > 0 ? meta.updatedAtMs : 0;
  if (!mtime) {
    try {
      mtime = (await stat(join(chatDir, "meta.json"))).mtimeMs;
    } catch {
      return undefined;
    }
  }

  const firstPrompt = await readFirstPrompt(chatDir);
  const title = meta.title?.trim();
  return {
    sessionId: chatId,
    provider: "cursor",
    fullPath: chatDir,
    fileMtime: mtime,
    firstPrompt,
    // "New Agent" is Cursor's placeholder for an untitled chat, not a real name.
    summary: title && title !== "New Agent" ? title : firstPrompt.slice(0, 60),
    modified: new Date(mtime).toISOString(),
    gitBranch: await currentBranch(projectPath),
    projectPath,
    isSidechain: false,
  };
}

async function scanWorkspace(
  workspaceDir: string,
  fallbackProjectPath: string | null,
): Promise<SessionEntry[]> {
  let chatIds: string[];
  try {
    chatIds = (await readdir(workspaceDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }

  const entries = await Promise.all(
    chatIds.map(async (chatId) => {
      const chatDir = join(workspaceDir, chatId);
      const meta = await readMeta(chatDir);
      if (!meta) return undefined;
      // Newer sidecars carry cwd, which is the only hash -> path mapping we get.
      const projectPath = meta.cwd || fallbackProjectPath;
      if (!projectPath) return undefined;
      return toEntry(chatId, chatDir, meta, projectPath);
    }),
  );
  return entries.filter((e): e is SessionEntry => e !== undefined);
}

export async function sessionsForProject(projectPath: string): Promise<SessionEntry[]> {
  return scanWorkspace(join(CURSOR_CHATS_DIR, cursorWorkspaceHash(projectPath)), projectPath);
}

export async function findByPrefix(prefix: string): Promise<SessionEntry[]> {
  let hashes: string[];
  try {
    hashes = (await readdir(CURSOR_CHATS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  // Workspace dirs are md5 hashes, so chats whose sidecar predates the `cwd`
  // field are unreachable here and get dropped by scanWorkspace.
  const perWorkspace = await Promise.all(
    hashes.map((h) => scanWorkspace(join(CURSOR_CHATS_DIR, h), null)),
  );
  return perWorkspace.flat().filter((e) => e.sessionId.startsWith(prefix));
}

export async function latestForCwd(cwd: string): Promise<SessionEntry | undefined> {
  const entries = await sessionsForProject(cwd);
  return entries.sort((a, b) => b.fileMtime - a.fileMtime)[0];
}

export const cursorProvider: Provider = {
  id: "cursor",
  label: "cr",
  binary: "agent",
  sessionsForProject,
  findByPrefix,
  latestForCwd,
  // --resume takes an OPTIONAL value, so `--resume <id>` opens the picker and
  // treats the id as a prompt. The "=" form is what Cursor itself prints.
  resumeArgv: (sessionId) => ["agent", `--resume=${sessionId}`],
};
