#!/bin/sh
xrandr --output eDP-1 --off --output DP-1-0 --off --output DP-1-1 --primary --mode 2560x1440 --pos 0x0 --rotate normal --output DP-1-2 --off --output DP-1-3 --off --output HDMI-1-0 --mode 2560x1440 --pos 2560x0 --rotate normal

sleep 2

killall i3bar
killall polybar
setxkbmap -layout us -option grp:shifts_toggle
setxkbmap -option caps:escape
nitrogen --restore
bash ~/.config/polybar/launch_polybar.bash
