return {
	{
		"juniorsundar/nordic.nvim",
        lazy = false,
		priority = 1000,
		config = function()
			local palette = require("nordic.colors")
			require("nordic").setup({
				telescope = {
					style = "classic",
				},
				leap = {
					dim_backdrop = true,
				},
				override = {
					WhichKeyBorder = { fg = palette.black1, bg = palette.black1 },
				},
			})
			vim.opt.fillchars = { eob = " " }
			vim.cmd.colorscheme("nordic")
		end,
	},
	{
		"nvim-tree/nvim-web-devicons",
	},
}
