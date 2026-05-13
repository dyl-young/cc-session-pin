#!/usr/bin/env bun
import { rmByCwd, rmCommand } from "./commands/rm.js";

run();

async function run() {
  const token = process.argv[2];
  try {
    if (token) {
      await rmCommand(token);
    } else {
      await rmByCwd(process.cwd());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
}
