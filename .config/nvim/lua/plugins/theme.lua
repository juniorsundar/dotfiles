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
        "catppuccin/nvim",
        name = "catppuccin",
        priority = 1000,
        config = function()
            require("catppuccin").setup({
                custom_highlights = function(colors)
                    return {
                        WhichKeyBorder = { fg = colors.base },
                        CmpBorder = { fg = colors.surface2 },
                        Pmenu = { link = "NormalFloat" },
                    }
                end,
                integrations = {
                    cmp = true,
                    gitsigns = true,
                    treesitter = true,
                    alpha = true,
                    barbar = true,
                    flash = true,
                    markdown = true,
                    neogit = true,
                    treesitter_context = true,
                    telescope = {
                        enabled = true,
                        style = "nvchad",
                    },
                    which_key = true,
                },
            })
            vim.cmd.colorscheme("catppuccin-frappe")
        end,
    },
    { "rose-pine/neovim", lazy = true, name = "rose-pine" },
    {
        "juniorsundar/nightfox.nvim",
        lazy = true,
        priority = 1000,
        config = function()
            require("nightfox").setup({
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
    }, -- lazy
    {
        "juniorsundar/nordic.nvim",
        lazy = true,
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
            -- vim.cmd.colorscheme("nordic")
        end,
    },
    {
        "nvim-tree/nvim-web-devicons",
    },
}
