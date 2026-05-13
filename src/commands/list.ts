import { basename } from "node:path";
import { select } from "@inquirer/prompts";
import { readSessionsForProject } from "../sessions.js";
import { loadStore, type Pin } from "../store.js";
import { resumePin } from "./resume.js";

export type ListOptions = {
  plain?: boolean;
  all?: boolean;
};

export async function listCommand(opts: ListOptions): Promise<void> {
  const store = await loadStore();
  const pins = opts.all ? store.pins : store.pins.filter((p) => p.status === "pinned");

  if (pins.length === 0) {
    console.log(opts.all ? "No pins yet." : "No pinned sessions. Run `cc-pin` in a project directory to add one.");
    return;
  }

  const rows = await Promise.all(pins.map(enrich));
  rows.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));

  if (opts.plain) {
    printPlain(rows);
    return;
  }

  const choice = await select({
    message: "Pinned sessions",
    pageSize: Math.min(15, rows.length),
    choices: rows.map((r) => ({
      name: formatChoice(r),
      value: r.pin,
      description: r.pin.summary || r.pin.firstPrompt,
    })),
  });

  await resumePin(choice);
}

type EnrichedRow = {
  pin: Pin;
  lastModified?: string;
  missing: boolean;
};

async function enrich(pin: Pin): Promise<EnrichedRow> {
  const projectEntries = await readSessionsForProject(pin.projectPath);
  const live = projectEntries.find((e) => e.sessionId === pin.sessionId);
  return {
    pin,
    lastModified: live?.modified ?? pin.lastModified,
    missing: !live,
  };
}

function formatChoice(row: EnrichedRow): string {
  const project = basename(row.pin.projectPath);
  const when = relativeTime(row.lastModified);
  const status = row.pin.status === "unpinned" ? " [unpinned]" : "";
  const missing = row.missing ? " [stale]" : "";
  return `${row.pin.name}  ·  ${project}  ·  ${when}  (${row.pin.alias})${status}${missing}`;
}

function printPlain(rows: EnrichedRow[]): void {
  const cols = rows.map((r) => ({
    alias: r.pin.alias,
    name: r.pin.name,
    project: basename(r.pin.projectPath),
    modified: relativeTime(r.lastModified),
    status: r.pin.status + (r.missing ? " (stale)" : ""),
    id: r.pin.sessionId.slice(0, 8),
  }));
  const widths = {
    alias: max(cols, "alias"),
    name: max(cols, "name"),
    project: max(cols, "project"),
    modified: max(cols, "modified"),
    status: max(cols, "status"),
  };
  for (const c of cols) {
    console.log(
      [
        c.alias.padEnd(widths.alias),
        c.name.padEnd(widths.name),
        c.project.padEnd(widths.project),
        c.modified.padEnd(widths.modified),
        c.status.padEnd(widths.status),
        c.id,
      ].join("  "),
    );
  }
}

function max<T extends Record<string, string>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => Math.max(acc, String(r[key]).length), 0);
}

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(day / 365)}y ago`;
}
