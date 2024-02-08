return {
	{
		"akinsho/bufferline.nvim",
		version = "*",
		dependencies = { "nvim-tree/nvim-web-devicons" },
		config = function()
			local status, bufferline = pcall(require, "bufferline")
			if not status then
				return
			end

			bufferline.setup({
				options = {
					hover = {
						enabled = true,
						delay = 200,
						reveal = { "close" },
					},
					separator_style = "thick",
				},
			})
		end,
	},
	{
		"nvim-lualine/lualine.nvim",
		config = function()
			local lualine_status, lualine = pcall(require, "lualine")
			if not lualine_status then
				return
			end

			local prose_status, prose = pcall(require, "nvim-prose")
			if not prose_status then
				return
			end

			-- configure Lualine with modified theme
			lualine.setup({
				options = {
					icons_enabled = true,
                    theme = "auto",
                    -- theme = "catppuccin",
					-- theme = "kanagawa",
					component_separators = { left = "|", right = "|" },
					section_separators = { left = "", right = "" },
					-- component_separators = { left = "", right = "" },
					-- section_separators = { left = "", right = "" },
					disabled_filetypes = {
						"neo-tree",
                        "NvimTree",
					},
					ignore_focus = {},
					always_divide_middle = true,
					globalstatus = false,
					refresh = {
						statusline = 1000,
						tabline = 1000,
						winbar = 1000,
					},
				},
				sections = {
					lualine_a = { "mode" },
					lualine_b = { "branch", "diff", "diagnostics" },
					lualine_c = { { "filename", path = 2 } },
					-- lualine_x = { "encoding", "fileformat", "filetype" },
					lualine_x = { "filetype" },
					lualine_y = { "progress", "location" },
					lualine_z = { "filesize" },
				},
				inactive_sections = {
					lualine_a = {},
					lualine_b = {},
					lualine_c = { "filename" },
					lualine_x = { "location" },
					lualine_y = {},
					lualine_z = {},
				},
				tabline = {},
				winbar = {
					lualine_z = { { prose.word_count, cond = prose.is_available } },
				},
				inactive_winbar = {},
				extensions = {},
			})
		end,
	},
}
