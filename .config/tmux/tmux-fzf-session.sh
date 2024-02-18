#!/bin/bash

session=$(tmux list-sessions -F "#{session_name}" | fzf)

if [[ -n $session ]]; then
    tmux attach -t "$session"
fi
