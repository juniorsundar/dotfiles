return {
	{
		"echasnovski/mini.indentscope",
		version = false, -- wait till new 0.7.0 release to put it back on semver
		opts = {
			symbol = "▏",
			-- symbol = "│",
			options = { try_as_border = true },
		},
		init = function()
			vim.api.nvim_create_autocmd("FileType", {
				pattern = {
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
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
	{
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
						comment = "<C-/>",

						-- Toggle comment on current line
						comment_line = "<C-/>/",

						-- Toggle comment on visual selection
						comment_visual = "<C-/>",

						-- Define 'comment' textobject (like `dgc` - delete whole comment block)
						textobject = "<C-/>",
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
	},
	{
		"lukas-reineke/indent-blankline.nvim",
		opts = {
			indent = {
				char = "│",
				tab_char = "│",
			},
			scope = { enabled = true },
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
				},
			},
		},
		main = "ibl",
		config = function()
			require("ibl").setup()
		end,
	},
	{
		"chrisgrieser/nvim-recorder",
		dependencies = "rcarriga/nvim-notify", -- optional
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
