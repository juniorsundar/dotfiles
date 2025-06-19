local colours = require("themes.cyberdream")
M = {
    ansi = {
        '#000000',
        '#e46d63',
        '#58c18f',
        '#e9e64d',
        '#77abd9',
        '#d38dd9',
        '#60c1de',
        '#eaeaea',
    },
    background = '#1d1d1d',
    brights = {
        '#656565',
        '#e46d63',
        '#58c18f',
        '#e9e64d',
        '#77abd9',
        '#d38dd9',
        '#60c1de',
        '#eaeaea',
    },
    cursor_bg = '#d5d5d5',
    cursor_fg = '#282828',
    selection_fg = '#000000',
    selection_bg = '#c3c2c3',
    foreground = '#dcdcdc',
    cursor_border = '#d4d4d4',

    scrollbar_thumb = colours.base,
    split = colours.crust,

    indexed = { [16] = colours.peach, [17] = colours.red },

    tab_bar = {
        inactive_tab_edge = colours.base,
    },
}

return M
