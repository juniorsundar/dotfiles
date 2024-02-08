return {
	{
		"rebelot/kanagawa.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("kanagawa").setup({
				overrides = function(colors)
					local theme = colors.theme
					return {
						-- NormalFloat = { bg = "none" },
						FloatBorder = { bg = "none" },
						FloatTitle = { bg = "none" },
						NormalDark = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },
					}
				end,
			})
			vim.cmd.colorscheme("kanagawa-wave")
		end,
	},
	-- {
	--     "catppuccin/nvim",
	--     name = "catppuccin",
	--     priority = 1000,
	--     config = function()
	--         -- vim.cmd.colorscheme("catppuccin")
	--     end,
	-- },
	-- {
	-- 	"folke/tokyonight.nvim",
	-- 	lazy = false,
	-- 	priority = 1000,
	-- 	opts = {},
	-- 	config = function()
	-- 		require("tokyonight").setup({})
	-- 	end,
	-- },
	{
		"nvim-tree/nvim-web-devicons",
	},
}
