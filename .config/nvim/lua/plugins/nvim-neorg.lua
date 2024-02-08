return {
	{
		"nvim-neorg/neorg",
		build = ":Neorg sync-parsers",
		-- tag = "*",
		dependencies = { "nvim-lua/plenary.nvim", "nvim-neorg/neorg-telescope" },
		config = function()
			vim.api.nvim_create_autocmd("FileType", {
				pattern = "norg",
				callback = function()
					vim.opt_local.conceallevel = 2
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
							icon_preset = "diamond",
							icons = { list = { icons = { "󰧞", "", "", "", "", "" } } },
						},
					}, -- Adds pretty icons to your documents
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
					["core.integrations.telescope"] = {},
				},
			})

			vim.keymap.set(
				"n",
				"<leader>Nw",
				"<cmd>Telescope neorg switch_workspace<CR>",
				{ noremap = true, silent = true, desc = "Workspaces" }
			)
			-- local actions = require("telescope.actions")
			-- local action_state = require("telescope.actions.state")
			-- local finders = require("telescope.finders")
			-- local pickers = require("telescope.pickers")
			-- local previewers = require("telescope.previewers")
			-- local conf = require("telescope.config").values
			--
			-- local function neorg_workspace_selector()
			-- 	pickers
			-- 		.new({}, {
			-- 			prompt_title = "Select an Neorg Workspace",
			-- 			finder = finders.new_table({
			-- 				results = {
			-- 					{ "default", "~/neorg/README.norg" },
			-- 					{ "notes", "~/neorg/notes/index.norg" },
			-- 					{ "journal", "~/neorg/journal/index.norg" },
			-- 					{ "the_good_teacher", "~/neorg/the-good-teacher/index.norg" },
			-- 					{ "god_of_war", "~/neorg/god-of-war/index.norg" },
			-- 				},
			-- 				entry_maker = function(entry)
			-- 					return {
			-- 						value = entry[1],
			-- 						display = entry[1],
			-- 						ordinal = entry[1],
			-- 						path = entry[2],
			-- 					}
			-- 				end,
			-- 			}),
			-- 			sorter = conf.generic_sorter({}),
			-- 			previewer = previewers.vim_buffer_cat.new({}),
			-- 			attach_mappings = function(prompt_bufnr, _)
			-- 				actions.select_default:replace(function()
			-- 					local selection = action_state.get_selected_entry(prompt_bufnr)
			-- 					actions.close(prompt_bufnr)
			-- 					vim.cmd("Neorg workspace " .. selection.value)
			-- 				end)
			-- 				return true
			-- 			end,
			-- 		})
			-- 		:find()
			-- end
		end,
	},
}
