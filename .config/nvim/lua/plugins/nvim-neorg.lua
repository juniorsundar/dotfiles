return {
	{
		"vhyrro/luarocks.nvim",
		priority = 1000,
		config = true,
	},
	{
		"nvim-neorg/neorg",
		version = "*",
		dependencies = { "luarocks.nvim", "nvim-neorg/neorg-telescope" },
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
					["core.integrations.telescope"] = {},
					["core.qol.toc"] = {},
					["core.qol.todo_items"] = {},
					["core.looking-glass"] = {},
					["core.presenter"] = { config = { zen_mode = "zen-mode" } },
					["core.tangle"] = { config = { report_on_empty = false } },
					["core.ui.calendar"] = {},
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
