#!/bin/bash

session=$(tmux list-sessions -F "#{session_name}" | fzf --layout=reverse)

if [[ -n $session ]]; then
    tmux attach -t "$session"
else
    tmux new-session
fi
