#!/bin/sh
xrandr --output eDP-1 --primary --mode 2560x1600 --pos 1440x1923 --rotate normal --output DP-1-0 --off --output DP-1-1 --off --output DP-1-2 --off --output DP-1-3 --mode 2560x1440 --pos 0x0 --rotate right --output HDMI-1-0 --mode 2560x1440 --pos 1440x483 --rotate normal
killall i3bar
killall polybar
setxkbmap -layout us -option grp:shifts_toggle
nitrogen --restore
bash ~/.config/polybar/launch_polybar.sh
