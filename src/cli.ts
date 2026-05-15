#!/usr/bin/env bun
import { cac } from "cac";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { purgeCommand } from "./commands/purge.js";
import { rmCommand } from "./commands/rm.js";
import { resumeByToken } from "./commands/resume.js";
import { shellInitCommand } from "./commands/shell-init.js";
import { runOrExit } from "./run.js";

const cli = cac("cc-pin");

const addAction = (sessionId: string | undefined, opts: { name?: string }) =>
  addCommand({ sessionToken: sessionId, name: opts.name });

cli
  .command("[sessionId]", "Pin a session (defaults to latest in cwd)")
  .option("-n, --name <name>", "Display name for the pin (overrides aiTitle)")
  .action(addAction);

cli
  .command("add [sessionId]", "Pin a session explicitly")
  .option("-n, --name <name>", "Display name (overrides aiTitle)")
  .action(addAction);

cli
  .command("ls [filter]", "List pinned sessions (TUI by default; optional project-path filter)")
  .alias("list")
  .option("--plain", "Print as a plain table")
  .option("--all", "Include soft-deleted (unpinned) entries")
  .action(async (filter: string | undefined, opts: { plain?: boolean; all?: boolean }) => {
    await listCommand({ plain: opts.plain, all: opts.all, filter });
  });

cli
  .command("resume <token>", "Resume a pinned session by id prefix or name substring")
  .action(async (token: string) => {
    await resumeByToken(token);
  });

cli
  .command("rm <token>", "Unpin (soft-delete) a pinned session")
  .alias("remove")
  .action(async (token: string) => {
    await rmCommand(token);
  });

cli
  .command("purge", "Permanently drop all unpinned entries").action(async () => {
    await purgeCommand();
  });

cli
  .command("shell-init [shell]", "Print the shell wrapper for cd-on-resume (zsh|bash|fish)")
  .action((shell: string | undefined) => {
    shellInitCommand(shell);
  });

cli.help();
cli.version("0.3.0");

runOrExit(async () => {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
});
