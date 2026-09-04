export type ProviderId = "claude" | "cursor";

export type SessionEntry = {
  sessionId: string;
  provider: ProviderId;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  modified: string;
  gitBranch?: string;
  projectPath: string;
  isSidechain?: boolean;
};

export type Provider = {
  id: ProviderId;
  /** Short tag for the TUI's SRC column. */
  label: string;
  /** Executable that owns these sessions; must be on PATH to resume. */
  binary: string;
  sessionsForProject(projectPath: string): Promise<SessionEntry[]>;
  findByPrefix(prefix: string): Promise<SessionEntry[]>;
  latestForCwd(cwd: string): Promise<SessionEntry | undefined>;
  /** argv to hand to spawn(), run with cwd set to the project path. */
  resumeArgv(sessionId: string): string[];
};
