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

            local function neorg_node_injector()
                local current_workspace = neorg.modules.get_module("core.dirman").get_current_workspace()

                local base_directory = current_workspace[2]
                local norg_files_output = vim.fn.systemlist("fdfind -e norg --type f --base-directory " .. base_directory)
                local norg_files = table.concat(norg_files_output, " ")
                local rg_command = 'rg --multiline "(?s)@document\\.meta.*?title:\\s+(.*?)\\s+@end" ' .. norg_files
                local rg_results = vim.fn.system(rg_command)

                -- Extract lines containing "title:"
                local titles = {}
                for line in rg_results:gmatch("[^\r\n]+") do
                    if line:find("title:") then
                        table.insert(titles, line)
                    end
                end

                -- Concatenate the filtered lines into a single string
                local filtered_results = table.concat(titles, "\n")

                local title_path_pairs = {}

                -- Iterate over each line in the output
                for line in filtered_results:gmatch("[^\r\n]+") do
                    -- Split the line into two parts based on ":"
                    local file_path, title = line:match("^(.-):(.*)$")
                    _, title = title:match("^(.-): (.*)$")

                    title_path_pairs[title] = file_path
                end

                local workspace_previewer = builtin.buffer_or_file:extend()

                function workspace_previewer:new(o, opts, fzf_win)
                    workspace_previewer.super.new(self, o, opts, fzf_win)
                    setmetatable(self, workspace_previewer)
                    return self
                end

                function workspace_previewer:parse_entry(entry_str)
                    return {
                        path = base_directory.."/" ..title_path_pairs[entry_str],
                        line = 1,
                        col = 1,
                    }
                end

                local navigate_to = function (selected)
                    print("Navigating to --> "..selected[1])
                    vim.cmd("e "..base_directory..title_path_pairs[selected[1]]:sub(2))
                end

                local paste_address = function (selected)
                    print("Pasting address of --> "..selected[1])
                    local hyperlink = "{:$"..title_path_pairs[selected[1]]:sub(2,-6)..":}["..selected[1].."]"

                    local cursor_pos = vim.api.nvim_win_get_cursor(0)
                    vim.api.nvim_put({hyperlink}, "", true, true)

                    vim.api.nvim_win_set_cursor(0, cursor_pos)
                end

                local function table_keys(tbl)
                    local keys = {}
                    for key, _ in pairs(tbl) do
                        table.insert(keys, key)
                    end
                    return keys
                end

                local prompt = "Navigate to -> "
                fzf_lua.fzf_exec(table_keys(title_path_pairs), {
                    previewer = workspace_previewer,
                    prompt = prompt,
                    actions = {
                        ["default"] = navigate_to,
                        ["ctrl-i"] = paste_address,
                    },
                })

            end

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

            vim.keymap.set("n", "<leader>Nw", neorg_workspace_selector, { noremap = true, silent = true, desc = "Workspaces" })
            vim.keymap.set("n", "<leader>Nf", neorg_node_injector, { noremap = true, silent = true, desc = "Node Injector" })
        end,
    },
}
