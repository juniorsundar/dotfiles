-- Pull in the wezterm API
local wezterm = require("wezterm")
local act = wezterm.action

-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
	config = wezterm.config_builder()
end

-- This is where you actually apply your config choices

-- For example, changing the color scheme:
-- config.font = wezterm.font("MesloLGS Nerd Font", { weight = "Regular" })
config.font = wezterm.font("JetBrainsMono Nerd Font", { weight = "Regular" })
config.font_size = 11

-- Nordic Theme
config.colors = {
	foreground = "#D8DEE9",
	background = "#242933",

	cursor_bg = "#D8DEE9",
	cursor_border = "#D8DEE9",
	cursor_fg = "#242933",

	selection_fg = "#D8DEE9",
	selection_bg = "#2E3440",

	split = "#81A1C1",

	compose_cursor = "#ff9e64",
	scrollbar_thumb = "#292e42",

	ansi = { "#191D24", "#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#8FBCBB", "#D8DEE9" },
	brights = { "#3B4252", "#D06F79", "#B1D196", "#F0D399", "#88C0D0", "#C895BF", "#93CCDC", "#E5E9F0" },
}

config.colors.tab_bar = {
	inactive_tab_edge = "#1f2335",
	background = "#242933",
}
config.colors.tab_bar.active_tab = {
	fg_color = "#1f2335",
	bg_color = "#81A1C1",
}
config.colors.tab_bar.inactive_tab = {
	fg_color = "#D8DEE9",
	bg_color = "#242933",
}
config.colors.tab_bar.inactive_tab_hover = {
    fg_color = "#81A1C1",
    bg_color = "#292e42",
}
config.colors.tab_bar.new_tab = {
    fg_color = "#81A1C1",
    bg_color = "#242933",
}
config.colors.tab_bar.new_tab_hover = {
    fg_color = "#81A1C1",
    bg_color = "#242933",
    intensity = "Bold",
}

config.force_reverse_video_cursor = true
config.warn_about_missing_glyphs = false
config.hide_tab_bar_if_only_one_tab = true
-- Disable font ligatures
config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }

config.keys = {
	{
		key = "t",
		mods = "CTRL|SHIFT",
		action = act.SpawnTab("CurrentPaneDomain"),
	},
	{
		key = "|",
		mods = "CTRL|SHIFT",
		action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }),
	},
	{
		key = "_",
		mods = "CTRL|SHIFT",
		action = act.SplitVertical({ domain = "CurrentPaneDomain" }),
	},
	{
		key = "d",
		mods = "CTRL|SHIFT",
		action = wezterm.action.CloseCurrentPane({ confirm = true }),
	},
	{
		key = "w",
		mods = "CTRL|SHIFT",
		action = wezterm.action.CloseCurrentTab({ confirm = true }),
	},
}

-- and finally, return the configuration to wezterm
return config
