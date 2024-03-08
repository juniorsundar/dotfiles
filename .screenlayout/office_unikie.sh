#!/bin/sh
xrandr --output eDP-1 --mode 1920x1200 --pos 2560x240 --rotate normal --output HDMI-1 --primary --mode 2560x1440 --pos 0x0 --rotate normal --output DP-1 --off --output DP-2 --off --output DP-3 --off --output DP-4 --off
setxkbmap -layout us -option grp:shifts_toggle
sleep 2
nitrogen --restore
