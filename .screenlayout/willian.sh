#!/bin/sh
xrandr --output eDP-1 --primary --mode 1920x1200 --pos 1760x1743 --rotate normal --output HDMI-1 --mode 2560x1440 --pos 1440x303 --rotate normal --output DP-1 --off --output DP-2 --off --output DP-3 --off --output DP-4 --off --output DP-3-1 --off --output DP-3-2 --off --output DP-3-3 --mode 2560x1440 --pos 0x0 --rotate right

sleep 2

setxkbmap -layout us -option grp:shifts_toggle
nitrogen --restore
