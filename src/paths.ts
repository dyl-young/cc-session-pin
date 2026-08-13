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
