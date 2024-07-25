#!/bin/bash

if type "xrandr"; then
  for m in $(xrandr --query | grep " connected" | cut -d" " -f1); do
    MONITOR=$m polybar --config=~/.config/polybar/config.ini --reload top &
    MONITOR=$m polybar --config=~/.config/polybar/config.ini --reload bottom &
  done
else
  polybar --reload top &
  polybar --reload bottom &
fi
