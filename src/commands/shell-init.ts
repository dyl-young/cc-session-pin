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

const POSIX = `cc-pin() {
  local _cc_pin_cwd_file _cc_pin_resume_file
  _cc_pin_cwd_file="$(mktemp 2>/dev/null)" || return 1
  _cc_pin_resume_file="$(mktemp 2>/dev/null)" || { rm -f "$_cc_pin_cwd_file"; return 1; }
  CC_PIN_CWD_FILE="$_cc_pin_cwd_file" CC_PIN_RESUME_FILE="$_cc_pin_resume_file" command cc-pin "$@"
  local _rc=$?
  if [ -s "$_cc_pin_cwd_file" ]; then
    builtin cd "$(cat "$_cc_pin_cwd_file")" 2>/dev/null || true
  fi
  if [ -s "$_cc_pin_resume_file" ]; then
    local _cc_pin_sid
    _cc_pin_sid="$(cat "$_cc_pin_resume_file")"
    rm -f "$_cc_pin_cwd_file" "$_cc_pin_resume_file"
    command claude -r "$_cc_pin_sid"
    return $?
  fi
  rm -f "$_cc_pin_cwd_file" "$_cc_pin_resume_file"
  return $_rc
}`;

const FISH = `function cc-pin
    set -l _cc_pin_cwd_file (mktemp 2>/dev/null)
    or return 1
    set -l _cc_pin_resume_file (mktemp 2>/dev/null)
    if test -z "$_cc_pin_resume_file"
        rm -f $_cc_pin_cwd_file
        return 1
    end
    CC_PIN_CWD_FILE=$_cc_pin_cwd_file CC_PIN_RESUME_FILE=$_cc_pin_resume_file command cc-pin $argv
    set -l _rc $status
    if test -s $_cc_pin_cwd_file
        cd (cat $_cc_pin_cwd_file) 2>/dev/null
    end
    if test -s $_cc_pin_resume_file
        set -l _cc_pin_sid (cat $_cc_pin_resume_file)
        rm -f $_cc_pin_cwd_file $_cc_pin_resume_file
        command claude -r $_cc_pin_sid
        return $status
    end
    rm -f $_cc_pin_cwd_file $_cc_pin_resume_file
    return $_rc
end`;
