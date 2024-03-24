#!/bin/bash

# Check for empty input
if [[ $# -eq 0 ]]; then  # Check if no arguments were provided 
    echo "Usage: tmux_helper.sh <session_name> <session_folder>"
    echo "Creates a new detached tmux session with the given name and starts in the specified folder."
    exit 0
fi

tmux new-session -d -s $1 -c $2
