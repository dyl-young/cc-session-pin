---
name: pin
description: Pin the current Claude Code session so it can be resumed later via cc-pin from any directory.
---

Run the `cc-pin` CLI to pin this conversation. Use a concise display name that captures what the session is about (under 60 chars).

Steps:

1. Pick a short name summarising the session topic.
2. Run via the Bash tool:

```
cc-pin add ${CLAUDE_SESSION_ID} --name "<your short name>"
```

3. Show the user the output from the command so they know the pin was created.

If `cc-pin` is not installed, tell the user to install it from https://github.com/dylan-young/cc-session-pin (or wherever they keep it) and `pnpm link --global` it.
