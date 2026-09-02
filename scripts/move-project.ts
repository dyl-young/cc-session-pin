#!/usr/bin/env bun
/**
 * Repoint pinned sessions and agent history after a project directory moves.
 *
 * Claude Code keys its history on an encoded copy of the absolute path, and
 * Cursor keys its chats on md5 of that path, so moving a project orphans both
 * stores and leaves every pin pointing somewhere that no longer exists.
 *
 *   bun scripts/move-project.ts <oldPath> <newPath>          # dry run
 *   bun scripts/move-project.ts <oldPath> <newPath> --apply
 *
 * Does not move the project itself; run `mv` yourself, from outside the
 * directory, so nothing is holding it open.
 */
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

if (!oldRaw || !newRaw) {
  console.error("usage: bun scripts/move-project.ts <oldPath> <newPath> [--apply]");
  process.exit(1);
}

const oldPath = resolve(oldRaw);
const newPath = resolve(newRaw);
const plan: string[] = [];
const act = (desc: string, fn: () => Promise<void>) =>
  apply ? fn().then(() => console.log(`  done  ${desc}`)) : Promise.resolve(plan.push(desc));

// --- pins.json: exact match, plus anything nested under the old path ---
async function movePins(): Promise<void> {
  let store: { pins?: { projectPath?: string; name?: string }[] };
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
  const from = join(PROJECTS_DIR, encodeProjectPath(oldPath));
  const to = join(PROJECTS_DIR, encodeProjectPath(newPath));
  if (!existsSync(from)) {
    console.log("claude: no history for the old path");
    return;
  }
  if (existsSync(to)) {
    console.log(`claude: ${to} already exists, merge it by hand`);
    return;
  }
  const count = (await readdir(from)).filter((f) => f.endsWith(".jsonl")).length;
  await act(`claude: move ${count} session file(s) to ${to}`, () => rename(from, to));
}

// --- Cursor: ~/.cursor/chats/<md5 path>/, plus the cwd recorded in each sidecar ---
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
  const chats = await readdir(from, { withFileTypes: true });
  const dirs = chats.filter((c) => c.isDirectory()).map((c) => c.name);
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

console.log(`${oldPath}\n  -> ${newPath}\n`);
await movePins();
await moveClaude();
await moveCursor();

if (!apply) {
  console.log(`\nDry run. Would do:`);
  for (const line of plan) console.log(`  - ${line}`);
  console.log(`\nRe-run with --apply to make these changes.`);
  if (existsSync(oldPath) && !existsSync(newPath)) {
    console.log(`\nThe project itself is still at the old path. From outside it, run:`);
    console.log(`  mv ${oldPath} ${newPath}`);
  }
}
