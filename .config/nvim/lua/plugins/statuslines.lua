return {
    {
        "nvim-lualine/lualine.nvim",
        config = function()
            local lualine_status, lualine = pcall(require, "lualine")
            if not lualine_status then
                return
            end

            local prose_status, prose = pcall(require, "nvim-prose")
            if not prose_status then
                return
            end

            -- configure Lualine with modified theme
            lualine.setup({
                options = {
                    icons_enabled = true,
                    theme = "auto",
                    component_separators = { left = "", right = "" },
                    -- section_separators = { left = "", right = "" },
                    section_separators = { left = "", right = "" },
                    disabled_filetypes = {
                        "neo-tree",
                        "no-neck-pain",
                        "NvimTree",
                        "oil",
                    },
                    ignore_focus = {},
                    always_divide_middle = true,
                    globalstatus = false,
                    refresh = {
                        statusline = 1000,
                        tabline = 1000,
                        winbar = 1000,
                    },
                },
                sections = {
                    lualine_a = { { "mode", separator = { left = "" }, right_padding = 2 } },
                    lualine_b = { "branch", "diagnostics" },
                    lualine_c = { { "filename" } },
                    lualine_x = { require("NeoComposer.ui").status_recording },
                    lualine_y = { "filetype" },
                    lualine_z = { { "location", separator = { right = "" }, left_padding = 2 } },
                },
                inactive_sections = {
                    lualine_c = { { "filename", path = 2 } },
                    lualine_z = { "location" },
                },
                tabline = {},
                winbar = {
                    lualine_z = {
                        {
                            prose.word_count,
                            cond = prose.is_available,
                            separator = { left = "", right = "" },
                            left_padding = 2,
                            right_padding = 2,
                        },
                    },
                },
                inactive_winbar = {},
                extensions = {},
            })
        end,
    },
}
