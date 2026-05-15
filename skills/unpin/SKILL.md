---
name: unpin
description: Unpin (soft-delete) the current Claude Code session from cc-pin so it no longer shows in the pinned list.
---

!`cc-pin rm ${CLAUDE_SESSION_ID}`

If the command above produced normal `cc-pin` output (an "Unpinned" line or "already unpinned" message), show it verbatim and stop. The pin is soft-deleted — the user can run `cc-pin purge` later to permanently drop all unpinned entries. If the session was never pinned, the output will say so; pass that through unchanged.

Otherwise, if the output contains a permission error (text like "Shell command permission check failed" or "This command requires approval"):

1. Use AskUserQuestion to ask whether to allow-list `cc-pin rm` so future `/unpin` invocations don't prompt. The question should be "Allow `cc-pin rm` to run without approval in future?" with options:
   - "Allow always" — add the permission to user settings (recommended; first option)
   - "Cancel" — do not change settings
2. If the user picks Allow always, invoke the `update-config` skill with the instruction: add `Bash(cc-pin rm:*)` to `permissions.allow` in `~/.claude/settings.json` (user-global, not project-local).
3. After the permission is added (or if the user cancelled), tell the user to re-run `/unpin` — the inline command will succeed on the next invocation once the new permission applies.
