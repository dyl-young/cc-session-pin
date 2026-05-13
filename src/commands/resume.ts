import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolveOrThrow } from "../resolve.js";
import { loadStore, saveStore, type Pin } from "../store.js";

export async function resumeByToken(token: string): Promise<void> {
  const store = await loadStore();
  const pin = resolveOrThrow(store.pins, token);
  await resumePin(pin);
}

export async function resumePin(pin: Pin): Promise<void> {
  await writeFollowCwd(pin.projectPath);
  if (await handoffToWrapper(pin.sessionId)) {
    return;
  }
  await maybeShowShellHint();
  return new Promise((_, reject) => {
    const child = spawn("claude", ["-r", pin.sessionId], {
      cwd: pin.projectPath,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => process.exit(code ?? 0));
  });
}

async function writeFollowCwd(projectPath: string): Promise<void> {
  const file = process.env.CC_PIN_CWD_FILE;
  if (!file) return;
  try {
    await writeFile(file, projectPath, "utf8");
  } catch {
    // best-effort; shell wrapper just won't cd
  }
}

async function handoffToWrapper(sessionId: string): Promise<boolean> {
  const file = process.env.CC_PIN_RESUME_FILE;
  if (!file) return false;
  try {
    await writeFile(file, sessionId, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function maybeShowShellHint(): Promise<void> {
  if (process.env.CC_PIN_CWD_FILE || process.env.CC_PIN_RESUME_FILE) return;
  const store = await loadStore();
  if (store.state?.shellHintShown) return;
  process.stderr.write(SHELL_HINT);
  store.state = { ...store.state, shellHintShown: true };
  try {
    await saveStore(store);
  } catch {
    // if persistence fails the hint may show again; not fatal
  }
}

const SHELL_HINT = `\nTip: cc-pin can drop your shell into the project directory on resume,
so new tabs/panes you open during the session land in the right place.

Add one of these to your shell config and reload:

  zsh / bash:   eval "$(cc-pin shell-init)"
  fish:         cc-pin shell-init fish | source

This message will not appear again.\n\n`;
