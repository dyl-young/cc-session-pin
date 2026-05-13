import type { Pin } from "./store.js";

export type ResolveResult =
  | { ok: true; pin: Pin }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "ambiguous"; candidates: Pin[] };

export function resolvePin(pins: Pin[], token: string): ResolveResult {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: "not-found" };

  const idMatches = pins.filter((p) => p.sessionId.startsWith(trimmed));
  if (idMatches.length === 1) return { ok: true, pin: idMatches[0] };
  if (idMatches.length > 1) return { ok: false, reason: "ambiguous", candidates: idMatches };

  const lower = trimmed.toLowerCase();
  const nameMatches = pins.filter((p) => p.name.toLowerCase().includes(lower));
  if (nameMatches.length === 1) return { ok: true, pin: nameMatches[0] };
  if (nameMatches.length > 1) return { ok: false, reason: "ambiguous", candidates: nameMatches };

  return { ok: false, reason: "not-found" };
}

export function resolveOrThrow(pins: Pin[], token: string): Pin {
  const result = resolvePin(pins, token);
  if (result.ok) return result.pin;
  if (result.reason === "not-found") throw new Error(`No pin matches "${token}".`);
  const list = result.candidates.map((p) => `  ${p.sessionId}  ${p.name}`).join("\n");
  throw new Error(`Ambiguous token "${token}". Candidates:\n${list}`);
}
