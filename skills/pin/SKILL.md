---
name: pin
description: Pin the current Claude Code session so it can be resumed later via cc-pin from any directory.
---

!`cc-pin add ${CLAUDE_SESSION_ID}`

Show the output above verbatim and stop. The pin's display name is derived from the session's `aiTitle` metadata (the same name `claude -r` shows). The user can run `cc-pin rename <token> "<new name>"` afterwards if they want to change it.
