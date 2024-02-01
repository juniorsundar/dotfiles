return {
	{
		"nvim-neorg/neorg",
		build = ":Neorg sync-parsers",
		-- tag = "*",
		dependencies = { "nvim-lua/plenary.nvim" },
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
							-- indents = {
							-- 	["heading2"] = {
							-- 		indent = 3,
							-- 	},
							-- 	["heading3"] = {
							-- 		indent = 6,
							-- 	},
							-- 	["heading4"] = {
							-- 		indent = 9,
							-- 	},
							-- 	["heading5"] = {
							-- 		indent = 12,
							-- 	},
							-- },
							tweaks = {
								unordered_list1 = 0,
								unordered_list2 = 3,
								unordered_list3 = 6,
								unordered_list4 = 12,
								unordered_list5 = 15,
								ordered_list1 = 0,
								ordered_list2 = 3,
								ordered_list3 = 6,
								ordered_list4 = 12,
								ordered_list5 = 15,
							},
						},
					},
					["core.concealer"] = {
						config = {
							icon_preset = "diamond",
							icons = { list = { icons = { "󰧞", "", "", "󰝤", "", "" } } },
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
				},
			})
		end,
	},
}
