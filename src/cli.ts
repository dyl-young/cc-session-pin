#!/usr/bin/env bun
import { cac } from "cac";
import { addCommand } from "./commands/add.js";
import { listCommand } from "./commands/list.js";
import { purgeCommand } from "./commands/purge.js";
import { renameCommand } from "./commands/rename.js";
import { rmCommand } from "./commands/rm.js";
import { resumeByToken } from "./commands/resume.js";
import { shellInitCommand } from "./commands/shell-init.js";

const cli = cac("cc-pin");

const addAction = (sessionId: string | undefined, opts: { name?: string }) =>
  addCommand({ sessionToken: sessionId, name: opts.name });

cli
  .command("[sessionId]", "Pin a session (defaults to latest in cwd)")
  .option("--name <name>", "Display name for the pin")
  .action(addAction);

cli
  .command("add [sessionId]", "Pin a session explicitly")
  .option("--name <name>", "Display name")
  .action(addAction);

cli
  .command("ls", "List pinned sessions (TUI by default)")
  .alias("list")
  .option("--plain", "Print as a plain table")
  .option("--all", "Include soft-deleted (unpinned) entries")
  .action(async (opts: { plain?: boolean; all?: boolean }) => {
    await listCommand({ plain: opts.plain, all: opts.all });
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
  .command("rename <token> <newName>", "Rename a pin's display name")
  .action(async (token: string, newName: string) => {
    await renameCommand(token, newName);
  });

cli
  .command("shell-init [shell]", "Print the shell wrapper for cd-on-resume (zsh|bash|fish)")
  .action((shell: string | undefined) => {
    shellInitCommand(shell);
  });

cli.help();
cli.version("0.3.0");

run();

async function run() {
  try {
    cli.parse(process.argv, { run: false });
    await cli.runMatchedCommand();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
