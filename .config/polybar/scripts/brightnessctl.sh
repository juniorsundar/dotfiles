#!/bin/bash
BRIGHTNESS_VALUE=`brightnessctl | grep -o "(.*" | tr -d "()"`
BRIGHTNESS_NR=${BRIGHTNESS_VALUE//%}

if [ $BRIGHTNESS_NR -lt 10 ]; then
	BRIGHTNESS_ICON='󰃚'
elif [ $BRIGHTNESS_NR -lt 30 ]; then
	BRIGHTNESS_ICON='󰃛'
elif [ $BRIGHTNESS_NR -lt 40 ]; then
	BRIGHTNESS_ICON='󰃜'
elif [ $BRIGHTNESS_NR -lt 60 ]; then
	BRIGHTNESS_ICON='󰃝'
elif [ $BRIGHTNESS_NR -lt 80 ]; then
	BRIGHTNESS_ICON='󰃞'
elif [ $BRIGHTNESS_NR -lt 90 ]; then
	BRIGHTNESS_ICON='󰃟'
else
	BRIGHTNESS_ICON='󰃠'
fi

echo "$BRIGHTNESS_ICON $BRIGHTNESS_VALUE"
