#!/usr/bin/env bun
/**
 * Repoint pinned sessions and agent history after a project directory moves.
 *
 * Claude Code keys its history on an encoded copy of the absolute path, and
 * Cursor keys its chats on md5 of that path, so moving a project orphans both
 * stores and leaves every pin pointing somewhere that no longer exists.
 *
 *   bun scripts/move-project.ts <oldPath> <newPath>              # dry run
 *   bun scripts/move-project.ts <oldPath> <newPath> --apply
 *   bun scripts/move-project.ts <oldPath> <newPath> --reconcile  # after the fact
 *
 * Does not move the project itself; run `mv` yourself, from outside the
 * directory, so nothing is holding it open.
 *
 * A running agent recomputes its history directory from the cwd it captured at
 * startup, so it will recreate the old directory and keep writing there. Once
 * that session exits, `--reconcile` folds the leftovers into the new location.
 */
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CURSOR_CHATS_DIR,
  PINS_FILE,
  PROJECTS_DIR,
  cursorWorkspaceHash,
  encodeProjectPath,
} from "../src/paths.js";

const [oldRaw, newRaw, ...rest] = process.argv.slice(2);
const apply = rest.includes("--apply");
const reconcile = rest.includes("--reconcile");

if (!oldRaw || !newRaw) {
  console.error(
    "usage: bun scripts/move-project.ts <oldPath> <newPath> [--apply] [--reconcile]",
  );
  process.exit(1);
}

const oldPath = resolve(oldRaw);
const newPath = resolve(newRaw);
const oldClaude = join(PROJECTS_DIR, encodeProjectPath(oldPath));
const newClaude = join(PROJECTS_DIR, encodeProjectPath(newPath));

const plan: string[] = [];
const act = (desc: string, fn: () => Promise<void>) =>
  apply ? fn().then(() => console.log(`  done  ${desc}`)) : Promise.resolve(plan.push(desc));

const jsonls = async (dir: string) =>
  existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith(".jsonl")) : [];

/** Newest timestamp recorded inside a session file, for ordering two fragments. */
async function lastTimestamp(file: string): Promise<string> {
  let latest = "";
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    try {
      const ts = JSON.parse(line).timestamp;
      if (typeof ts === "string" && ts > latest) latest = ts;
    } catch {
      // tolerate a torn final line
    }
  }
  return latest;
}

function secondsSinceWrite(file: string): number {
  return (Date.now() - statSync(file).mtimeMs) / 1000;
}

// --- pins.json: exact match, plus anything nested under the old path ---
async function movePins(): Promise<void> {
  let store: { pins?: { projectPath?: string }[] };
  try {
    store = JSON.parse(await readFile(PINS_FILE, "utf8"));
  } catch {
    console.log("pins: no pins.json, skipping");
    return;
  }
  const hits = (store.pins ?? []).filter(
    (p) => p.projectPath === oldPath || p.projectPath?.startsWith(`${oldPath}/`),
  );
  if (hits.length === 0) {
    console.log("pins: nothing points at the old path");
    return;
  }
  await act(`pins: repoint ${hits.length} entr${hits.length === 1 ? "y" : "ies"}`, async () => {
    for (const p of hits) p.projectPath = p.projectPath!.replace(oldPath, newPath);
    await writeFile(PINS_FILE, JSON.stringify(store, null, 2) + "\n", "utf8");
  });
}

// --- Claude Code: ~/.claude/projects/<encoded path>/ ---
async function moveClaude(): Promise<void> {
  if (!existsSync(oldClaude)) {
    console.log("claude: no history for the old path");
    return;
  }
  if (existsSync(newClaude)) {
    console.log(`claude: ${newClaude} already exists, use --reconcile`);
    return;
  }
  const files = await jsonls(oldClaude);
  const live = files.filter((f) => secondsSinceWrite(join(oldClaude, f)) < 120);
  if (live.length > 0) {
    console.log(
      `claude: WARNING ${live.length} session file(s) written in the last 2 min.\n` +
        "        A live session will recreate this directory and split its history.\n" +
        "        Re-run with --reconcile once that session exits.",
    );
  }
  await act(`claude: move ${files.length} session file(s) to ${newClaude}`, () =>
    rename(oldClaude, newClaude),
  );
}

