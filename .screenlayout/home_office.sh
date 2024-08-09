#!/bin/sh
xrandr --output eDP-1 --mode 1920x1200 --pos 0x240 --rotate normal --output HDMI-1 --primary --mode 2560x1440 --pos 1920x0 --rotate normal --output DP-1 --off --output DP-2 --off --output DP-3 --off --output DP-4 --off

sleep 2
killall i3bar
killall polybar
nitrogen --restore
setxkbmap -layout us -option grp:shifts_toggle
bash ~/.config/polybar/launch_polybar.sh
