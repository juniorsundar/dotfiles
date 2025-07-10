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

local font_function = require("fonts.jetbrains")
font_function.apply_font(config, wezterm)
config.font_size = 12

local palette = require("themes.astrodark")
config.colors = palette

config.use_fancy_tab_bar = true
config.window_frame = {
    font = wezterm.font { family = 'SF Pro', weight = 'Bold' },
    font_size = 12.0,
    active_titlebar_bg = palette.background,
    inactive_titlebar_bg = palette.background,
}

config.force_reverse_video_cursor = true
config.warn_about_missing_glyphs = false
config.hide_tab_bar_if_only_one_tab = true
-- Disable font ligatures
-- config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }

config.window_padding = {
    -- 	left = 2.5,
    -- 	right = 2.5,
    top = 0,
    bottom = 0,
}

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

config.unix_domains = {
    {
        name = 'personal',
    }
}

-- and finally, return the configuration to wezterm
return config
