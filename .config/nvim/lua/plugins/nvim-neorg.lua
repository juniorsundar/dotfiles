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
							-- icon_preset = "diamond",
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
		end,
	},
}
