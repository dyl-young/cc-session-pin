import type { Pin } from "./store.js";

export type ResolveResult =
  | { ok: true; pin: Pin }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "ambiguous"; candidates: Pin[] };

export function resolvePin(pins: Pin[], token: string): ResolveResult {
  const aliasMatch = pins.find((p) => p.alias === token);
  if (aliasMatch) return { ok: true, pin: aliasMatch };

  const idMatches = pins.filter((p) => p.sessionId.startsWith(token));
  if (idMatches.length === 1) return { ok: true, pin: idMatches[0] };
  if (idMatches.length > 1) return { ok: false, reason: "ambiguous", candidates: idMatches };
  return { ok: false, reason: "not-found" };
}
