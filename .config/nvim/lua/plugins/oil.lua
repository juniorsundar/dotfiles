return {
	{
		"stevearc/oil.nvim",
		cmd = "Oil",
		-- Optional dependencies
		dependencies = { "nvim-tree/nvim-web-devicons" },
		config = function()
			require("oil").setup()
		end,
	},
}
