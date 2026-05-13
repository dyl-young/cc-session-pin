---
name: unpin
description: Unpin (soft-delete) the current Claude Code session from cc-pin so it no longer shows in the pinned list.
---

!`cc-pin rm ${CLAUDE_SESSION_ID}`

Show the output above verbatim and stop. The pin is soft-deleted — the user can run `cc-pin purge` later to permanently drop all unpinned entries. If the session was never pinned, the output will say so; pass that through unchanged.
