return {
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
