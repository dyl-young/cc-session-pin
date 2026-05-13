import { basename } from "node:path";
import {
  Box,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { loadStore, saveStore, type Pin, type PinStore } from "../store.js";
import { readSessionsForProject } from "../sessions.js";
import { resumePin } from "./resume.js";

export type ListOptions = {
  plain?: boolean;
  all?: boolean;
};

type Mark = "unpin" | "repin";

type EnrichedPin = {
  pin: Pin;
  lastModified?: string;
  missing: boolean;
};

export async function listCommand(opts: ListOptions): Promise<void> {
  const store = await loadStore();
  const visiblePins = opts.all
    ? store.pins
    : store.pins.filter((p) => p.status === "pinned");

  if (visiblePins.length === 0) {
    console.log(
      opts.all
        ? "No pins yet."
        : "No pinned sessions. Run `cc-pin` in a project directory to add one.",
    );
    return;
  }

  const rows = await Promise.all(visiblePins.map(enrich));
  rows.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));

  if (opts.plain) {
    printPlain(rows);
    return;
  }

  const outcome = await runTui(rows, opts);
  await applyMarks(store, outcome.marks);
  if (outcome.action === "resume") {
    await resumePin(outcome.pin);
  }
}

async function enrich(pin: Pin): Promise<EnrichedPin> {
  const live = (await readSessionsForProject(pin.projectPath)).find(
    (e) => e.sessionId === pin.sessionId,
  );
  return {
    pin,
    lastModified: live?.modified ?? pin.lastModified,
    missing: !live,
  };
}

type TuiOutcome =
  | { action: "resume"; pin: Pin; marks: Map<string, Mark> }
  | { action: "quit"; marks: Map<string, Mark> };

async function runTui(rows: EnrichedPin[], opts: ListOptions): Promise<TuiOutcome> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    backgroundColor: "transparent",
  });
  const marks = new Map<string, Mark>();

  const widths = computeWidths(renderer.width);

  const select = new SelectRenderable(renderer, {
    options: buildOptions(rows, marks, widths),
    selectedIndex: 0,
    wrapSelection: true,
    showDescription: false,
    showScrollIndicator: true,
    backgroundColor: "transparent",
    textColor: "#c9d1d9",
    selectedBackgroundColor: "#1f6feb",
    selectedTextColor: "#ffffff",
    focusedBackgroundColor: "transparent",
    focusedTextColor: "#c9d1d9",
    flexGrow: 1,
  });

  const headerText = new TextRenderable(renderer, { content: header(widths), fg: "#8b949e" });
  const statusText = new TextRenderable(renderer, { content: statusLine(marks), fg: "#8b949e" });
  const hintText = new TextRenderable(renderer, {
    content: "↑↓ navigate  ·  ⏎ resume  ·  ^U unpin  ·  ^P re-pin  ·  q quit",
    fg: "#6e7681",
  });

  renderer.root.add(
    Box(
      {
        flexDirection: "column",
        padding: 1,
        gap: 1,
        flexGrow: 1,
        shouldFill: false,
        backgroundColor: "transparent",
      },
      headerText,
      select,
      statusText,
      hintText,
    ),
  );

  select.focus();
  renderer.start();

  return await new Promise<TuiOutcome>((resolve) => {
    const finish = (out: TuiOutcome) => {
      try {
        renderer.destroy();
      } catch {
        // ignore
      }
      resolve(out);
    };

    select.on(SelectRenderableEvents.ITEM_SELECTED, (option: SelectOption) => {
      const pin = option.value as Pin | undefined;
      if (!pin) return;
      finish({ action: "resume", pin, marks });
    });

    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.name === "escape" || (key.name === "q" && !key.ctrl && !key.meta)) {
        finish({ action: "quit", marks });
        return;
      }
      if (key.ctrl && key.name === "c") {
        finish({ action: "quit", marks });
        return;
      }
      if (key.ctrl && key.name === "u") {
        toggleMark(marks, currentPin(rows, select), "unpin");
        refresh(rows, marks, widths, select, statusText);
        return;
      }
      if (key.ctrl && key.name === "p") {
        toggleMark(marks, currentPin(rows, select), "repin");
        refresh(rows, marks, widths, select, statusText);
        return;
      }
    });
  });
}

function currentPin(rows: EnrichedPin[], select: SelectRenderable): Pin | undefined {
  return rows[select.getSelectedIndex()]?.pin;
}

function toggleMark(marks: Map<string, Mark>, pin: Pin | undefined, mark: Mark) {
  if (!pin) return;
  if (mark === "unpin" && pin.status === "unpinned") return; // already unpinned
  if (mark === "repin" && pin.status === "pinned") return; // already pinned
  const existing = marks.get(pin.sessionId);
  if (existing === mark) marks.delete(pin.sessionId);
  else marks.set(pin.sessionId, mark);
}

