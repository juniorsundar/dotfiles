-------------------------------
--  "nord" nord theme  --
--    By Adrian C. (anrxc)   --
-------------------------------

local themes_path = "~/.config/awesome/themes/"
local dpi = require("beautiful.xresources").apply_dpi

-- {{{ Main
local theme = {}
-- theme.wallpaper = themes_path .. "tokyonight/nord-background.png"
theme.wallpaper = themes_path .. "tokyonight/nord-background2.png"
-- }}}

-- {{{ Styles
theme.font      = "RobotoMono Nerd Font 9"

-- NORD COLORS
theme.nord0  = "#24283b"
theme.nord1  = "#f7768e"
theme.nord2  = "#9ece6a"
theme.nord3  = "#e0af68"
theme.nord4  = "#7aa2f7"
theme.nord5  = "#bb9af7"
theme.nord6  = "#bb9af7"
theme.nord7  = "#a9b1d6"
theme.nord8  = "#414868"
theme.nord9  = "#f7768e"
theme.nord10 = "#9ece6a"
theme.nord11 = "#e0af68"
theme.nord12 = "#7aa2f7"
theme.nord13 = "#bb9af7"
theme.nord14 = "#bb9af7"
theme.nord15 = "#c0caf5"
theme.transparent   = "#00000000"

-- {{{ Colors
theme.fg_normal  = theme.nord6
theme.fg_focus   = theme.nord8
theme.fg_urgent  = theme.nord12
theme.bg_normal  = theme.nord0
theme.bg_focus   = theme.nord1
theme.bg_urgent  = theme.nord0
theme.bg_systray = theme.bg_normal
-- }}}

-- {{{ Borders
theme.useless_gap   = dpi(0)
theme.border_width  = dpi(2)
theme.border_normal = theme.nord0
theme.border_focus  = theme.nord4
theme.border_marked = theme.nord15
-- }}}

-- {{{ Titlebars
theme.titlebar_bg_focus = theme.nord1
theme.titlebar_bg_normal = theme.nord0
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
theme.tasklist_fg_focus = theme.nord0
theme.tasklist_bg_focus = theme.nord4
theme.tasklist_icon_size = dpi(1)
theme.tasklist_plain_task_name = true

theme.taglist_spacing = dpi(2)

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
theme.mouse_finder_color = theme.nord12
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
theme.taglist_fg_focus = theme.nord0
theme.taglist_bg_focus = theme.nord4
theme.taglist_squares_sel   = themes_path .. "tokyonight/taglist/squarefz2.png"
theme.taglist_squares_unsel = themes_path .. "tokyonight/taglist/squarez.png"
--theme.taglist_squares_resize = "false"
-- }}}

-- {{{ Misc
theme.nord_icon           = themes_path .. "tokyonight/nord-icon.png"
theme.menu_submenu_icon      = themes_path .. "default/submenu.png"
-- }}}

-- {{{ Layout
theme.layout_tile       = themes_path .. "tokyonight/layouts/tile.png"
theme.layout_tileleft   = themes_path .. "tokyonight/layouts/tileleft.png"
theme.layout_tilebottom = themes_path .. "tokyonight/layouts/tilebottom.png"
theme.layout_tiletop    = themes_path .. "tokyonight/layouts/tiletop.png"
theme.layout_fairv      = themes_path .. "tokyonight/layouts/fairv.png"
theme.layout_fairh      = themes_path .. "tokyonight/layouts/fairh.png"
theme.layout_spiral     = themes_path .. "tokyonight/layouts/spiral.png"
theme.layout_dwindle    = themes_path .. "tokyonight/layouts/dwindle.png"
theme.layout_max        = themes_path .. "tokyonight/layouts/max.png"
theme.layout_fullscreen = themes_path .. "tokyonight/layouts/fullscreen.png"
theme.layout_magnifier  = themes_path .. "tokyonight/layouts/magnifier.png"
theme.layout_floating   = themes_path .. "tokyonight/layouts/floating.png"
theme.layout_cornernw   = themes_path .. "tokyonight/layouts/cornernw.png"
theme.layout_cornerne   = themes_path .. "tokyonight/layouts/cornerne.png"
theme.layout_cornersw   = themes_path .. "tokyonight/layouts/cornersw.png"
theme.layout_cornerse   = themes_path .. "tokyonight/layouts/cornerse.png"
-- }}}

-- {{{ Titlebar
theme.titlebar_close_button_focus  = themes_path .. "tokyonight/titlebar/close_focus.png"
theme.titlebar_close_button_normal = themes_path .. "tokyonight/titlebar/close_normal.png"

theme.titlebar_minimize_button_normal = themes_path .. "default/titlebar/minimize_normal.png"
theme.titlebar_minimize_button_focus  = themes_path .. "default/titlebar/minimize_focus.png"

theme.titlebar_ontop_button_focus_active  = themes_path .. "tokyonight/titlebar/ontop_focus_active.png"
theme.titlebar_ontop_button_normal_active = themes_path .. "tokyonight/titlebar/ontop_normal_active.png"
theme.titlebar_ontop_button_focus_inactive  = themes_path .. "tokyonight/titlebar/ontop_focus_inactive.png"
theme.titlebar_ontop_button_normal_inactive = themes_path .. "tokyonight/titlebar/ontop_normal_inactive.png"

theme.titlebar_sticky_button_focus_active  = themes_path .. "tokyonight/titlebar/sticky_focus_active.png"
theme.titlebar_sticky_button_normal_active = themes_path .. "tokyonight/titlebar/sticky_normal_active.png"
theme.titlebar_sticky_button_focus_inactive  = themes_path .. "tokyonight/titlebar/sticky_focus_inactive.png"
theme.titlebar_sticky_button_normal_inactive = themes_path .. "tokyonight/titlebar/sticky_normal_inactive.png"

theme.titlebar_floating_button_focus_active  = themes_path .. "tokyonight/titlebar/floating_focus_active.png"
theme.titlebar_floating_button_normal_active = themes_path .. "tokyonight/titlebar/floating_normal_active.png"
theme.titlebar_floating_button_focus_inactive  = themes_path .. "tokyonight/titlebar/floating_focus_inactive.png"
theme.titlebar_floating_button_normal_inactive = themes_path .. "tokyonight/titlebar/floating_normal_inactive.png"

theme.titlebar_maximized_button_focus_active  = themes_path .. "tokyonight/titlebar/maximized_focus_active.png"
theme.titlebar_maximized_button_normal_active = themes_path .. "tokyonight/titlebar/maximized_normal_active.png"
theme.titlebar_maximized_button_focus_inactive  = themes_path .. "tokyonight/titlebar/maximized_focus_inactive.png"
theme.titlebar_maximized_button_normal_inactive = themes_path .. "tokyonight/titlebar/maximized_normal_inactive.png"
-- }}}
-- }}}

return theme

-- vim: filetype=lua:expandtab:shiftwidth=4:tabstop=8:softtabstop=4:textwidth=80
