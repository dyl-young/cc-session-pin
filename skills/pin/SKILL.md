---
name: pin
description: Pin the current Claude Code session so it can be resumed later via cc-pin from any directory.
---

Run this Bash command exactly, with no extra reasoning:

```
cc-pin add ${CLAUDE_SESSION_ID}
```

Then show the user the command's output verbatim and stop.

Do not add `--name`, do not summarise the conversation, do not pick a title. `cc-pin` derives the display name from the session's own `aiTitle` metadata (the same name `claude -r` shows in its picker). If the user wants a different name, they can run `cc-pin rename <alias> "<new name>"` afterwards.
