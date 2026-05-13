import { spawn } from "node:child_process";
import { resolvePin } from "../resolve.js";
import { loadStore, type Pin } from "../store.js";

export async function resumeByToken(token: string): Promise<void> {
  const store = await loadStore();
  const result = resolvePin(store.pins, token);
  if (!result.ok) {
    if (result.reason === "not-found") throw new Error(`No pin matches "${token}".`);
    const list = result.candidates.map((p) => `  ${p.sessionId}  ${p.name}`).join("\n");
    throw new Error(`Ambiguous token "${token}". Candidates:\n${list}`);
  }
  await resumePin(result.pin);
}

export function resumePin(pin: Pin): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-r", pin.sessionId], {
      cwd: pin.projectPath,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      process.exit(code ?? 0);
      resolve();
    });
  });
}
