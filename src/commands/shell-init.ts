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

const POSIX = `__cc_pin_with_handoff() {
  local _cmd="$1"; shift
  local _cwd _resume
  _cwd="$(mktemp 2>/dev/null)" || return 1
  _resume="$(mktemp 2>/dev/null)" || { rm -f "$_cwd"; return 1; }
  CC_PIN_CWD_FILE="$_cwd" CC_PIN_RESUME_FILE="$_resume" command "$_cmd" "$@"
  local _rc=$?
  if [ -s "$_cwd" ]; then
    builtin cd "$(cat "$_cwd")" 2>/dev/null || true
  fi
  if [ -s "$_resume" ]; then
    local _sid
    _sid="$(cat "$_resume")"
    rm -f "$_cwd" "$_resume"
    command claude -r "$_sid"
    return $?
  fi
  rm -f "$_cwd" "$_resume"
  return $_rc
}
cc-pin()   { __cc_pin_with_handoff cc-pin   "$@"; }
cc-pins()  { __cc_pin_with_handoff cc-pins  "$@"; }
cc-unpin() { __cc_pin_with_handoff cc-unpin "$@"; }
pin()      { __cc_pin_with_handoff pin      "$@"; }
pins()     { __cc_pin_with_handoff pins     "$@"; }
unpin()    { __cc_pin_with_handoff unpin    "$@"; }`;

const FISH = `function __cc_pin_with_handoff
    set -l _cmd $argv[1]
    set -e argv[1]
    set -l _cwd (mktemp 2>/dev/null)
    or return 1
    set -l _resume (mktemp 2>/dev/null)
    if test -z "$_resume"
        rm -f $_cwd
        return 1
    end
    CC_PIN_CWD_FILE=$_cwd CC_PIN_RESUME_FILE=$_resume command $_cmd $argv
    set -l _rc $status
    if test -s $_cwd
        cd (cat $_cwd) 2>/dev/null
    end
    if test -s $_resume
        set -l _sid (cat $_resume)
        rm -f $_cwd $_resume
        command claude -r $_sid
        return $status
    end
    rm -f $_cwd $_resume
    return $_rc
end
function cc-pin;   __cc_pin_with_handoff cc-pin   $argv; end
function cc-pins;  __cc_pin_with_handoff cc-pins  $argv; end
function cc-unpin; __cc_pin_with_handoff cc-unpin $argv; end
function pin;      __cc_pin_with_handoff pin      $argv; end
function pins;     __cc_pin_with_handoff pins     $argv; end
function unpin;    __cc_pin_with_handoff unpin    $argv; end`;
