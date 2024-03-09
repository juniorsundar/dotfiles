return {
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
    {
        "nvim-tree/nvim-web-devicons",
    },
}
