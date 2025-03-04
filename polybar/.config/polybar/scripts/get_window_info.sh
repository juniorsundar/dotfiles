#!/bin/bash

# Get the active window ID
window_id=$(xdotool getactivewindow 2>/dev/null)
if [ $? -ne 0 ]; then
  echo ""
  exit 1
fi

# Get the application name
app_name=$(xprop -id "$window_id" 2>/dev/null | grep WM_CLASS | awk -F '"' '{print $4}')
if [ $? -ne 0 ]; then
  echo ""
  exit 1
fi

# Get the window title
window_title=$(xdotool getwindowname "$window_id" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo ""
  exit 1
fi

# Print in the desired format
echo "$app_name | $window_title"
