#!/bin/sh
xrandr --output eDP-1 --primary --mode 1920x1200 --pos 1760x2000 --rotate normal --output HDMI-1 --mode 2560x1440 --pos 1440x560 --rotate normal --output DP-1 --mode 2560x1440 --pos 0x0 --rotate right --output DP-2 --off --output DP-3 --off --output DP-4 --off --output DP-3-1 --off --output DP-3-2 --off --output DP-3-3 --off

sleep 2

killall i3bar
killall polybar
setxkbmap -layout us -option grp:shifts_toggle
setxkbmap -option caps:escape
nitrogen --restore
bash ~/.config/polybar/launch_polybar.sh