// --- Cursor: ~/.cursor/chats/<md5 path>/, plus the cwd in each sidecar ---
async function moveCursor(): Promise<void> {
  const from = join(CURSOR_CHATS_DIR, cursorWorkspaceHash(oldPath));
  const to = join(CURSOR_CHATS_DIR, cursorWorkspaceHash(newPath));
  if (!existsSync(from)) {
    console.log("cursor: no chats for the old path");
    return;
  }
  if (existsSync(to)) {
    console.log(`cursor: ${to} already exists, merge it by hand`);
    return;
  }
  const dirs = (await readdir(from, { withFileTypes: true }))
    .filter((c) => c.isDirectory())
    .map((c) => c.name);
  await act(`cursor: move ${dirs.length} chat(s) to ${to}`, () => rename(from, to));
  await act(`cursor: rewrite cwd in ${dirs.length} sidecar(s)`, async () => {
    for (const id of dirs) {
      const metaPath = join(to, id, "meta.json");
      try {
        const meta = JSON.parse(await readFile(metaPath, "utf8"));
        if (typeof meta.cwd !== "string") continue;
        meta.cwd = meta.cwd.replace(oldPath, newPath);
        await writeFile(metaPath, JSON.stringify(meta), "utf8");
      } catch {
        // sidecar missing or unreadable; Cursor regenerates it from store.db
      }
    }
  });
}

/**
 * Fold a recreated old directory back into the new one. A session that was
 * running during the move leaves its later turns behind in the old path.
 */
async function reconcileClaude(): Promise<void> {
  if (!existsSync(oldClaude)) {
    console.log("claude: nothing left at the old path, already reconciled");
    return;
  }
  const files = await jsonls(oldClaude);
  if (files.length === 0) {
    await act(`claude: remove empty ${oldClaude}`, () => rm(oldClaude, { recursive: true }));
    return;
  }
  for (const file of files) {
    const from = join(oldClaude, file);
    const to = join(newClaude, file);
    const stillWriting = secondsSinceWrite(from) < 60;
    if (stillWriting) {
      console.log(`claude: ${file} was written <60s ago; exit that session first. Skipping.`);
      continue;
    }
    if (!existsSync(to)) {
      await act(`claude: move ${file} into ${newClaude}`, () => rename(from, to));
      continue;
    }
    const fragStart = await lastTimestamp(from);
    const baseEnd = await lastTimestamp(to);
    if (fragStart && baseEnd && fragStart < baseEnd) {
      console.log(`claude: ${file} predates the file at the new path; merge by hand.`);
      continue;
    }
    const lines = (await readFile(from, "utf8")).split("\n").filter((l) => l.trim()).length;
    await act(`claude: append ${lines} line(s) from ${file} onto the moved copy`, async () => {
      const frag = await readFile(from, "utf8");
      const base = await readFile(to, "utf8");
      await writeFile(to, base.endsWith("\n") ? base + frag : `${base}\n${frag}`, "utf8");
      await rm(from);
    });
  }
  if ((await jsonls(oldClaude)).length === 0 && apply) {
    const leftover = await readdir(oldClaude);
    if (leftover.length === 0) {
      await act(`claude: remove empty ${oldClaude}`, () => rm(oldClaude, { recursive: true }));
    }
  }
  const cursorOld = join(CURSOR_CHATS_DIR, cursorWorkspaceHash(oldPath));
  if (existsSync(cursorOld)) {
    console.log(
      `cursor: chats reappeared at ${cursorOld}. Their store.db files cannot be\n` +
        "        concatenated, so move those chat directories across by hand.",
    );
  }
}

console.log(`${oldPath}\n  -> ${newPath}${reconcile ? "  (reconcile)" : ""}\n`);
if (reconcile) {
  await movePins();
  await reconcileClaude();
} else {
  await movePins();
  await moveClaude();
  await moveCursor();
}

if (!apply) {
  console.log(`\nDry run. Would do:`);
  if (plan.length === 0) console.log("  - nothing");
  for (const line of plan) console.log(`  - ${line}`);
  console.log(`\nRe-run with --apply to make these changes.`);
  if (!reconcile && existsSync(oldPath) && !existsSync(newPath)) {
    console.log(`\nThe project itself is still at the old path. From outside it, run:`);
    console.log(`  mv ${oldPath} ${newPath}`);
  }
}
