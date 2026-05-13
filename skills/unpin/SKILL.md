---
name: unpin
description: Unpin (soft-delete) the current Claude Code session from cc-pin so it no longer shows in the pinned list.
---

Run this Bash command exactly, with no extra reasoning:

```
cc-pin rm ${CLAUDE_SESSION_ID}
```

Then show the user the command's output verbatim and stop.

Notes:
- This soft-deletes the pin. The user can run `cc-pin purge` later to permanently drop all unpinned entries.
- If the session was never pinned, `cc-pin` will say so — pass that message through unchanged.
