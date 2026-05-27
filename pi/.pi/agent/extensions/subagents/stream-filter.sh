#!/usr/bin/env bash
set -euo pipefail

# stream-filter.sh — Filter pi --mode json output for tmux pane display
# Usage: stream-filter.sh <task_dir> <manifest_path>

TASK_DIR="${1:?task directory required}"
MANIFEST_PATH="${2:?manifest path required}"

EVENTS_FILE="$TASK_DIR/events.jsonl"
OUTPUT_FILE="$TASK_DIR/output.md"
LOG_FILE="$TASK_DIR/run.log"

# Select JSON parser
if command -v jq &>/dev/null; then
  JSON_PARSER="jq"
else
  JSON_PARSER="python3"
fi

# Initialize log
echo "stream-filter started, task_dir=$TASK_DIR, manifest=$MANIFEST_PATH" > "$LOG_FILE"

# Text buffer for sentence accumulation
text_buffer=""

# Flush completed sentences from buffer to stdout
flush_sentences() {
  local remaining="$text_buffer"
  local flushed=""
  while true; do
    # Match: text ending with . ! ? followed by space or at end
    if [[ "$remaining" =~ ([^.!?]+[.!?])([[:space:]]|$) ]]; then
      local sentence="${BASH_REMATCH[1]}"
      local match_end=$((${#BASH_REMATCH[0]}))
      flushed="$flushed$sentence"$'\n'
      remaining="${remaining:$match_end}"
    else
      break
    fi
  done
  if [[ -n "$flushed" ]]; then
    printf '%s' "$flushed"
  fi
  text_buffer="$remaining"
}

final_text=""

# Process stdin line by line
while IFS= read -r line; do
  # Skip empty lines
  [[ -z "$line" ]] && continue

  # Validate JSON before appending to events file
  is_valid=0
  if [[ "$JSON_PARSER" == "jq" ]]; then
    echo "$line" | jq empty 2>/dev/null && is_valid=1 || true
  else
    echo "$line" | python3 -c "import sys,json; json.loads(sys.stdin.readline())" 2>/dev/null && is_valid=1 || true
  fi

  if [[ $is_valid -eq 1 ]]; then
    echo "$line" >> "$EVENTS_FILE"
  else
    echo "warning: skipping malformed JSON line" >> "$LOG_FILE"
    continue
  fi

  # Parse event type
  if [[ "$JSON_PARSER" == "jq" ]]; then
    event_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null || echo "")
  else
    event_type=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('type',''))" 2>/dev/null || echo "")
  fi

  # For message_update, extract sub-type from assistantMessageEvent
  sub_type=""
  if [[ "$event_type" == "message_update" ]]; then
    if [[ "$JSON_PARSER" == "jq" ]]; then
      sub_type=$(echo "$line" | jq -r '.assistantMessageEvent.type // empty' 2>/dev/null || echo "")
    else
      sub_type=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('assistantMessageEvent',{}).get('type',''))" 2>/dev/null || echo "")
    fi
  fi

  case "$event_type" in
    message_update)
      case "$sub_type" in
        text_delta)
          # Accumulate delta into buffer
          if [[ "$JSON_PARSER" == "jq" ]]; then
            delta=$(echo "$line" | jq -r '.assistantMessageEvent.delta // ""' 2>/dev/null || echo "")
          else
            delta=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('assistantMessageEvent',{}).get('delta',''))" 2>/dev/null || echo "")
          fi
          text_buffer="$text_buffer$delta"
          # Check for completed sentences and flush them
          flush_sentences
          ;;
        # thinking_delta, thinking_start, thinking_end: intentionally suppressed from pane view
      esac
      ;;
    message_end)
      # Extract final text from assistant messages
      message_role=$(echo "$line" | jq -r '.message.role // ""' 2>/dev/null || echo "")
      if [[ "$message_role" == "assistant" ]]; then
        if [[ "$JSON_PARSER" == "jq" ]]; then
          final_text=$(echo "$line" | jq -r '.message.content | map(select(.type == "text")) | map(.text) | join("\n")' 2>/dev/null || echo "")
        else
          final_text=$(echo "$line" | python3 -c "
import sys, json
d = json.loads(sys.stdin.readline())
msg = d.get('message', {})
if msg.get('role') == 'assistant':
  texts = [b.get('text','') for b in msg.get('content',[]) if b.get('type')=='text']
  print('\n'.join(texts))
" 2>/dev/null || echo "")
        fi
      fi
      ;;
    tool_execution_start|tool_call)
      # Render tool name + truncated args
      if [[ "$JSON_PARSER" == "jq" ]]; then
        tool_name=$(echo "$line" | jq -r '.toolName // "?"' 2>/dev/null || echo "?")
        args_str=$(echo "$line" | jq -c '.args // {}' 2>/dev/null || echo "{}")
      else
        tool_name=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('toolName','?'))" 2>/dev/null || echo "?")
        args_str=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(json.dumps(d.get('args',{})))" 2>/dev/null || echo "{}")
      fi
      # Truncate args to keep summary compact
      summary="[$tool_name] $args_str"
      if [[ ${#summary} -gt 120 ]]; then
        summary="${summary:0:117}..."
      fi
      echo "$summary"
      ;;
    tool_execution_end|tool_result)
      # Render success/failure indicator
      if [[ "$JSON_PARSER" == "jq" ]]; then
        tool_name=$(echo "$line" | jq -r '.toolName // "?"' 2>/dev/null || echo "?")
        is_error=$(echo "$line" | jq -r '.result.isError // false' 2>/dev/null || echo "false")
      else
        tool_name=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('toolName','?'))" 2>/dev/null || echo "?")
        is_error=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('result',{}).get('isError',False))" 2>/dev/null || echo "False")
      fi
      if [[ "$is_error" == "true" ]] || [[ "$is_error" == "True" ]]; then
        echo "  ✗ $tool_name"
      else
        echo "  ✓ $tool_name"
      fi
      ;;
    agent_end)
      # Use accumulated final_text from message_end if available,
      # otherwise extract from messages array
      if [[ -z "$final_text" ]]; then
        if [[ "$JSON_PARSER" == "jq" ]]; then
          final_text=$(echo "$line" | jq -r '
            .messages
            | map(select(.role == "assistant"))
            | last
            | .content
            | map(select(.type == "text"))
            | map(.text)
            | join("\n")
          ' 2>/dev/null || echo "")
        else
          final_text=$(echo "$line" | python3 -c "
import sys, json
d = json.loads(sys.stdin.readline())
for msg in reversed(d.get('messages', [])):
  if msg.get('role') == 'assistant':
    for block in msg.get('content', []):
      if block.get('type') == 'text':
        print(block.get('text', ''))
    break
" 2>/dev/null || echo "")
        fi
      fi
      # Note: text_buffer is for pane display only; final_text is authoritative.
      # Do not append text_buffer here — it would duplicate message_end/messages text.

      # Write output
      echo "$final_text" > "$OUTPUT_FILE"
      echo "completed" >> "$LOG_FILE"
      exit 0
      ;;
    *)
      # Unknown event type — silently ignored (already validated as valid JSON)
      ;;
  esac
done

# If we reach here, no agent_end was received
# Write partial output with error prefix
{
  echo "[ERROR] Agent ended without agent_end event"
  echo ""
  if [[ -n "$final_text" ]]; then
    echo "$final_text"
  fi
} > "$OUTPUT_FILE"
echo "error: missing agent_end" >> "$LOG_FILE"
exit 1
