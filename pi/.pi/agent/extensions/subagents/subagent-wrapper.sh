#!/usr/bin/env bash
set -euo pipefail

# subagent-wrapper.sh — Orchestrate subagent lifecycle via tmux
# Usage:
#   subagent-wrapper.sh <task-dir> <manifest-path>
#   subagent-wrapper.sh <manifest-path>   # taskDir read from manifest

if [[ $# -eq 1 ]]; then
  TASK_DIR_ARG=""
  MANIFEST_PATH="$1"
elif [[ $# -eq 2 ]]; then
  TASK_DIR_ARG="$1"
  MANIFEST_PATH="$2"
else
  echo "Usage: subagent-wrapper.sh <task-dir> <manifest-path> OR subagent-wrapper.sh <manifest-path>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMUX_MANAGER="$SCRIPT_DIR/tmux-manager.sh"
STREAM_FILTER="$SCRIPT_DIR/stream-filter.sh"

SOCKET_PATH="$(pwd)/.pi/subagents.sock"
SESSION="subagents"
PANE_ID=""

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && -n "${PANE_ID:-}" ]]; then
    bash "$TMUX_MANAGER" kill-pane "$PANE_ID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 131' QUIT
trap 'exit 143' TERM

# ── Validate dependencies ──

if ! command -v jq &>/dev/null; then
  echo "subagent-wrapper: jq is required to parse the manifest file" >&2
  exit 2
fi

if [[ ! -x "$TMUX_MANAGER" ]]; then
  echo "subagent-wrapper: tmux-manager.sh not found or not executable: $TMUX_MANAGER" >&2
  exit 2
fi

if [[ ! -x "$STREAM_FILTER" ]]; then
  echo "subagent-wrapper: stream-filter.sh not found or not executable: $STREAM_FILTER" >&2
  exit 2
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "subagent-wrapper: manifest file not found: $MANIFEST_PATH" >&2
  exit 2
fi

# ── Read manifest metadata ──

AGENT_ID=$(jq -r '.agentId // "unknown"' "$MANIFEST_PATH")
TASK_DIR_MANIFEST=$(jq -r '.taskDir // empty' "$MANIFEST_PATH")

if [[ -z "$TASK_DIR_MANIFEST" ]]; then
  echo "subagent-wrapper: manifest missing valid taskDir" >&2
  exit 2
fi

if [[ -z "$TASK_DIR_ARG" ]]; then
  TASK_DIR_ARG="$TASK_DIR_MANIFEST"
fi

if [[ "$TASK_DIR_ARG" != "$TASK_DIR_MANIFEST" ]]; then
  echo "subagent-wrapper: task directory argument does not match manifest taskDir" >&2
  exit 2
fi

if [[ ! -d "$TASK_DIR_MANIFEST" ]]; then
  echo "subagent-wrapper: task directory does not exist: $TASK_DIR_MANIFEST" >&2
  exit 2
fi

# Validate command shape early for clearer wrapper-level errors.
if [[ "$(jq -r 'if (.command | type) == "array" and (.command | length) > 0 then "ok" else "bad" end' "$MANIFEST_PATH")" != "ok" ]]; then
  echo "subagent-wrapper: manifest command must be a non-empty array" >&2
  exit 2
fi

# ── Ensure tmux server ──

bash "$TMUX_MANAGER" ensure-server || {
  echo "subagent-wrapper: failed to ensure tmux server" >&2
  exit 2
}

if [[ -z "${TMUX:-}" ]]; then
  ATTACH_HINT=$(bash "$TMUX_MANAGER" attach-hint 2>/dev/null || true)
  if [[ -n "$ATTACH_HINT" ]]; then
    echo "subagent-wrapper: subagent tmux server is detached; attach with: $ATTACH_HINT" >&2
  fi
fi

# ── Write runner script executed inside the tmux pane ──

RUN_SCRIPT="$TASK_DIR_MANIFEST/.run.sh"

cat > "$RUN_SCRIPT" <<'RUNNER'
#!/usr/bin/env bash
set -uo pipefail

TASK_DIR="$1"
MANIFEST_PATH="$2"
STREAM_FILTER="$3"

cd "$TASK_DIR" || exit 1

# Export environment variables from manifest. Values are transported through TSV
# so spaces/quotes survive without shell interpolation in the wrapper.
while IFS=$'\t' read -r key value; do
  [[ -z "$key" ]] && continue
  export "$key=$value"
done < <(jq -r '.env // {} | to_entries[] | [.key, (.value | tostring)] | @tsv' "$MANIFEST_PATH")

# Read pi command as an argv array. Each JSON string is base64-encoded
# before crossing the shell boundary, so embedded newlines stay inside the
# original argv entry instead of becoming mapfile record separators.
PI_CMD=()
while IFS= read -r encoded_arg; do
  PI_CMD+=("$(printf '%s' "$encoded_arg" | base64 --decode)")
done < <(jq -r '.command[] | @base64' "$MANIFEST_PATH")

# Run pi and pipe stdout through the stream filter. Do not use `set -e` here:
# a non-zero pi exit is expected to be captured and propagated by the wrapper.
{
  "${PI_CMD[@]}"
  pi_exit_code=$?
  echo "$pi_exit_code" > .pi_exit_code
} | bash "$STREAM_FILTER" "$TASK_DIR" "$MANIFEST_PATH"
RUNNER

chmod +x "$RUN_SCRIPT"

PANE_COMMAND=$(printf 'bash %q %q %q %q' "$RUN_SCRIPT" "$TASK_DIR_MANIFEST" "$MANIFEST_PATH" "$STREAM_FILTER")

PANE_ID=$(bash "$TMUX_MANAGER" open-pane "$AGENT_ID" "$MANIFEST_PATH" "$PANE_COMMAND")

if [[ -z "$PANE_ID" ]]; then
  echo "subagent-wrapper: failed to open tmux pane" >&2
  exit 2
fi

# ── Wait for pane process to complete ──

while tmux -S "$SOCKET_PATH" list-panes -t "$SESSION" -F '#{pane_id}' 2>/dev/null | grep -qF "$PANE_ID"; do
  sleep 0.3
done

# ── Normalize output and exit code ──

PI_EXIT_CODE=0
if [[ -f "$TASK_DIR_MANIFEST/.pi_exit_code" ]]; then
  PI_EXIT_CODE=$(tr -d '[:space:]' < "$TASK_DIR_MANIFEST/.pi_exit_code")
  rm -f "$TASK_DIR_MANIFEST/.pi_exit_code"
fi

OUTPUT_FILE="$TASK_DIR_MANIFEST/output.md"

if [[ -f "$OUTPUT_FILE" ]]; then
  if [[ "$PI_EXIT_CODE" -ne 0 && ! -s "$OUTPUT_FILE" ]]; then
    echo "[ERROR] Subagent exited with code $PI_EXIT_CODE and produced no output." > "$OUTPUT_FILE"
  fi
else
  echo "[ERROR] Subagent completed but no output.md was produced." > "$OUTPUT_FILE"
  PI_EXIT_CODE=1
fi

exit "$PI_EXIT_CODE"
