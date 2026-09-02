import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDE_HOME = join(homedir(), ".claude");
export const PROJECTS_DIR = join(CLAUDE_HOME, "projects");
export const PINS_DIR = join(CLAUDE_HOME, "pinned-sessions");
export const PINS_FILE = join(PINS_DIR, "pins.json");

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, "-");
}

export function projectIndexFile(projectPath: string): string {
  return join(PROJECTS_DIR, encodeProjectPath(projectPath), "sessions-index.json");
}

export const CURSOR_HOME = join(homedir(), ".cursor");
export const CURSOR_CHATS_DIR = join(CURSOR_HOME, "chats");

/**
 * Cursor buckets chats by md5 of the absolute workspace path:
 *   ~/.cursor/chats/<md5(projectPath)>/<chatId>/meta.json
 * One-way, so cwd -> chats always works but hash -> cwd needs meta.json's own
 * `cwd` field (only written by newer schema versions).
 */
export function cursorWorkspaceHash(projectPath: string): string {
  return createHash("md5").update(projectPath).digest("hex");
}
