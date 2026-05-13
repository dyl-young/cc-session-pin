#!/usr/bin/env bun
import { rmByCwd, rmCommand } from "./commands/rm.js";
import { runOrExit } from "./run.js";

runOrExit(async () => {
  const token = process.argv[2];
  if (token) await rmCommand(token);
  else await rmByCwd(process.cwd());
});
