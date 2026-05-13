import { basename } from "node:path";
import {
  Box,
  RGBA,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  vstyles,
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
  gitBranch?: string;
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

  const outcome = await runTui(rows);
  await applyMarks(store, outcome.marks);
  if (outcome.action === "resume") {
    await resumePin(outcome.pin, store);
  }
}

async function enrich(pin: Pin): Promise<EnrichedPin> {
  const live = (await readSessionsForProject(pin.projectPath)).find(
    (e) => e.sessionId === pin.sessionId,
  );
  return {
    pin,
    lastModified: live?.modified ?? pin.lastModified,
    gitBranch: live?.gitBranch || pin.gitBranch,
    missing: !live,
  };
}

type TuiOutcome =
  | { action: "resume"; pin: Pin; marks: Map<string, Mark> }
  | { action: "quit"; marks: Map<string, Mark> };

async function runTui(rows: EnrichedPin[]): Promise<TuiOutcome> {
  const renderer = await createCliRenderer({
    screenMode: "split-footer",
    footerHeight: computeFooterHeight(rows.length),
    exitOnCtrlC: false,
    backgroundColor: "transparent",
  });
  const marks = new Map<string, Mark>();

  const widths = computeWidths(renderer.width, rows);

  const select = new SelectRenderable(renderer, {
    options: buildOptions(rows, marks, widths),
    selectedIndex: 0,
    wrapSelection: true,
    showDescription: false,
    showScrollIndicator: true,
    backgroundColor: "transparent",
    textColor: PALETTE.text,
    selectedBackgroundColor: PALETTE.selectedBg,
    selectedTextColor: PALETTE.selectedText,
    focusedBackgroundColor: "transparent",
    focusedTextColor: PALETTE.text,
    flexGrow: 1,
  });

  const headerText = new TextRenderable(renderer, { content: header(widths), fg: PALETTE.faint });
  const statusText = new TextRenderable(renderer, { content: statusLine(marks), fg: PALETTE.faint });
  const idText = new TextRenderable(renderer, { content: "", fg: PALETTE.dim });
  populateFooter(idText, rows[0]);
  const hintText = new TextRenderable(renderer, {
    content: "↑↓ navigate  ·  ⏎ resume  ·  ^X toggle pin  ·  q quit",
    fg: PALETTE.dim,
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
      idText,
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

    select.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
      const row = rows[select.getSelectedIndex()];
      populateFooter(idText, row);
    });

    select.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
      const pin = option?.value as Pin | undefined;
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
      if (key.ctrl && key.name === "x") {
        const pin = currentPin(rows, select);
        if (pin) {
          const mark: Mark = pin.status === "pinned" ? "unpin" : "repin";
          toggleMark(marks, pin, mark);
          refresh(rows, marks, widths, select, statusText);
        }
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
  if (mark === "unpin" && pin.status === "unpinned") return;
  if (mark === "repin" && pin.status === "pinned") return;
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
  prefix: number;
};

const SELECT_INDICATOR_WIDTH = 2; // SelectRenderable prepends "▶ " / "  " to each row

function computeFooterHeight(rowCount: number): number {
  // chrome: padding(2) + 4 gaps + header(1) + status(1) + id(1) + hint(1) = 10
  const chrome = 10;
  const maxSelectVisible = 12;
  const selectRows = Math.min(rowCount, maxSelectVisible);
  const desired = chrome + selectRows;
  const terminalHeight = process.stdout.rows ?? 24;
  // leave at least 6 rows of prompt/scrollback above the footer
  const cap = Math.max(12, terminalHeight - 6);
  return Math.min(desired, cap);
}

const PROJECT_NAME_GAP = "    ";
const NAME_MODIFIED_GAP = "  ";

function computeWidths(terminalWidth: number, rows: EnrichedPin[]): ColumnWidths {
  const usable = Math.max(60, terminalWidth - 6 - SELECT_INDICATOR_WIDTH);
  const prefix = 2;
  const gapTotal = PROJECT_NAME_GAP.length + NAME_MODIFIED_GAP.length;

  const longestModified = rows.reduce((acc, r) => {
    const s = relativeTime(r.lastModified) + (r.missing ? " (stale)" : "");
    return Math.max(acc, s.length);
  }, "MODIFIED".length);
  const modified = Math.min(longestModified + 4, 20);

  const longestProject = rows.reduce(
    (acc, r) => Math.max(acc, basename(r.pin.projectPath).length),
    "PROJECT".length,
  );
  const project = Math.min(longestProject, 25);

  const name = Math.max(10, usable - prefix - gapTotal - modified - project);
  return { prefix, project, name, modified };
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
    PROJECT_NAME_GAP +
    cell(row.pin.name, w.name) +
    NAME_MODIFIED_GAP +
    cell(relativeTime(row.lastModified) + (row.missing ? " (stale)" : ""), w.modified)
  );
}

function markGlyph(status: Pin["status"], mark: Mark | undefined): string {
  const willBePinned = mark === "repin" || (status === "pinned" && mark !== "unpin");
  return willBePinned ? " " : "✗";
}

function header(w: ColumnWidths): string {
  return (
    " ".repeat(SELECT_INDICATOR_WIDTH) +
    " ".padEnd(w.prefix) +
    cell("PROJECT", w.project) +
    PROJECT_NAME_GAP +
    cell("NAME", w.name) +
    NAME_MODIFIED_GAP +
    cell("MODIFIED", w.modified)
  );
}

function populateFooter(footer: TextRenderable, row: EnrichedPin | undefined): void {
  footer.clear();
  if (!row) return;
  footer.add(`id  ${row.pin.sessionId}`);
  if (row.gitBranch) {
    footer.add("   ·   branch  ");
    footer.add(vstyles.fg(PALETTE.branch, row.gitBranch));
  }
}

// Colors:
// - text: terminal's own default foreground (theme-adaptive via ANSI \x1b[39m)
// - faint/dim: ANSI 256 mid-greys that read on both light and dark backgrounds
// - selection / branch: hex shades chosen to keep contrast against the blue/white pair
const PALETTE = {
  text: RGBA.defaultForeground(),
  faint: "#9aa0a6",
  dim: "#6e7681",
  selectedBg: "#1f6feb",
  selectedText: "#ffffff",
  branch: "#22c55e",
};

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
    project: basename(r.pin.projectPath),
    name: r.pin.name,
    modified: relativeTime(r.lastModified),
    branch: r.gitBranch || "—",
    status: r.pin.status + (r.missing ? " (stale)" : ""),
    id: r.pin.sessionId,
  }));
  const widths = {
    project: max(cols, "project"),
    name: max(cols, "name"),
    modified: max(cols, "modified"),
    branch: max(cols, "branch"),
    status: max(cols, "status"),
  };
  for (const c of cols) {
    console.log(
      [
        c.project.padEnd(widths.project),
        c.name.padEnd(widths.name),
        c.modified.padEnd(widths.modified),
        c.branch.padEnd(widths.branch),
        c.status.padEnd(widths.status),
        c.id,
      ].join("  "),
    );
  }
}

function max<T extends Record<string, string>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => Math.max(acc, String(r[key]).length), 0);
}
