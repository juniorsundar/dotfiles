#!/usr/bin/env bash
set -euo pipefail

# stream-filter.sh — Filter pi --mode json output for tmux pane display
# Usage: stream-filter.sh <task_dir> <manifest_path>

TASK_DIR="${1:?task directory required}"
MANIFEST_PATH="${2:?manifest path required}"

EVENTS_FILE="$TASK_DIR/events.jsonl"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"
OUTPUT_FILE="$TASK_DIR/output.md"
LOG_FILE="$TASK_DIR/run.log"

if [[ ! -d "$TASK_DIR" ]]; then
  echo "error: task dir missing: $TASK_DIR" >&2
  exit 1
fi

# Select JSON parser
if command -v jq &>/dev/null; then
  JSON_PARSER="jq"
else
  JSON_PARSER="python3"
fi

# Initialize log
echo "stream-filter started, task_dir=$TASK_DIR, manifest=$MANIFEST_PATH" > "$LOG_FILE"

append_progress_event() {
  local type="$1"
  local status="$2"
  local text="$3"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [[ "$JSON_PARSER" == "jq" ]]; then
    jq -nc --arg type "$type" --arg status "$status" --arg text "$text" --arg timestamp "$timestamp" \
      '{type:$type,text:$text,timestamp:$timestamp} + (if $status == "" then {} else {status:$status} end)' \
      >> "$PROGRESS_FILE"
  else
    python3 - "$PROGRESS_FILE" "$type" "$status" "$text" "$timestamp" <<'PY'
import json
import sys

path, event_type, status, text, timestamp = sys.argv[1:]
event = {"type": event_type, "text": text, "timestamp": timestamp}
if status:
    event["status"] = status
with open(path, "a", encoding="utf-8") as progress_file:
    progress_file.write(json.dumps(event, separators=(",", ":")) + "\n")
PY
  fi
}

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
      append_progress_event "assistant_text" "" "$sentence"
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
lifecycle_started_emitted=0
lifecycle_completed_emitted=0

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
    agent_start)
      if [[ $lifecycle_started_emitted -eq 0 ]]; then
        append_progress_event "lifecycle" "started" "Subagent started"
        lifecycle_started_emitted=1
      fi
      ;;
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
      if [[ "$JSON_PARSER" == "jq" ]]; then
        message_role=$(echo "$line" | jq -r '.message.role // ""' 2>/dev/null || echo "")
      else
        message_role=$(echo "$line" | python3 -c "import sys,json; d=json.loads(sys.stdin.readline()); print(d.get('message',{}).get('role',''))" 2>/dev/null || echo "")
      fi
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

      # Emit usage progress event if message.usage is present
      if [[ "$JSON_PARSER" == "jq" ]]; then
        has_usage=$(echo "$line" | jq -r 'if .message.usage != null then "true" else "false" end' 2>/dev/null || echo "false")
      else
        has_usage=$(echo "$line" | python3 -c "
import sys, json
d = json.loads(sys.stdin.readline())
print('true' if d.get('message',{}).get('usage') is not None else 'false')
" 2>/dev/null || echo "false")
      fi

      if [[ "$has_usage" == "true" ]]; then
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        if [[ "$JSON_PARSER" == "jq" ]]; then
          usage_json=$(echo "$line" | jq -c '{
            type: "usage",
            text: ("Tokens: " + (.message.usage.input // 0 | tostring) + " input, " + (.message.usage.output // 0 | tostring) + " output, " + (.message.usage.cacheRead // 0 | tostring) + " cache read, " + (.message.usage.cacheWrite // 0 | tostring) + " cache write"),
            timestamp: $ts,
            input: (.message.usage.input // 0),
            output: (.message.usage.output // 0),
            cacheRead: (.message.usage.cacheRead // 0),
            cacheWrite: (.message.usage.cacheWrite // 0)
          }' --arg ts "$timestamp" 2>/dev/null)
          if [[ -n "$usage_json" ]]; then
            echo "$usage_json" >> "$PROGRESS_FILE"
          fi
        else
          python3 - "$PROGRESS_FILE" "$timestamp" "$line" <<'PY'
import json
import sys

progress_path, timestamp = sys.argv[1], sys.argv[2]
d = json.loads(sys.argv[3])
usage = d.get("message", {}).get("usage")
if usage:
    it = usage.get("input", 0)
    ot = usage.get("output", 0)
    cr = usage.get("cacheRead", 0)
    cw = usage.get("cacheWrite", 0)
    text = f"Tokens: {it} input, {ot} output, {cr} cache read, {cw} cache write"
    event = {
        "type": "usage",
        "text": text,
        "timestamp": timestamp,
        "input": it,
        "output": ot,
        "cacheRead": cr,
        "cacheWrite": cw,
    }
    with open(progress_path, "a", encoding="utf-8") as pf:
        pf.write(json.dumps(event, separators=(",", ":")) + "\n")
PY
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
      append_progress_event "tool" "started" "$summary"
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
        append_progress_event "tool" "failed" "Tool $tool_name failed"
        echo "  ✗ $tool_name"
      else
        append_progress_event "tool" "succeeded" "Tool $tool_name succeeded"
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

      # Emit final usage snapshot summed across all messages in the messages array
      if [[ "$JSON_PARSER" == "jq" ]]; then
        it=$(echo "$line" | jq '[.messages[].usage.input // 0] | add' 2>/dev/null || echo "0")
        ot=$(echo "$line" | jq '[.messages[].usage.output // 0] | add' 2>/dev/null || echo "0")
        cr=$(echo "$line" | jq '[.messages[].usage.cacheRead // 0] | add' 2>/dev/null || echo "0")
        cw=$(echo "$line" | jq '[.messages[].usage.cacheWrite // 0] | add' 2>/dev/null || echo "0")
        totalUsage=$((it + ot + cr + cw))
      else
        read it ot cr cw <<< $(echo "$line" | python3 -c "
import sys, json
d = json.loads(sys.stdin.readline())
it = sum(m.get('usage',{}).get('input',0) or 0 for m in d.get('messages',[]))
ot = sum(m.get('usage',{}).get('output',0) or 0 for m in d.get('messages',[]))
cr = sum(m.get('usage',{}).get('cacheRead',0) or 0 for m in d.get('messages',[]))
cw = sum(m.get('usage',{}).get('cacheWrite',0) or 0 for m in d.get('messages',[]))
print(it, ot, cr, cw)
" 2>/dev/null || echo "0 0 0 0")
        totalUsage=$((it + ot + cr + cw))
      fi

      if [[ $totalUsage -gt 0 ]]; then
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        if [[ "$JSON_PARSER" == "jq" ]]; then
          jq -nc \
            --arg type "usage" \
            --arg text "Tokens: $it input, $ot output, $cr cache read, $cw cache write" \
            --arg timestamp "$timestamp" \
            --argjson input "$it" \
            --argjson output "$ot" \
            --argjson cacheRead "$cr" \
            --argjson cacheWrite "$cw" \
            '{type:$type,text:$text,timestamp:$timestamp,input:$input,output:$output,cacheRead:$cacheRead,cacheWrite:$cacheWrite}' \
            >> "$PROGRESS_FILE"
        else
          python3 - "$PROGRESS_FILE" "$timestamp" "$it" "$ot" "$cr" "$cw" <<'PY'
import json
import sys

progress_path, timestamp = sys.argv[1], sys.argv[2]
it, ot, cr, cw = sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
text = f"Tokens: {it} input, {ot} output, {cr} cache read, {cw} cache write"
event = {
    "type": "usage",
    "text": text,
    "timestamp": timestamp,
    "input": int(it),
    "output": int(ot),
    "cacheRead": int(cr),
    "cacheWrite": int(cw),
}
with open(progress_path, "a", encoding="utf-8") as pf:
    pf.write(json.dumps(event, separators=(",", ":")) + "\n")
PY
        fi
      fi

      # Write output
      echo "$final_text" > "$OUTPUT_FILE"
      if [[ $lifecycle_completed_emitted -eq 0 ]]; then
        append_progress_event "lifecycle" "completed" "Subagent completed"
        lifecycle_completed_emitted=1
      fi
      append_progress_event "terminal" "completed" "Subagent completed"
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
append_progress_event "terminal" "failed" "Subagent failed: missing agent_end"
echo "error: missing agent_end" >> "$LOG_FILE"
exit 1
