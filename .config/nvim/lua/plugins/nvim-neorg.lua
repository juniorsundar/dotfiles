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
					["core.defaults"] = {}, -- Loads default behaviour
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
					}, -- Adds pretty icons to your documents
					["core.dirman"] = { -- Manages Neorg workspaces
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

			local function neorg_workspace_selector()
				local neorg_loaded, neorg = pcall(require, "neorg.core")
				assert(neorg_loaded, "Neorg is not loaded - please make sure to load Neorg first")
				local workspaces = neorg.modules.get_module("core.dirman").get_workspaces()
				local results = {}

				for name, path in pairs(workspaces) do
					table.insert(results, { name, path .. "/index.norg" })
				end

				local pickers = require("telescope.pickers")
				local finders = require("telescope.finders")
				local conf = require("telescope.config").values
				local previewers = require("telescope.previewers")
				local actions = require("telescope.actions")
				local action_state = require("telescope.actions.state")

				pickers
					.new({}, {
						prompt_title = "Select an Neorg Workspace",
						finder = finders.new_table({
							results = results,
							entry_maker = function(entry)
								return {
									value = entry[1],
									display = entry[1],
									ordinal = entry[1],
									path = entry[2],
								}
							end,
						}),
						sorter = conf.generic_sorter({}),
						previewer = previewers.vim_buffer_cat.new({}),
						attach_mappings = function(prompt_bufnr, _)
							actions.select_default:replace(function()
								local selection = action_state.get_selected_entry(prompt_bufnr)
								actions.close(prompt_bufnr)
								vim.cmd("Neorg workspace " .. selection.value)
							end)
							return true
						end,
					})
					:find()
			end

			vim.keymap.set("n", "<leader>Nw", neorg_workspace_selector, { noremap = true, silent = true, desc = "Workspaces" })
		end,
	},
}
