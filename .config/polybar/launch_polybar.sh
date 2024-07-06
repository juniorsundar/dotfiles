#!/bin/bash

if type "/usr/bin/xrandr"; then
  for m in $(/usr/bin/xrandr --query | grep " connected" | cut -d" " -f1); do
    MONITOR=$m polybar --reload top &
    MONITOR=$m polybar --reload bottom &
  done
else
  polybar --reload top &
  polybar --reload bottom &
fi
