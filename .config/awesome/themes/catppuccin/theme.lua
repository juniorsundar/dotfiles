-------------------------------
--  "catppuccin" catppuccin theme  --
--    By Adrian C. (anrxc)   --
-------------------------------

local theme_assets = require("beautiful.theme_assets")
local themes_path = "~/.config/awesome/themes/"
local dpi = require("beautiful.xresources").apply_dpi
local gears = require("gears")

-- {{{ Main
local theme = {}
theme.wallpaper = themes_path .. "catppuccin/catppuccin-background3.png"
-- }}}

-- {{{ Styles
theme.font      = "FiraCode Nerd Font 9"
theme.border_radius = dpi(5)

-- catppuccin COLORS
theme.catppuccin0  = "#303446"
theme.catppuccin1  = "#292c3c"
theme.catppuccin2  = "#414559"
theme.catppuccin3  = "#51576d"
theme.catppuccin4  = "#626880"
theme.catppuccin5  = "#c6d0f5"
theme.catppuccin6  = "#f2d5cf"
theme.catppuccin7  = "#babbf1"
theme.catppuccin8  = "#e78284"
theme.catppuccin9  = "#ef9f76"
theme.catppuccin10 = "#e5c890"
theme.catppuccin11 = "#a6d189"
theme.catppuccin12 = "#81c8be"
theme.catppuccin13 = "#8caaee"
theme.catppuccin14 = "#ca9ee6"
theme.catppuccin15 = "#eebebe"
theme.transparent   = "#00000000"

-- {{{ Colors
theme.fg_normal  = theme.catppuccin5
theme.bg_normal  = theme.catppuccin0
theme.fg_focus   = theme.catppuccin8
theme.bg_focus   = theme.catppuccin1
theme.fg_urgent  = theme.catppuccin12
theme.bg_urgent  = theme.catppuccin4
theme.bg_systray = theme.bg_normal
-- }}}

-- {{{ Borders
theme.useless_gap   = dpi(0)
theme.border_width  = dpi(2)
theme.border_normal = theme.catppuccin4
theme.border_focus  = theme.catppuccin14
theme.border_marked = theme.catppuccin15
-- }}}

-- {{{ Titlebars
theme.titlebar_fg_normal = theme.catppuccin2
theme.titlebar_bg_normal = theme.catppuccin0
theme.titlebar_fg_focus = theme.catppuccin1
theme.titlebar_bg_focus = theme.catppuccin14
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
theme.tasklist_fg_focus = theme.catppuccin1
theme.tasklist_bg_focus = theme.catppuccin14
theme.tasklist_fg_normal = theme.catppuccin2
theme.tasklist_bg_normal = theme.catppuccin7
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
theme.mouse_finder_color = theme.catppuccin12
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
theme.taglist_fg_empty = theme.catppuccin5
theme.taglist_bg_empty = theme.catppuccin0
theme.taglist_fg_occupied = theme.catppuccin1
theme.taglist_bg_occupied = theme.catppuccin7
theme.taglist_fg_focus = theme.catppuccin4
theme.taglist_bg_focus = theme.catppuccin14
-- local taglist_square_size = dpi(4)
-- theme.taglist_squares_sel = theme_assets.taglist_squares_sel(
--     taglist_square_size, theme.catppuccin0
-- )
-- theme.taglist_squares_unsel = theme_assets.taglist_squares_unsel(
--     taglist_square_size, theme.catppuccin4
-- )
theme.taglist_shape = function(cr, w, h)
    return gears.shape.rounded_rect(cr, w, h, theme.border_radius)
end

--theme.taglist_squares_resize = "false"
-- }}}

-- {{{ Misc
theme.catppuccin_icon           = themes_path .. "catppuccin/catppuccin-icon.png"
theme.menu_submenu_icon      = themes_path .. "default/submenu.png"
-- }}}

-- {{{ Layout
theme.layout_tile       = themes_path .. "catppuccin/layouts/tile.png"
theme.layout_tileleft   = themes_path .. "catppuccin/layouts/tileleft.png"
theme.layout_tilebottom = themes_path .. "catppuccin/layouts/tilebottom.png"
theme.layout_tiletop    = themes_path .. "catppuccin/layouts/tiletop.png"
theme.layout_fairv      = themes_path .. "catppuccin/layouts/fairv.png"
theme.layout_fairh      = themes_path .. "catppuccin/layouts/fairh.png"
theme.layout_spiral     = themes_path .. "catppuccin/layouts/spiral.png"
theme.layout_dwindle    = themes_path .. "catppuccin/layouts/dwindle.png"
theme.layout_max        = themes_path .. "catppuccin/layouts/max.png"
theme.layout_fullscreen = themes_path .. "catppuccin/layouts/fullscreen.png"
theme.layout_magnifier  = themes_path .. "catppuccin/layouts/magnifier.png"
theme.layout_floating   = themes_path .. "catppuccin/layouts/floating.png"
theme.layout_cornernw   = themes_path .. "catppuccin/layouts/cornernw.png"
theme.layout_cornerne   = themes_path .. "catppuccin/layouts/cornerne.png"
theme.layout_cornersw   = themes_path .. "catppuccin/layouts/cornersw.png"
theme.layout_cornerse   = themes_path .. "catppuccin/layouts/cornerse.png"
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
