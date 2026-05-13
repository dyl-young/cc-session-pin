#!/usr/bin/env bun
process.argv.splice(2, 0, "ls");
await import("../cli.js");
