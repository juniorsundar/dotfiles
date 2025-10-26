-- Pull in the wezterm API
local wezterm = require "wezterm"
local act = wezterm.action

-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
    config = wezterm.config_builder()
end

local font_function = require "fonts.iosevka"
font_function.apply_font(config, wezterm)
config.font_size = 13

local palette = require "themes.doomone"
config.colors = palette

config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = false
config.window_frame = {
    font = wezterm.font { family = "Iosevka Aile", weight = "Bold" },
    font_size = 12.0,
    active_titlebar_bg = palette.background,
    inactive_titlebar_bg = palette.background,
    border_bottom_height = '0.25cell',
    border_top_height = '0.25cell',
}

config.force_reverse_video_cursor = true
config.warn_about_missing_glyphs = false
config.hide_tab_bar_if_only_one_tab = true

config.window_padding = {
    -- 	left = 2.5,
    -- 	right = 2.5,
    top = '0.0cell',
    bottom = '0.0cell',
}

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

wezterm.on('open-uri', function(window, pane, uri)
    local editor = 'nvim'

    if uri:find '^file:' == 1 and not pane:is_alt_screen_active() then
        -- We're processing an hyperlink and the uri format should be: file://[HOSTNAME]/PATH[#linenr]
        -- Also the pane is not in an alternate screen (an editor, less, etc)
        local url = wezterm.url.parse(uri)
        if is_shell(pane:get_foreground_process_name()) then
            -- A shell has been detected. Wezterm can check the file type directly
            -- figure out what kind of file we're dealing with
            local success, stdout, _ = wezterm.run_child_process {
                'file',
                '--brief',
                '--mime-type',
                url.file_path,
            }
            if success then
                if stdout:find 'directory' then
                    pane:send_text(
                        wezterm.shell_join_args { 'cd', url.file_path } .. '\r'
                    )
                    pane:send_text(wezterm.shell_join_args {
                        'ls',
                        '-a',
                        '-p',
                        '--group-directories-first',
                    } .. '\r')
                    return false
                end

                if stdout:find 'text' then
                    if url.fragment then
                        pane:send_text(wezterm.shell_join_args {
                            editor,
                            '+' .. url.fragment,
                            url.file_path,
                        } .. '\r')
                    else
                        pane:send_text(
                            wezterm.shell_join_args { editor, url.file_path } .. '\r'
                        )
                    end
                    return false
                end
            end
        else
            -- No shell detected, we're probably connected with SSH, use fallback command
            local edit_cmd = url.fragment
                and editor .. ' +' .. url.fragment .. ' "$_f"'
                or editor .. ' "$_f"'
            local cmd = '_f="'
                .. url.file_path
                .. '"; { test -d "$_f" && { cd "$_f" ; ls -a -p --hyperlink --group-directories-first; }; } '
                .. '|| { test "$(file --brief --mime-type "$_f" | cut -d/ -f1 || true)" = "text" && '
                .. edit_cmd
                .. '; }; echo'
            pane:send_text(cmd .. '\r')
            return false
        end
    end

    -- without a return value, we allow default actions
end)


-- and finally, return the configuration to wezterm
return config
