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

config.colors = {
    foreground = "#c0caf5",
    background = "#1a1b26",
    cursor_bg = "#c0caf5",
    cursor_border = "#c0caf5",
    cursor_fg = "#1a1b26",
    selection_bg = "#283457",
    selection_fg = "#c0caf5",
    split = "#7aa2f7",
    compose_cursor = "#ff9e64",
    scrollbar_thumb = "#292e42",

    ansi = { "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6" },
    brights = { "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5" },
}

config.colors.tab_bar = {
    inactive_tab_edge = "#16161e",
    background = "#1a1b26",
}

config.colors.tab_bar.active_tab = {
    fg_color = "#16161e",
    bg_color = "#7aa2f7",
}

config.colors.tab_bar.inactive_tab = {
    fg_color = "#545c7e",
    bg_color = "#292e42",
}

config.colors.tab_bar.inactive_tab_hover = {
    fg_color = "#7aa2f7",
    bg_color = "#292e42",
    -- # intensity = "Bold"
}

config.colors.tab_bar.new_tab_hover = {
    fg_color = "#7aa2f7",
    bg_color = "#1a1b26",
    intensity = "Bold",
}

config.colors.tab_bar.new_tab = {
    fg_color = "#7aa2f7",
    bg_color = "#1a1b26",
}

config.force_reverse_video_cursor = true

config.font_size = 10
config.hide_tab_bar_if_only_one_tab = true
-- Disable font ligatures
config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }

config.keys = {
    {
        key = "t",
        mods = "SUPER|SHIFT",
        action = act.SpawnTab("CurrentPaneDomain"),
    },
    {
        key = "|",
        mods = "SUPER|SHIFT",
        action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }),
    },
    {
        key = "_",
        mods = "SUPER|SHIFT",
        action = act.SplitVertical({ domain = "CurrentPaneDomain" }),
    },
    {
        key = "d",
        mods = "SUPER|SHIFT",
        action = wezterm.action.CloseCurrentPane({ confirm = true }),
    },
    {
        key = "w",
        mods = "SUPER|SHIFT",
        action = wezterm.action.CloseCurrentTab({ confirm = true }),
    },
}

-- and finally, return the configuration to wezterm
return config
