#!/usr/bin/env bash
# ~/.claude/statusline-command.sh
# Claude Code status line command

input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
repo=$(echo "$input" | jq -r '.workspace.repo | if . then .owner + "/" + .name else empty end')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five_hour=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
worktree=$(echo "$input" | jq -r '.workspace.git_worktree // empty')

parts=()

fish_cwd() {
    local path
    path=$(echo "$1" | sed "s|^$HOME|~|")
    local IFS='/'
    read -ra segs <<< "$path"
    local n=${#segs[@]}
    local result=""
    for (( i=0; i<n; i++ )); do
        seg="${segs[$i]}"
        if [ $i -lt $(( n - 1 )) ]; then
            if [ -z "$seg" ]; then
                result+="/"
            elif [ "$seg" = "~" ]; then
                result+="~/"
            else
                result+="${seg:0:1}/"
            fi
        else
            result+="$seg"
        fi
    done
    echo "$result"
}

if [ -n "$cwd" ]; then
    short_cwd=$(fish_cwd "$cwd")
    parts+=("$short_cwd")
fi

if [ -n "$repo" ]; then
    repo_part="$repo"
    if [ -n "$worktree" ]; then
        repo_part="$repo_part [$worktree]"
    fi
    parts+=("$repo_part")
fi

if [ -n "$model" ]; then
    parts+=("$model")
fi

if [ -n "$used" ]; then
    used_int=$(printf '%.0f' "$used")
    parts+=("ctx:${used_int}%")
fi

if [ -n "$five_hour" ]; then
    five_int=$(printf '%.0f' "$five_hour")
    parts+=("5h:${five_int}%")
fi

printf '%s' "$(IFS=' | '; echo "${parts[*]}")"
