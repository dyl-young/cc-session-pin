import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const cache = new Map<string, string | undefined>();

/** Current branch for a working tree, or undefined if it isn't a repo. */
export async function currentBranch(dir: string): Promise<string | undefined> {
  if (cache.has(dir)) return cache.get(dir);
  let branch: string | undefined;
  try {
    const { stdout } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir });
    branch = stdout.trim() || undefined;
  } catch {
    branch = undefined; // not a repo, or git missing
  }
  cache.set(dir, branch);
  return branch;
}
