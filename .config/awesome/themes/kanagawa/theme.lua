-------------------------------
--  "kanagawa" kanagawa theme  --
--    By Adrian C. (anrxc)   --
-------------------------------

local theme_assets = require("beautiful.theme_assets")
local themes_path = "~/.config/awesome/themes/"
local dpi = require("beautiful.xresources").apply_dpi
local gears = require("gears")

-- {{{ Main
local theme = {}
-- theme.wallpaper = themes_path .. "kanagawa/kanagawa-background.png"
-- theme.wallpaper = themes_path .. "kanagawa/kanagawa-background2.png"
theme.wallpaper = themes_path .. "kanagawa/kanagawa-background3.png"
-- }}}

-- {{{ Styles
-- theme.font      = "MesloLGS Nerd Font 9"
theme.font      = "JetBrainsMono Nerd Font 9"
theme.border_radius = dpi(5)
-- theme.font      = "RobotoMono Nerd Font 9"

-- kanagawa COLORS
theme.kanagawa0  = "#1F1F28"
theme.kanagawa1  = "#2A2A37"
theme.kanagawa2  = "#223249"
theme.kanagawa3  = "#727169"
theme.kanagawa4  = "#C8C093"
theme.kanagawa5  = "#DCD7BA"
theme.kanagawa6  = "#938AA9"
theme.kanagawa7  = "#363646"
theme.kanagawa8  = "#C34043"
theme.kanagawa9  = "#FFA066"
theme.kanagawa10 = "#DCA561"
theme.kanagawa11 = "#98BB6C"
theme.kanagawa12 = "#7FB4CA"
theme.kanagawa13 = "#7E9CD8"
theme.kanagawa14 = "#957FB8"
theme.kanagawa15 = "#D27E99"
theme.transparent   = "#00000000"

-- {{{ Colors
theme.fg_normal  = theme.kanagawa6
theme.fg_focus   = theme.kanagawa8
theme.fg_urgent  = theme.kanagawa12
theme.bg_normal  = theme.kanagawa0
theme.bg_focus   = theme.kanagawa1
theme.bg_urgent  = theme.kanagawa0
theme.bg_systray = theme.bg_normal
-- }}}

-- {{{ Borders
theme.useless_gap   = dpi(0)
theme.border_width  = dpi(2)
theme.border_normal = theme.kanagawa0
theme.border_focus  = theme.kanagawa4
theme.border_marked = theme.kanagawa15
-- }}}

-- {{{ Titlebars
theme.titlebar_bg_focus = theme.kanagawa4
theme.titlebar_bg_normal = theme.kanagawa0
theme.titlebar_fg_normal = theme.kanagawa4
theme.titlebar_fg_focus = theme.kanagawa0
-- }}}

-- There are other variable sets
-- overriding the default one when
-- defined, the sets are:
-- [taglist|tasklist]_[bg|fg]_[focus|urgent|occupied|empty|volatile]
-- titlebar_[normal|focus]
-- tooltip_[font|opacity|fg_color|bg_color|border_width|border_color]
-- Example:
--theme.taglist_bg_focus = "#CC9393"
-- }}}
theme.tasklist_fg_focus = theme.kanagawa0
theme.tasklist_bg_focus = theme.kanagawa4
theme.tasklist_icon_size = dpi(1)
theme.tasklist_plain_task_name = true
theme.tasklist_shape = function(cr, w, h)
    return gears.shape.rounded_rect(cr, w, h, theme.border_radius)
end
theme.tasklist_spacing = dpi(2)
-- {{{ Widgets
-- You can add as many variables as
-- you wish and access them by using
-- beautiful.variable in your rc.lua
--theme.fg_widget        = "#AECF96"
--theme.fg_center_widget = "#88A175"
--theme.fg_end_widget    = "#FF5656"
--theme.bg_widget        = "#494B4F"
--theme.border_widget    = "#3F3F3F"
-- }}}

-- {{{ Mouse finder
theme.mouse_finder_color = theme.kanagawa12
-- mouse_finder_[timeout|animate_timeout|radius|factor]
-- }}}

-- {{{ Menu
-- Variables set for theming the menu:
-- menu_[bg|fg]_[normal|focus]
-- menu_[border_color|border_width]
theme.menu_height = dpi(15)
theme.menu_width  = dpi(100)
-- }}}