function refresh(
  rows: EnrichedPin[],
  marks: Map<string, Mark>,
  widths: ColumnWidths,
  select: SelectRenderable,
  statusText: TextRenderable,
) {
  const idx = select.getSelectedIndex();
  select.options = buildOptions(rows, marks, widths);
  select.setSelectedIndex(Math.min(idx, Math.max(0, rows.length - 1)));
  statusText.content = statusLine(marks);
}

type ColumnWidths = {
  project: number;
  name: number;
  modified: number;
  alias: number;
  prefix: number;
};

function computeWidths(terminalWidth: number): ColumnWidths {
  const usable = Math.max(60, terminalWidth - 6 - SELECT_INDICATOR_WIDTH);
  const prefix = 2;
  const gap = 2;
  const remaining = usable - prefix - gap * 3;
  const each = Math.floor(remaining / 4);
  return {
    prefix,
    project: each,
    name: each,
    modified: each,
    alias: remaining - each * 3,
  };
}

function buildOptions(
  rows: EnrichedPin[],
  marks: Map<string, Mark>,
  w: ColumnWidths,
): SelectOption[] {
  return rows.map((row) => ({
    name: formatRow(row, marks, w),
    description: "",
    value: row.pin,
  }));
}

function formatRow(row: EnrichedPin, marks: Map<string, Mark>, w: ColumnWidths): string {
  const mark = marks.get(row.pin.sessionId);
  const prefix = markGlyph(row.pin.status, mark).padEnd(w.prefix);
  return (
    prefix +
    cell(basename(row.pin.projectPath), w.project) +
    "  " +
    cell(row.pin.name, w.name) +
    "  " +
    cell(relativeTime(row.lastModified) + (row.missing ? " (stale)" : ""), w.modified) +
    "  " +
    cell(row.pin.alias, w.alias)
  );
}

function markGlyph(status: Pin["status"], mark: Mark | undefined): string {
  if (mark === "unpin") return "✗";
  if (mark === "repin") return "+";
  if (status === "unpinned") return "·";
  return " ";
}

const SELECT_INDICATOR_WIDTH = 2; // SelectRenderable prepends "▶ " / "  " to each row

function header(w: ColumnWidths): string {
  return (
    " ".repeat(SELECT_INDICATOR_WIDTH) +
    " ".padEnd(w.prefix) +
    cell("PROJECT", w.project) +
    "  " +
    cell("NAME", w.name) +
    "  " +
    cell("MODIFIED", w.modified) +
    "  " +
    cell("ALIAS", w.alias)
  );
}

function statusLine(marks: Map<string, Mark>): string {
  let unpin = 0;
  let repin = 0;
  for (const m of marks.values()) {
    if (m === "unpin") unpin++;
    else repin++;
  }
  if (unpin === 0 && repin === 0) return "";
  const parts: string[] = [];
  if (unpin > 0) parts.push(`${unpin} staged for unpin`);
  if (repin > 0) parts.push(`${repin} staged for re-pin`);
  return parts.join("  ·  ") + "  (applies on quit)";
}

function cell(s: string, width: number): string {
  if (width <= 0) return "";
  if (s.length <= width) return s.padEnd(width);
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + "…";
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

async function applyMarks(store: PinStore, marks: Map<string, Mark>) {
  if (marks.size === 0) return;
  let changed = false;
  for (const [sessionId, mark] of marks) {
    const pin = store.pins.find((p) => p.sessionId === sessionId);
    if (!pin) continue;
    const target: Pin["status"] = mark === "unpin" ? "unpinned" : "pinned";
    if (pin.status !== target) {
      pin.status = target;
      changed = true;
    }
  }
  if (changed) await saveStore(store);
}

function printPlain(rows: EnrichedPin[]): void {
  const cols = rows.map((r) => ({
    alias: r.pin.alias,
    name: r.pin.name,
    project: basename(r.pin.projectPath),
    modified: relativeTime(r.lastModified),
    status: r.pin.status + (r.missing ? " (stale)" : ""),
    id: r.pin.sessionId.slice(0, 8),
  }));
  const widths = {
    project: max(cols, "project"),
    name: max(cols, "name"),
    modified: max(cols, "modified"),
    alias: max(cols, "alias"),
    status: max(cols, "status"),
  };
  for (const c of cols) {
    console.log(
      [
        c.project.padEnd(widths.project),
        c.name.padEnd(widths.name),
        c.modified.padEnd(widths.modified),
        c.alias.padEnd(widths.alias),
        c.status.padEnd(widths.status),
        c.id,
      ].join("  "),
    );
  }
}

function max<T extends Record<string, string>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => Math.max(acc, String(r[key]).length), 0);
}
