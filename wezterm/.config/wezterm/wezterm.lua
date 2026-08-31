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
config.font_size = 10

local palette = require "themes.doomone"
config.colors = palette

config.use_fancy_tab_bar = true
config.tab_bar_at_bottom = false
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

local function kill_workspace(window, pane)
    local workspace = window:active_workspace()

    local next_workspace = nil

    for _, name in ipairs(wezterm.mux.get_workspace_names()) do
        if name ~= workspace then
            next_workspace = name
            break
        end
    end

    if next_workspace then
        window:perform_action(
            act.SwitchToWorkspace { name = next_workspace },
            pane
        )
    end

    for _, mux_window in ipairs(wezterm.mux.all_windows()) do
        if mux_window:get_workspace() == workspace then
            for _, tab in ipairs(mux_window:tabs()) do
                for _, p in ipairs(tab:panes()) do
                    wezterm.run_child_process {
                        "wezterm",
                        "cli",
                        "--prefer-mux",
                        "kill-pane",
                        "--pane-id",
                        tostring(p:pane_id()),
                    }
                end
            end
        end
    end
end

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

-- wnv: the wezterm counterpart of scripts/.scripts/nv. The shell
-- script emits a WNW user var carrying the target workspace, the
-- nvim command and its cwd. We ensure the workspace exists on the
-- mux server (creating a dedicated nvim window for it if needed) and
-- then switch the CURRENT window to it.
--
-- Note: we must never use `SwitchToWorkspace` with a `spawn` argument
-- for a workspace that has no windows yet -- wezterm implements that
-- case by opening a brand new OS window (SpawnWhere::NewWindow), which
-- is exactly the behaviour we don't want. Instead we create the window
-- server-side via `wezterm cli spawn`, wait for it to sync into this
-- GUI instance, and only then switch; at that point the workspace is
-- non-empty and SwitchToWorkspace just moves this window over.

local WNW_SYNC_TRIES = 20
local WNW_SYNC_INTERVAL_MS = 100

local function wnw_workspace_exists(name)
    for _, w in ipairs(wezterm.mux.all_windows()) do
        if w:get_workspace() == name then
            return true
        end
    end
    return false
end

-- Wait for the mux sync to bring the workspace's window into this
-- GUI instance's local view of the mux.
local function wnw_wait_for_workspace(name)
    for _ = 1, WNW_SYNC_TRIES do
        if wnw_workspace_exists(name) then
            return true
        end
        wezterm.sleep_ms(WNW_SYNC_INTERVAL_MS)
    end
    return wnw_workspace_exists(name)
end

-- Ask the mux server directly whether the workspace exists there.
local function wnw_workspace_exists_on_server(name)
    local success, stdout = wezterm.run_child_process {
        "wezterm",
        "cli",
        "--prefer-mux",
        "list",
        "--format",
        "json",
    }
    if not success then
        return false
    end
    local ok, panes = pcall(wezterm.json_parse, tostring(stdout))
    if not ok or type(panes) ~= "table" then
        return false
    end
    for _, entry in ipairs(panes) do
        if entry.workspace == name then
            return true
        end
    end
    return false
end

-- Create the workspace on the mux server with a dedicated window
-- running the nvim command. Nothing is displayed by this: the window
-- lives on the server, outside our active workspace, until we switch
-- to it below.
local function wnw_create_workspace(data)
    local args = {
        "wezterm",
        "cli",
        "--prefer-mux",
        "spawn",
        "--workspace",
        data.workspace,
        "--new-window",
    }
    if data.cwd then
        table.insert(args, "--cwd")
        table.insert(args, data.cwd)
    end
    if data.args and #data.args > 0 then
        table.insert(args, "--")
        for _, arg in ipairs(data.args) do
            table.insert(args, tostring(arg))
        end
    end
    local success, _, stderr = wezterm.run_child_process(args)
    return success, tostring(stderr or "")
end

wezterm.on("user-var-changed", function(window, pane, name, value)
    if name ~= "WNW" or not value or value == "" then
        return
    end

    local ok, data = pcall(wezterm.json_parse, value)
    if not ok then
        wezterm.log_error("wnw: failed to parse payload: " .. tostring(data))
        return
    end
    if not data.workspace or data.workspace == "" then
        return
    end

    local ws = data.workspace

    if not wnw_workspace_exists(ws) then
        if not wnw_workspace_exists_on_server(ws) then
            local success, stderr = wnw_create_workspace(data)
            if not success then
                wezterm.log_error("wnw: creating workspace failed: " .. stderr)
                window:toast_window("wnv", "failed to create workspace " .. ws)
                return
            end
        end
        -- The window was (or may already have been) created on the mux
        -- server; wait for it to sync into this GUI instance before
        -- switching. If we switched while the workspace still looked
        -- empty, SwitchToWorkspace would open a new OS window for it.
        if not wnw_wait_for_workspace(ws) then
            wezterm.log_error(
                "wnw: workspace " .. ws .. " has no windows visible to this instance"
            )
            window:toast_window("wnv", "workspace " .. ws .. " is not available")
            return
        end
    end

    window:perform_action(act.SwitchToWorkspace { name = ws }, pane)
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
    {
        key = "b",
        mods = "CTRL|SHIFT",
        action = wezterm.action_callback(function(window, pane)
            -- Detach the mux domain explicitly. Note that
            -- `DetachDomain "CurrentPaneDomain"` silently does nothing
            -- when the current pane belongs to the local domain (i.e. this
            -- GUI never connected to the mux -- e.g. launched via
            -- `wezterm start` instead of bare `wezterm`/`connect mux`).
            local domain = wezterm.mux.get_domain("mux")
            if not domain or domain:state() == "Detached" then
                window:toast_window(
                    "detach",
                    "this window is not connected to the mux server"
                )
                return
            end
            window:perform_action(
                act.DetachDomain { DomainName = "mux" },
                pane
            )
        end),
    },
    {
        key = "k",
        mods = "CTRL|SHIFT",
        action = wezterm.action_callback(kill_workspace),
    },
    {
        key = "m",
        mods = "CTRL|SHIFT",
        action = act.AttachDomain "mux",
    },
    {
        key = "s",
        mods = "CTRL|SHIFT",
        action = act.ShowLauncherArgs {
            flags = "FUZZY|WORKSPACES",
        },
    },
    {
        key = "n",
        mods = "CTRL|SHIFT",
        action = act.PromptInputLine {
            description = "New workspace:",
            action = wezterm.action_callback(function(window, pane, name)
                if name and #name > 0 then
                    window:perform_action(
                        act.SwitchToWorkspace {
                            name = name,
                            spawn = {
                                domain = { DomainName = "mux" },
                            },
                        },
                        pane
                    )
                end
            end),
        },
    },
}

config.unix_domains = {
    {
        name = "mux",
        serve_command = {
            "env",
            "WEZTERM_PERSISTENT_MUX=1",
            "wezterm-mux-server",
            "--daemonize",
        },
    },
}

config.default_gui_startup_args = { "connect", "mux" }
config.exec_domains = require("extras.docker").docker_exec_domain(wezterm)


return config
