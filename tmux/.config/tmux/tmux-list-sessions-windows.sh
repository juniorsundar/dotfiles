#!/bin/bash

# Function to get all tmux sessions and windows, formatted as required
get_tmux_sessions_and_windows() {
    tmux list-sessions -F '#S' | while read -r session; do
        echo "$session"
        tmux list-windows -t "$session" -F '   #I:#W'  # Indented window list for each session
    done
}

# Pipe the formatted list into fzf for selection
selected=$(get_tmux_sessions_and_windows | fzf --prompt="Select tmux session and window: " --height=20% --ansi)

# Check if a selection was made and that it includes a window (not just a session)
if [[ -n "$selected" && "$selected" =~ ^\ *([0-9]+): ]]; then
    # Extract session and window index from the selected line
    session_name=$(echo "$selected" | awk -F':' '{print $1}' | sed 's/^ *//')
    window_index=$(echo "$selected" | awk -F':' '{print $1}' | sed 's/^ *//')

    # Attach to the selected window
    tmux select-window -t "$session_name:$window_index"
    tmux attach-session -t "$session_name"
else
    echo "No valid window selected"
fi
