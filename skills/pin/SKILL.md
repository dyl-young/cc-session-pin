---
name: pin
description: Pin the current Claude Code session so it can be resumed later via pin from any directory.
---

!`pin add ${CLAUDE_SESSION_ID}`

If the command above produced normal `pin` output (a "Pinned" / "Re-pinned" / "Already pinned" line), show it verbatim and stop. The pin's display name is derived from the session's own title (the same name `claude -r` shows). To rename it, the user can run `pin add <token> -n "<new name>"`, or press `^R` on the row in `pins`.

Otherwise, if the output contains a permission error (text like "Shell command permission check failed" or "This command requires approval"):

1. Use AskUserQuestion to ask whether to allow-list `pin add` so future `/pin` invocations don't prompt. The question should be "Allow `pin add` to run without approval in future?" with options:
   - "Allow always" — add the permission to user settings (recommended; first option)
   - "Cancel" — do not change settings
2. If the user picks Allow always, invoke the `update-config` skill with the instruction: add `Bash(pin add:*)` to `permissions.allow` in `~/.claude/settings.json` (user-global, not project-local).
3. After the permission is added (or if the user cancelled), tell the user to re-run `/pin` — the inline command will succeed on the next invocation once the new permission applies.
