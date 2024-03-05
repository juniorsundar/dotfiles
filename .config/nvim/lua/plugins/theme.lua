return {
    {
        "NTBBloodbath/doom-one.nvim",
        setup = function()
            -- Add color to cursor
            vim.g.doom_one_cursor_coloring = false
            -- Set :terminal colors
            vim.g.doom_one_terminal_colors = true
            -- Enable italic comments
            vim.g.doom_one_italic_comments = false
            -- Enable TS support
            vim.g.doom_one_enable_treesitter = true
            -- Color whole diagnostic text or only underline
            vim.g.doom_one_diagnostics_text_color = false
            -- Enable transparent background
            vim.g.doom_one_transparent_background = false

            -- Pumblend transparency
            vim.g.doom_one_pumblend_enable = false
            vim.g.doom_one_pumblend_transparency = 20

            -- Plugins integration
            vim.g.doom_one_plugin_neorg = true
            vim.g.doom_one_plugin_barbar = false
            vim.g.doom_one_plugin_telescope = true
            vim.g.doom_one_plugin_neogit = true
            vim.g.doom_one_plugin_nvim_tree = true
            vim.g.doom_one_plugin_dashboard = true
            vim.g.doom_one_plugin_startify = true
            vim.g.doom_one_plugin_whichkey = true
            vim.g.doom_one_plugin_indent_blankline = true
            vim.g.doom_one_plugin_vim_illuminate = true
            vim.g.doom_one_plugin_lspsaga = false
        end,
    },
    {
        "rebelot/kanagawa.nvim",
        lazy = true,
        priority = 1000,
        config = function()
            require("kanagawa").setup({
                -- overrides = function(colors)
                -- 	local theme = colors.theme
                -- 	return {
                -- 		-- NormalFloat = { bg = "none" },
                -- 		FloatBorder = { bg = "none" },
                -- 		FloatTitle = { bg = "none" },
                -- 		NormalDark = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },
                -- 	}
                -- end,
            })
            -- vim.cmd.colorscheme("kanagawa-wave")
        end,
    },
    {
        "folke/tokyonight.nvim",
        lazy = true,
        priority = 1000,
        opts = {},
        config = function()
            require("tokyonight").setup({})
        end,
    },
    {
        "juniorsundar/nordic.nvim",
        lazy = false,
        priority = 1000,
        config = function()
            local palette = require("nordic.colors")
            require("nordic").setup({
                telescope = {
                    style = "classic",
                },
                leap = {
                    dim_backdrop = true,
                },
                override = {
                    WhichKeyBorder = { fg = palette.black1, bg = palette.black1 },
                },
            })
            vim.opt.fillchars = { eob = " " }
            vim.cmd.colorscheme("nordic")
        end,
    },
    {
        "nvim-tree/nvim-web-devicons",
    },
}
