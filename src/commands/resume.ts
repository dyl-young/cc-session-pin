import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { providerFor } from "../providers/index.js";
import { resolveOrThrow } from "../resolve.js";
import { loadStore, saveStore, type Pin, type PinStore } from "../store.js";

export async function resumeByToken(token: string): Promise<void> {
  const store = await loadStore();
  const pin = resolveOrThrow(store.pins, token);
  await resumePin(pin, store);
}

export async function resumePin(pin: Pin, store?: PinStore): Promise<void> {
  const argv = providerFor(pin.provider).resumeArgv(pin.sessionId);
  await writeFollowCwd(pin.projectPath);
  if (await handoffToWrapper(argv)) return;
  await maybeShowShellHint(store);
  return new Promise((_, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: pin.projectPath,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => process.exit(code ?? 0));
  });
}

async function writeFollowCwd(projectPath: string): Promise<void> {
  const file = process.env.AI_PIN_CWD_FILE;
  if (!file) return;
  try {
    await writeFile(file, projectPath, "utf8");
  } catch {
    // best-effort; shell wrapper just won't cd
  }
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Hand the resume off to the shell wrapper so the agent becomes a child of the
 * user's shell rather than of this process. A stale wrapper sets none of these
 * variables, in which case we spawn directly and only lose the parent-shell cd.
 */
async function handoffToWrapper(argv: string[]): Promise<boolean> {
  const cmdFile = process.env.AI_PIN_RESUME_CMD_FILE;
  if (!cmdFile) return false;
  try {
    await writeFile(cmdFile, argv.map(shellQuote).join(" "), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function maybeShowShellHint(store?: PinStore): Promise<void> {
  if (process.env.AI_PIN_CWD_FILE || process.env.AI_PIN_RESUME_CMD_FILE) return;
  const s = store ?? (await loadStore());
  if (s.state?.shellHintShown) return;
  process.stderr.write(SHELL_HINT);
  s.state = { ...s.state, shellHintShown: true };
  try {
    await saveStore(s);
  } catch {
    // if persistence fails the hint may show again; not fatal
  }
}

const SHELL_HINT = `\nTip: pin can drop your shell into the project directory on resume,
so new tabs/panes you open during the session land in the right place.

Add one of these to your shell config and reload:

  zsh / bash:   eval "$(pin shell-init)"
  fish:         pin shell-init fish | source

This message will not appear again.\n\n`;
