return {
    "goolord/alpha-nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
        local dashboard = require("alpha.themes.dashboard")
        require("alpha.themes.theta").header.val = {
            [[                        ██]],
            [[                        ██]],
            [[                       ████]],
            [[                      ██████]],
            [[                     ███  ███]],
            [[                     ███  ███]],
            [[                    ███    ███]],
            [[                   ███      ███]],
            [[                   ███      ███]],
            [[                  ███        ███]],
            [[                  ███        ███]],
            [[                 ███          ███]],
            [[                ███            ███]],
            [[               ████            ████]],
            [[               ███              ███]],
            [[              ███                ███]],
            [[             ████                ████]],
            [[            ████                  ████]],
            [[           ████                    ████]],
            [[ █      ███████                    ███████      █]],
            [[  ████████████                      ████████████]],
            [[  ████████████                      ████████████]],
            [[  ███████████                        ███████████]],
            [[  ██████████                          ██████████]],
            [[  ██████████                          ██████████]],
            [[     ███████                          ████████]],
            [[       █████                          █████]],
            [[         ████                        ████]],
            [[    █       ███                    ███       █]],
            [[       █        ██              ██        █]],
            [[         ██             ██             ██]],
            [[             ████     ██████     ████]],
            [[                 ████████████████]],
        }

        Footer = function()
            local stats = require("lazy").stats()
            return { " loaded " .. stats.loaded .. "/" .. stats.count .. " plugins" }
        end

        require("alpha.themes.theta").buttons.val = {
            { type = "text",    val = "Quick links", opts = { hl = "SpecialComment", position = "center" } },
            { type = "padding", val = 1 },
            dashboard.button("e", "  New file", "<cmd>ene<CR>"),
            dashboard.button("<C-j>", "󰃶  Open Daily Journal", "<cmd>Neorg journal today<CR>"),
            dashboard.button("c", "  Configuration", "<cmd>cd ~/.config/nvim/ <CR>"),
            dashboard.button("u", "  Update plugins", "<cmd>Lazy sync<CR>"),
            dashboard.button("q", "󰅚  Quit", "<cmd>qa<CR>"),
            {
                type = "text",
                val = "Statistics",
                opts = { hl = "SpecialComment", position = "center" },
            },
            { type = "padding", val = 1 },
            { type = "text",    val = Footer(), opts = { position = "center" } }, -- require("lazy").stats().startuptime
        }
        require("alpha").setup(require("alpha.themes.theta").config)
    end,
}
