#!/bin/bash

session=$(tmux list-sessions -F "#{session_name}" | fzf --height=5 --min-height=2 --layout=reverse)

if [[ -n $session ]]; then
    tmux attach -t "$session"
fi
