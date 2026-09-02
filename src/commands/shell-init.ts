type Shell = "zsh" | "bash" | "fish";

export function shellInitCommand(shell?: string): void {
  const target = resolveShell(shell);
  process.stdout.write(scriptFor(target) + "\n");
}

function resolveShell(explicit?: string): Shell {
  if (explicit) {
    const normalised = explicit.toLowerCase();
    if (normalised === "zsh" || normalised === "bash" || normalised === "fish") {
      return normalised;
    }
    throw new Error(
      `Unsupported shell "${explicit}". Use one of: zsh, bash, fish.`,
    );
  }
  const env = (process.env.SHELL || "").toLowerCase();
  if (env.endsWith("/fish") || env === "fish") return "fish";
  if (env.endsWith("/bash") || env === "bash") return "bash";
  return "zsh";
}

function scriptFor(shell: Shell): string {
  if (shell === "fish") return FISH;
  return POSIX;
}

const POSIX = `__ai_pin_with_handoff() {
  local _cmd="$1"; shift
  local _cwd _resume
  _cwd="$(mktemp 2>/dev/null)" || return 1
  _resume="$(mktemp 2>/dev/null)" || { rm -f "$_cwd"; return 1; }
  AI_PIN_CWD_FILE="$_cwd" AI_PIN_RESUME_CMD_FILE="$_resume" command "$_cmd" "$@"
  local _rc=$?
  if [ -s "$_cwd" ]; then
    builtin cd "$(cat "$_cwd")" 2>/dev/null || true
  fi
  if [ -s "$_resume" ]; then
    local _cmdline
    _cmdline="$(cat "$_resume")"
    rm -f "$_cwd" "$_resume"
    eval "command $_cmdline"
    return $?
  fi
  rm -f "$_cwd" "$_resume"
  return $_rc
}
pin()   { __ai_pin_with_handoff pin   "$@"; }
pins()  { __ai_pin_with_handoff pins  "$@"; }
unpin() { __ai_pin_with_handoff unpin "$@"; }`;

const FISH = `function __ai_pin_with_handoff
    set -l _cmd $argv[1]
    set -e argv[1]
    set -l _cwd (mktemp 2>/dev/null)
    or return 1
    set -l _resume (mktemp 2>/dev/null)
    if test -z "$_resume"
        rm -f $_cwd
        return 1
    end
    AI_PIN_CWD_FILE=$_cwd AI_PIN_RESUME_CMD_FILE=$_resume command $_cmd $argv
    set -l _rc $status
    if test -s $_cwd
        cd (cat $_cwd) 2>/dev/null
    end
    if test -s $_resume
        set -l _cmdline (cat $_resume)
        rm -f $_cwd $_resume
        eval "command $_cmdline"
        return $status
    end
    rm -f $_cwd $_resume
    return $_rc
end
function pin;   __ai_pin_with_handoff pin   $argv; end
function pins;  __ai_pin_with_handoff pins  $argv; end
function unpin; __ai_pin_with_handoff unpin $argv; end`;
