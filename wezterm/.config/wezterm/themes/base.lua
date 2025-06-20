local colours = require("themes.cyberdream")
M = {
    foreground = colours.text,
    background = colours.base,

    cursor_bg = colours.text,
    cursor_fg = colours.base,
    cursor_border = colours.text,

    selection_fg = colours.text,
    selection_bg = colours.crust,

    scrollbar_thumb = colours.base,
    split = colours.crust,

    ansi = { colours.base, colours.red, colours.green, colours.yellow, colours.blue, colours.mauve, colours.sky, colours.text },
    brights = { colours.crust, colours.red, colours.green, colours.yellow, colours.blue, colours.mauve, colours.sky, colours.text },
    indexed = { [16] = colours.peach, [17] = colours.red },

    tab_bar = {
        inactive_tab_edge = colours.base,
    },
}

return M
