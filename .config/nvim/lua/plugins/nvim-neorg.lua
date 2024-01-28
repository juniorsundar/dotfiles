return {
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
				}, -- Adds pretty icons to your documents
				["core.dirman"] = { -- Manages Neorg workspaces
					config = {
						workspaces = {
							notes = "~/Documents/casual/neorg/notes",
							journal = "~/Documents/casual/neorg/journal",
						},
					},
				},
				["core.export"] = {},
				["core.export.markdown"] = {},
                ["core.summary"] = {},
			},
		})
	end,
}
