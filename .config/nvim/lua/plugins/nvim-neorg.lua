return {
    {
        "nvim-neorg/neorg",
        build = ":Neorg sync-parsers",
        -- tag = "*",
        dependencies = { "nvim-lua/plenary.nvim" },
        config = function()
            vim.opt.conceallevel = 2
            require("neorg").setup({
                load = {
                    ["core.defaults"] = {}, -- Loads default behaviour
                    ["core.concealer"] = {
                        config = {
                            icon_preset = "diamond",
                        },
                    },   -- Adds pretty icons to your documents
                    ["core.dirman"] = { -- Manages Neorg workspaces
                        config = {
                            workspaces = {
                                default = "~/neorg",
                                notes = "~/neorg/notes",
                                the_good_teacher = "~/neorg/the-good-teacher",
                                god_of_war = "~/neorg/god-of-war",
                                journal = "~/neorg/journal",
                            },
                        },
                    },
                    ["core.export"] = {},
                    ["core.export.markdown"] = {},
                    ["core.summary"] = {},
                },
            })
        end,
    },
    -- {
    --     "lukas-reineke/headlines.nvim",
    --     dependencies = "nvim-treesitter/nvim-treesitter",
    --     opts = {},
    --     config = function()
    --         require("headlines").setup {}
    --     end
    -- },
}
