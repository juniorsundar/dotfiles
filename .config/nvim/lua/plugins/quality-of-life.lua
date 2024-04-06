return {
	{
		"lukas-reineke/indent-blankline.nvim",
		opts = {
			indent = {
				char = "│",
				tab_char = "│",
			},
			scope = { enabled = false },
			exclude = {
				filetypes = {
					"help",
					"alpha",
					"dashboard",
					"neo-tree",
					"Trouble",
					"trouble",
					"lazy",
					"mason",
					"notify",
					"toggleterm",
					"lazyterm",
					"norg",
				},
			},
		},
		main = "ibl",
	},
	{
		"folke/flash.nvim",
		event = "VeryLazy",
		opts = {},
        -- stylua: ignore
        keys = {
            { "<C-s>",   mode = { "n", "x", "o" }, function() require("flash").jump() end,              desc = "Flash" },
            { "<C-S-s>", mode = { "n", "x", "o" }, function() require("flash").treesitter() end,        desc = "Flash Treesitter" },
            { "r",       mode = "o",               function() require("flash").remote() end,            desc = "Remote Flash" },
            { "R",       mode = { "o", "x" },      function() require("flash").treesitter_search() end, desc = "Treesitter Search" },
            { "<C-s>",   mode = { "c" },           function() require("flash").toggle() end,            desc = "Toggle Flash Search" },
        },
	},
	{
		"ecthelionvi/NeoComposer.nvim",
		dependencies = { "kkharji/sqlite.lua" },
		config = function()
			require("NeoComposer").setup({
				window = {
					winhl = {
						Normal = "Normal",
					},
				},
			})
			require("NeoComposer.ui").status_recording()
		end,
	},
}
