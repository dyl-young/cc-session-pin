# cc-session-pin

Pin and resume Claude Code sessions across project directories.

Claude Code's built-in `claude -r` picker only shows sessions for the current working directory. `cc-session-pin` lets you mark sessions as "pinned" and browse / resume them from anywhere, with a small TUI and a sessionId-prefix resolver.

![alt text](image.png)

## Features

- Pin the latest session in the current project — or any session by id prefix
- Interactive TUI list with branch + last-modified info, stale-session marking, and `^X` to toggle pin state
- Resume a pinned session by id prefix or name substring
- Optional shell integration that cds your parent shell into the project directory on resume — so split panes, new tabs, and dev servers spawn in the right place
- Skills for pinning / unpinning the current session from inside Claude Code

## Install

Requires [Bun](https://bun.sh) and [pnpm](https://pnpm.io). Claude Code (`claude`) must already be on your PATH.

```sh
git clone https://github.com/dylanyoung-dev/cc-session-pin.git
cd cc-session-pin
pnpm install
pnpm link --global
```

This installs six bins on your PATH:

| Short form | Long form  | Action                          |
| ---------- | ---------- | ------------------------------- |
| `pin`      | `cc-pin`   | Pin / umbrella CLI              |
| `pins`     | `cc-pins`  | Open the pinned-sessions TUI    |
| `unpin`    | `cc-unpin` | Unpin by token or by cwd        |

The `cc-` prefixed names are there for collision-free use if `pin` / `pins` / `unpin` clash with something else on your system.

### Shell integration (recommended)

The shell wrapper makes `pins → Enter` (resume) drop your parent shell into the project directory, so any new pane / tab you open during the Claude session starts in the right place.

Add **one** line to your shell config:

```sh
# zsh / bash (in ~/.zshrc or ~/.bashrc)
eval "$(cc-pin shell-init)"

# fish (in ~/.config/fish/config.fish)
cc-pin shell-init fish | source
```

Then reload (`source ~/.zshrc` or open a new tab). Without it, the binaries still work; the cd-on-resume just won't trigger.

## Usage

### Pinning the current session

From inside Claude Code, run the pin skill — or from a terminal in the project directory:

```sh
pin                  # pins the most recently modified session in this directory
pin <sessionId>      # pin a specific session by id prefix
pin --name "..."     # override the auto-derived display name
```

The pin name is read from the session's `aiTitle` metadata (same name `claude -r` shows), so it'll match what you'd see in Claude's built-in picker.

### Listing & resuming

```sh
pins                 # opens an interactive TUI: ↑↓ navigate, ⏎ resume, ^X toggle, q quit
pins --plain         # plain table for piping / scripting
pins --all           # include soft-deleted (unpinned) entries
```

Inside the TUI:

- `↑` / `↓` — navigate
- `⏎` — resume the selected session (cds your shell if shell-init is set up)
- `^X` — toggle pin / unpin on the highlighted row (applies on quit)
- `q` — quit

You can also resume directly without the TUI:

```sh
cc-pin resume <token>     # token = id prefix or name substring
```

### Unpinning

```sh
unpin                # soft-delete the pin matching the current directory
unpin <token>        # soft-delete by id prefix or name substring
cc-pin purge         # permanently drop all soft-deleted entries
```

Soft-deleted entries are hidden from `pins` but still visible in `pins --all`, and can be re-pinned with `^X` from there.

### Renaming

```sh
cc-pin rename <token> "new display name"
```

## Skills

The repo ships two Claude Code skills under `skills/`:

- `pin` — pins the current session (`cc-pin add ${CLAUDE_SESSION_ID}`)
- `unpin` — unpins the current session (`cc-pin rm ${CLAUDE_SESSION_ID}`)

To use them, point your Claude Code skills directory at this repo's `skills/` folder.

## Storage

State lives at `~/.claude/pinned-sessions/pins.json`. It's a small, human-readable JSON file — safe to delete to start fresh.

## Development

```sh
pnpm typecheck       # tsc --noEmit
bun src/cli.ts ...   # run the CLI directly without reinstalling
```

After a `pnpm link --global`, edits to source files are picked up immediately — no reinstall needed.

## License

MIT
