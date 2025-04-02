#!/bin/bash

# Get session names, removing ANSI escape codes
sessions=$(zellij ls | ansifilter | awk '{print $1}')

# Select a session using fzf
selected_session=$(echo "$sessions" | fzf)

# Attach to the selected session
if [ -n "$selected_session" ]; then
   zellij attach "$selected_session"
fi
