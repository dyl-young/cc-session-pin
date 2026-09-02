import { claudeProvider } from "./claude.js";
import { cursorProvider } from "./cursor.js";
import type { Provider, ProviderId, SessionEntry } from "./types.js";

export type { Provider, ProviderId, SessionEntry } from "./types.js";

export const PROVIDERS: Provider[] = [claudeProvider, cursorProvider];

export function providerFor(id: ProviderId): Provider {
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown session provider "${id}".`);
  return found;
}

/** Sessions for one project path, across every provider. */
export async function sessionsForProject(projectPath: string): Promise<SessionEntry[]> {
  const perProvider = await Promise.all(PROVIDERS.map((p) => p.sessionsForProject(projectPath)));
  return perProvider.flat();
}

/** Id-prefix search across every provider. Callers handle 0 or >1 matches. */
export async function findByPrefix(prefix: string): Promise<SessionEntry[]> {
  const perProvider = await Promise.all(PROVIDERS.map((p) => p.findByPrefix(prefix)));
  return perProvider.flat();
}

/** Most recently touched session in a directory, whichever tool owns it. */
export async function latestForCwd(cwd: string): Promise<SessionEntry | undefined> {
  const perProvider = await Promise.all(PROVIDERS.map((p) => p.latestForCwd(cwd)));
  return perProvider
    .filter((e): e is SessionEntry => e !== undefined)
    .sort((a, b) => b.fileMtime - a.fileMtime)[0];
}
