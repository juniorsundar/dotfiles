-- Pull in the wezterm API
local wezterm = require "wezterm"
local act = wezterm.action
local io = require 'io'
local os = require 'os'

local config = {}

if wezterm.config_builder then
    config = wezterm.config_builder()
end

local font_function = require "fonts.lilex"
font_function.apply_font(config, wezterm)
config.font_size = 11.5

local palette = require "themes.doomone"
config.colors = palette

config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = true
config.hide_tab_bar_if_only_one_tab = true
config.window_frame = {
    font = wezterm.font { family = "IBM Plex Sans", weight = "Bold" },
    font_size = 12.0,
    active_titlebar_bg = palette.background,
    inactive_titlebar_bg = palette.background,
    border_bottom_height = '0.0cell',
    border_top_height = '0.0cell',
}

config.force_reverse_video_cursor = true
config.warn_about_missing_glyphs = false

config.window_padding = {
    -- 	left = 2.5,
    -- 	right = 2.5,
    top = '0.5cell',
    bottom = '0.0cell',
}

wezterm.on('trigger-nvim-with-scrollback', function(window, pane)
    local text = pane:get_lines_as_text(pane:get_dimensions().scrollback_rows)
    text = text:gsub("\x1b%[4[0-7]m", "")
    text = text:gsub("\x1b%[10[0-7]m", "")
    text = text:gsub("\x1b%[48;[0-9;]-m", "")

    text = "\x1b[0m" .. text .. "\x1b[0m"

    local name = os.tmpname()
    local f = io.open(name, 'w+')
    f:write(text)
    f:flush()
    f:close()

    window:perform_action(
        act.SpawnCommandInNewWindow {
            args = { 
                'nvim', 
                '+lua require("config.utils.colorise").colorise()', 
                name 
            },
        },
        pane
    )

    wezterm.sleep_ms(1000)
    os.remove(name)
end)

config.keys = {
    {
        key = "t",
        mods = "CTRL|SHIFT",
        action = act.SpawnTab "CurrentPaneDomain",
    },
    {
        key = "|",
        mods = "CTRL|SHIFT",
        action = act.SplitHorizontal { domain = "CurrentPaneDomain" },
    },
    {
        key = "_",
        mods = "CTRL|SHIFT",
        action = act.SplitVertical { domain = "CurrentPaneDomain" },
    },
    {
        key = "d",
        mods = "CTRL|SHIFT",
        action = wezterm.action.CloseCurrentPane { confirm = true },
    },
    {
        key = "w",
        mods = "CTRL|SHIFT",
        action = wezterm.action.CloseCurrentTab { confirm = true },
    },
    { key = "l", mods = "ALT", action = wezterm.action.ShowLauncher },
    {
        key = 'h',
        mods = 'CTRL|SHIFT',
        action = act.EmitEvent 'trigger-nvim-with-scrollback',
    },
}

config.unix_domains = {
    {
        name = "mux",
    },
}

config.exec_domains = require("extras.docker").docker_exec_domain(wezterm)

local function is_shell(foreground_process_name)
    local shell_names = { 'bash', 'zsh', 'fish', 'sh', 'ksh', 'dash' }
    local process = string.match(foreground_process_name, '[^/\\]+$')
    or foreground_process_name
    for _, shell in ipairs(shell_names) do
        if process == shell then
            return true
        end
    end
    return false
end

return config
