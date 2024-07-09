#!/bin/bash

# Get the active window ID
window_id=$(xdotool getactivewindow)

# Get the application name
app_name=$(xprop -id "$window_id" | grep WM_CLASS | awk -F '"' '{print $4}')

# Get the window title
window_title=$(xdotool getwindowname "$window_id")

# Print in the desired format
echo "$app_name | $window_title"
