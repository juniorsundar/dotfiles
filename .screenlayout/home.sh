#!/bin/sh
xrandr --output DP-0 --primary --mode 2560x1440 --pos 0x480 --rotate normal --output DP-1 --off --output DP-2 --mode 1920x1080 --pos 2560x0 --rotate left --output DP-3 --off --output HDMI-0 --off --output DP-4 --off --output DP-5 --off

sleep 2
killall i3bar
killall polybar
setxkbmap -layout us -option grp:shifts_toggle
nitrogen --restore
bash ~/.config/polybar/launch_polybar.sh
