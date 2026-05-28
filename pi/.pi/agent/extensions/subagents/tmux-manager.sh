#!/usr/bin/env bash
set -euo pipefail

# tmux-manager.sh — Manage a workspace-local tmux server for subagent execution
# Usage: tmux-manager.sh <command> [args...]
#
# Commands:
#   ensure-server              Create the tmux server if it doesn't exist
#   open-pane <agent-id> <manifest-path> [command]  Open a new pane and run command (default: sleep 30)
#   kill-pane <pane-id>        Kill a specific pane
#   attach-hint                Print the tmux attach command for manual observation

COMMAND="${1:?command required}"
SCRIPT_PATH="$0"
SCRIPT_DIR="$(cd "${SCRIPT_PATH%/*}" && pwd)"

# Check that tmux is installed
if ! command -v tmux &>/dev/null; then
  echo "tmux-manager: tmux is not installed. Please install tmux to use subagents." >&2
  exit 1
fi

SOCKET_DIR="$(pwd)/.pi"
SOCKET_PATH="$SOCKET_DIR/subagents.sock"
SESSION_NAME="subagents"

ensure_server() {
  # Create socket directory if needed
  mkdir -p "$SOCKET_DIR"

  # Check if server already exists via the socket
  if tmux -S "$SOCKET_PATH" has-session -t "$SESSION_NAME" 2>/dev/null; then
    # Server already exists — idempotent, exit successfully
    return 0
  fi

  # If the socket file exists but the server is dead (e.g., after a crash),
  # remove the stale socket so new-session can create a fresh one.
  if [[ -S "$SOCKET_PATH" ]]; then
    rm -f "$SOCKET_PATH"
  fi

  # Create new detached session
  tmux -S "$SOCKET_PATH" new-session -d -s "$SESSION_NAME"
}

attach_hint() {
  echo "tmux -S \"$SOCKET_PATH\" attach -t $SESSION_NAME"
}

open_pane() {
  local agent_id="${1:?agent-id required}"
  local manifest_path="${2:?manifest-path required}"
  local pane_command="${3:-}"

  if [[ -z "$pane_command" ]]; then
    local wrapper_path="${SUBAGENT_WRAPPER_PATH:-$SCRIPT_DIR/subagent-wrapper.sh}"
    pane_command=$(printf 'bash %q %q' "$wrapper_path" "$manifest_path")
  fi

  # Ensure the manifest file exists
  if [[ ! -f "$manifest_path" ]]; then
    echo "tmux-manager: manifest file not found: $manifest_path" >&2
    exit 1
  fi

  # Ensure the tmux server exists (idempotent)
  ensure_server

  # Open a new pane: split horizontally, set agent-id as pane title
  local pane_id
  pane_id=$(tmux -S "$SOCKET_PATH" split-window -t "$SESSION_NAME" \
    -P -F '#{pane_id}' \
    "$pane_command")

  # Emit pane ID immediately so caller always receives it even if
  # the select-pane below fails (avoids orphan pane with no handle).
  echo "$pane_id"

  # Name the pane with the agent-id for identification
  tmux -S "$SOCKET_PATH" select-pane -t "$pane_id" -T "$agent_id"
}

kill_pane() {
  local pane_id="${1:?pane-id required}"
  tmux -S "$SOCKET_PATH" kill-pane -t "$pane_id"
}

case "$COMMAND" in
  ensure-server)
    ensure_server
    ;;
  attach-hint)
    attach_hint
    ;;
  open-pane)
    open_pane "$2" "$3" "${4:-}"
    ;;
  kill-pane)
    kill_pane "$2"
    ;;
  *)
    echo "tmux-manager: unknown command '$COMMAND'" >&2
    echo "Usage: tmux-manager.sh {ensure-server|open-pane|kill-pane|attach-hint}" >&2
    exit 1
    ;;
esac
