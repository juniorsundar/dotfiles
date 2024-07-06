#!/bin/bash

case "$1" in
    powermenu)
        options=" Power Off\n Restart\n Log Out\n Sleep"
        selected=$(echo -e "$options" | rofi -dmenu -p "Power Menu: ")

        case "$selected" in
            " Power Off")
                systemctl poweroff
                ;;
            " Restart")
                systemctl reboot
                ;;
            " Log Out")
                i3-msg exit
                ;;
            " Sleep")
                systemctl suspend
                ;;
            *)
                echo "No match"
                ;;
        esac
        ;;
    *)
        echo "Invalid option"
        ;;
esac