-- {{{ Icons
-- {{{ Taglist
theme.taglist_spacing = dpi(2)
theme.taglist_fg_empty = theme.kanagawa4
theme.taglist_bg_empty = theme.kanagawa1
theme.taglist_fg_occupied = theme.kanagawa4
theme.taglist_bg_occupied = theme.kanagawa3
theme.taglist_fg_focus = theme.kanagawa0
theme.taglist_bg_focus = theme.kanagawa4
-- local taglist_square_size = dpi(4)
-- theme.taglist_squares_sel = theme_assets.taglist_squares_sel(
--     taglist_square_size, theme.kanagawa0
-- )
-- theme.taglist_squares_unsel = theme_assets.taglist_squares_unsel(
--     taglist_square_size, theme.kanagawa4
-- )
theme.taglist_shape = function(cr, w, h)
    return gears.shape.rounded_rect(cr, w, h, theme.border_radius)
end

--theme.taglist_squares_resize = "false"
-- }}}

-- {{{ Misc
theme.kanagawa_icon           = themes_path .. "kanagawa/kanagawa-icon.png"
theme.menu_submenu_icon      = themes_path .. "default/submenu.png"
-- }}}

-- {{{ Layout
theme.layout_tile       = themes_path .. "kanagawa/layouts/tile.png"
theme.layout_tileleft   = themes_path .. "kanagawa/layouts/tileleft.png"
theme.layout_tilebottom = themes_path .. "kanagawa/layouts/tilebottom.png"
theme.layout_tiletop    = themes_path .. "kanagawa/layouts/tiletop.png"
theme.layout_fairv      = themes_path .. "kanagawa/layouts/fairv.png"
theme.layout_fairh      = themes_path .. "kanagawa/layouts/fairh.png"
theme.layout_spiral     = themes_path .. "kanagawa/layouts/spiral.png"
theme.layout_dwindle    = themes_path .. "kanagawa/layouts/dwindle.png"
theme.layout_max        = themes_path .. "kanagawa/layouts/max.png"
theme.layout_fullscreen = themes_path .. "kanagawa/layouts/fullscreen.png"
theme.layout_magnifier  = themes_path .. "kanagawa/layouts/magnifier.png"
theme.layout_floating   = themes_path .. "kanagawa/layouts/floating.png"
theme.layout_cornernw   = themes_path .. "kanagawa/layouts/cornernw.png"
theme.layout_cornerne   = themes_path .. "kanagawa/layouts/cornerne.png"
theme.layout_cornersw   = themes_path .. "kanagawa/layouts/cornersw.png"
theme.layout_cornerse   = themes_path .. "kanagawa/layouts/cornerse.png"
-- }}}

-- {{{ Titlebar
theme.titlebar_close_button_focus  = themes_path .. "default/titlebar/close_focus.png"
theme.titlebar_close_button_normal = themes_path .. "default/titlebar/close_normal.png"
theme.titlebar_minimize_button_normal = themes_path .. "default/titlebar/minimize_normal.png"
theme.titlebar_minimize_button_focus  = themes_path .. "default/titlebar/minimize_focus.png"
theme.titlebar_ontop_button_focus_active  = themes_path .. "default/titlebar/ontop_focus_active.png"
theme.titlebar_ontop_button_normal_active = themes_path .. "default/titlebar/ontop_normal_active.png"
theme.titlebar_ontop_button_focus_inactive  = themes_path .. "default/titlebar/ontop_focus_inactive.png"
theme.titlebar_ontop_button_normal_inactive = themes_path .. "default/titlebar/ontop_normal_inactive.png"
theme.titlebar_sticky_button_focus_active  = themes_path .. "default/titlebar/sticky_focus_active.png"
theme.titlebar_sticky_button_normal_active = themes_path .. "default/titlebar/sticky_normal_active.png"
theme.titlebar_sticky_button_focus_inactive  = themes_path .. "default/titlebar/sticky_focus_inactive.png"
theme.titlebar_sticky_button_normal_inactive = themes_path .. "default/titlebar/sticky_normal_inactive.png"
theme.titlebar_floating_button_focus_active  = themes_path .. "default/titlebar/floating_focus_active.png"
theme.titlebar_floating_button_normal_active = themes_path .. "default/titlebar/floating_normal_active.png"
theme.titlebar_floating_button_focus_inactive  = themes_path .. "default/titlebar/floating_focus_inactive.png"
theme.titlebar_floating_button_normal_inactive = themes_path .. "default/titlebar/floating_normal_inactive.png"
theme.titlebar_maximized_button_focus_active  = themes_path .. "default/titlebar/maximized_focus_active.png"
theme.titlebar_maximized_button_normal_active = themes_path .. "default/titlebar/maximized_normal_active.png"
theme.titlebar_maximized_button_focus_inactive  = themes_path .. "default/titlebar/maximized_focus_inactive.png"
theme.titlebar_maximized_button_normal_inactive = themes_path .. "default/titlebar/maximized_normal_inactive.png"
-- }}}
-- }}}

-- Generate Awesome icon:
theme.awesome_icon = theme_assets.awesome_icon(
    theme.menu_height, theme.bg_focus, theme.fg_focus
)

return theme

-- vim: filetype=lua:expandtab:shiftwidth=4:tabstop=8:softtabstop=4:textwidth=80
