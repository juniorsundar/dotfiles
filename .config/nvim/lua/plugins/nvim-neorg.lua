return {
    {
        "vhyrro/luarocks.nvim",
        priority = 1000,
        config = true,
    },
    {
        "nvim-neorg/neorg",
        version = "*",
        dependencies = { "luarocks.nvim" },
        config = function()
            vim.api.nvim_create_autocmd("FileType", {
                pattern = "norg",
                callback = function()
                    vim.opt_local.conceallevel = 2
                    vim.opt_local.wrap = true
                end,
            })
            require("neorg").setup({
                load = {
                    ["core.defaults"] = {},
                    ["core.esupports.indent"] = {
                        config = {
                            tweaks = {
                                unordered_list1 = 0,
                                unordered_list2 = 3,
                                unordered_list3 = 6,
                                unordered_list4 = 9,
                                unordered_list5 = 12,
                                unordered_list6 = 15,
                                ordered_list1 = 0,
                                ordered_list2 = 3,
                                ordered_list3 = 6,
                                ordered_list4 = 9,
                                ordered_list5 = 12,
                                ordered_list6 = 15,
                            },
                        },
                    },
                    ["core.concealer"] = {
                        config = {
                            icons = { list = { icons = { "󰧞", "", "", "", "", "" } } },
                        },
                    },
                    ["core.dirman"] = {
                        config = {
                            workspaces = {
                                default = "~/neorg/notes",
                                the_good_teacher = "~/neorg/tgt",
                                god_of_war = "~/neorg/gow",
                            },
                        },
                    },
                    ["core.export"] = {},
                    ["core.export.markdown"] = {},
                    ["core.latex.renderer"] = {},
                    ["core.integrations.image"] = {},
                    ["core.summary"] = {},
                    ["core.qol.toc"] = {},
                    ["core.qol.todo_items"] = {},
                    ["core.looking-glass"] = {},
                    ["core.presenter"] = { config = { zen_mode = "zen-mode" } },
                    ["core.tangle"] = { config = { report_on_empty = false } },
                    ["core.ui.calendar"] = {},
                },
            })

            local neorg_loaded, neorg = pcall(require, "neorg.core")
            assert(neorg_loaded, "Neorg is not loaded - please make sure to load Neorg first")
            local fzf_lua_loaded, fzf_lua = pcall(require, "fzf-lua")
            assert(fzf_lua_loaded, "fzf-lua is not loaded - please make sure to load fzf-lua first")
            local builtin = require("fzf-lua.previewer.builtin")

            local function neorg_workspace_selector()
                local workspaces = neorg.modules.get_module("core.dirman").get_workspaces()
                local workspace_names = {}

                for name in pairs(workspaces) do
                    table.insert(workspace_names, name)
                end

                local workspace_previewer = builtin.buffer_or_file:extend()

                function workspace_previewer:new(o, opts, fzf_win)
                    workspace_previewer.super.new(self, o, opts, fzf_win)
                    setmetatable(self, workspace_previewer)
                    return self
                end

                function workspace_previewer:parse_entry(entry_str)
                    local path = workspaces[entry_str]
                    return {
                        path = path .. "/index.norg",
                        line = 1,
                        col = 1,
                    }
                end

                local workspace_set = function (selected)
                    vim.cmd("Neorg workspace " .. selected[1])
                end

                local workspace_open = function (selected)
                    vim.cmd("Neorg workspace " .. selected[1])
                    vim.cmd("Neorg index")
                end

                local prompt = "Select Neorg Directory -> "
                fzf_lua.fzf_exec(workspace_names, {
                    previewer = workspace_previewer,
                    prompt = prompt,
                    actions = {
                        ["default"] = workspace_set,
                        ["ctrl-i"] = workspace_open,
                    },
                })
            end

            vim.keymap.set(
                "n",
                "<leader>Nw",
                neorg_workspace_selector,
                { noremap = true, silent = true, desc = "Workspaces" }
            )
        end,
    },
}
