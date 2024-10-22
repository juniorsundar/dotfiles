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
config.font = wezterm.font_with_fallback({
    { family = "Fira Code", weight = "Regular" },
    { family = "Symbols Nerd Font", weight = "Regular" },
})

config.font_rules = {
  {
    intensity = "Bold",
    italic = true,
    font = wezterm.font({ family = "Cascadia Code", weight = "Bold", style = "Italic" }),
  },
  {
    italic = true,
    intensity = "Half",
    font = wezterm.font({ family = "Cascadia Code", weight = "DemiBold", style = "Italic" }),
  },
  {
    italic = true,
    intensity = "Normal",
    font = wezterm.font({ family = "Cascadia Code", style = "Italic" }),
  },
}

config.font_size = 13

-- Cyberdream
-- config.colors = {
--     foreground = "#ffffff",
--     background = "#16181a",
--
--     cursor_bg = "#ffffff",
--     cursor_fg = "#16181a",
--     cursor_border = "#ffffff",
--
--     selection_fg = "#ffffff",
--     selection_bg = "#3c4048",
--
--     scrollbar_thumb = "#16181a",
--     split = "#16181a",
--
--     ansi = { "#16181a", "#ff6e5e", "#5eff6c", "#f1ff5e", "#5ea1ff", "#bd5eff", "#5ef1ff", "#ffffff" },
--     brights = { "#3c4048", "#ff6e5e", "#5eff6c", "#f1ff5e", "#5ea1ff", "#bd5eff", "#5ef1ff", "#ffffff" },
--     indexed = { [16] = "#ffbd5e", [17] = "#ff6e5e" },
-- }

-- Modus_Vivendi
config.colors = {
    foreground = "#ffffff",
    background = "#000000",

    cursor_bg = "#ffffff",
    cursor_fg = "#000000",
    cursor_border = "#ffffff",

    selection_fg = "#ffffff",
    selection_bg = "#303030",

    scrollbar_thumb = "#000000",
    split = "#000000",

    ansi = { "#000000", "#ff5f59", "#44bc44", "#d0bc00", "#2fafff", "#b6a0ff", "#4ae2f0", "#ffffff" },
    brights = { "#303030", "#ff5f59", "#44bc44", "#d0bc00", "#2fafff", "#b6a0ff", "#4ae2f0", "#ffffff" },
    indexed = { [16] = "#fec43f", [17] = "#ff5f59" },
}
-- config.color_scheme = "Catppuccin Frappe"
config.use_fancy_tab_bar = false

config.force_reverse_video_cursor = true
config.warn_about_missing_glyphs = false
config.hide_tab_bar_if_only_one_tab = true
-- Disable font ligatures
-- config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }
-- Spawn a fish shell in login mode

config.window_padding = {
    -- 	left = 2.5,
    -- 	right = 2.5,
    top = 3,
    bottom = 3,
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

-- and finally, return the configuration to wezterm
return config
