return {
	{
		"echasnovski/mini.comment",
		version = false,
		config = function()
			require("mini.comment").setup({
				-- Options which control module behavior
				options = {
					-- Function to compute custom 'commentstring' (optional)
					custom_commentstring = nil,

					-- Whether to ignore blank lines
					ignore_blank_line = false,

					-- Whether to recognize as comment only lines without indent
					start_of_line = false,

					-- Whether to ensure single space pad for comment parts
					pad_comment_parts = true,
				},

				-- Module mappings. Use `''` (empty string) to disable one.
				mappings = {
					-- Toggle comment (like `gcip` - comment inner paragraph) for both
					-- Normal and Visual modes
					comment = "<C-c>",

					-- Toggle comment on current line
					comment_line = "<C-c>c",

					-- Toggle comment on visual selection
					comment_visual = "<C-c>",

					-- Define 'comment' textobject (like `dgc` - delete whole comment block)
					textobject = "<C-c>",
				},

				-- Hook functions to be executed at certain stage of commenting
				hooks = {
					-- Before successful commenting. Does nothing by default.
					pre = function() end,
					-- After successful commenting. Does nothing by default.
					post = function() end,
				},
			})
		end,
	},
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
		"chrisgrieser/nvim-recorder",
		-- dependencies = "rcarriga/nvim-notify", -- optional
		opts = {}, -- required even with default settings, since it calls `setup()`
	},
	{
		"ggandor/leap.nvim",
		dependencies = {
			"tpope/vim-repeat",
		},
		config = function()
			require("leap").create_default_mappings()
		end,
	},
}
