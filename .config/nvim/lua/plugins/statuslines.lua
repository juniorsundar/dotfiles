return {
	{
		"rebelot/heirline.nvim",
		dependencies = {
			"Zeioth/heirline-components.nvim",
		},
		opts = {},
		config = function(_, opts)
			local conditions = require("heirline.conditions")
			local utils = require("heirline.utils")
			opts.colors = {
				bright_bg = utils.get_highlight("Folded").bg,
				bright_fg = utils.get_highlight("Folded").fg,
				red = utils.get_highlight("DiagnosticError").fg,
				dark_red = utils.get_highlight("DiffDelete").bg,
				green = utils.get_highlight("String").fg,
				blue = utils.get_highlight("Function").fg,
				gray = utils.get_highlight("NonText").fg,
				orange = utils.get_highlight("Constant").fg,
				purple = utils.get_highlight("Statement").fg,
				cyan = utils.get_highlight("Special").fg,
				diag_warn = utils.get_highlight("DiagnosticWarn").fg,
				diag_error = utils.get_highlight("DiagnosticError").fg,
				diag_hint = utils.get_highlight("DiagnosticHint").fg,
				diag_info = utils.get_highlight("DiagnosticInfo").fg,
				git_del = utils.get_highlight("diffDeleted").fg,
				git_add = utils.get_highlight("diffAdded").fg,
				git_change = utils.get_highlight("diffChanged").fg,
			}
			local FileNameBlock = {
				init = function(self)
					self.filename = vim.api.nvim_buf_get_name(0)
				end,
			}

			local FileName = {
				provider = function(self)
					local filename = vim.fn.fnamemodify(self.filename, ":.")
					if filename == "" then
						return "[No Name]"
					end
					if not conditions.width_percent_below(#filename, 0.25) then
						filename = vim.fn.pathshorten(filename)
					end
					return filename
				end,
				hl = { fg = utils.get_highlight("Directory").fg },
			}

			local FileFlags = {
				{
					condition = function()
						return vim.bo.modified
					end,
					provider = " --> [+]",
					hl = { fg = "orange" },
				},
				{
					condition = function()
						return not vim.bo.modifiable or vim.bo.readonly
					end,
					provider = " --> []",
					hl = { fg = "orange" },
				},
			}

			local FileNameModifer = {
				hl = function()
					if vim.bo.modified then
						return { fg = "orange", bold = true, force = true }
					end
				end,
			}

			FileNameBlock =
				utils.insert(FileNameBlock, utils.insert(FileNameModifer, FileName), FileFlags, { provider = "%<" })

			local TerminalName = {
				provider = function()
					local tname, _ = vim.api.nvim_buf_get_name(0):gsub(".*:", "")
					return " " .. tname
				end,
				hl = { fg = "fg", bold = true },
			}

			local heirline = require("heirline")
			local heirline_components = require("heirline-components.all")

			local DefaultStatusLine = {
				hl = { fg = "fg", bg = "bg" },
				heirline_components.component.mode({ mode_text = {} }),
				heirline_components.component.git_branch(),
				heirline_components.component.diagnostics(),
				FileNameBlock,
				heirline_components.component.fill(),
				heirline_components.component.cmd_info(),
				heirline_components.component.file_info(),
				heirline_components.component.nav(),
				heirline_components.component.mode({ surround = { separator = "right" } }),
			}
			local InactiveStatusline = {
				condition = conditions.is_not_active,
				heirline_components.component.fill(),
				FileNameBlock,
				{ provider = " --> " },
				heirline_components.component.file_info(),
				heirline_components.component.fill(),
			}
			local TerminalStatusline = {
				condition = function()
					return conditions.buffer_matches({ buftype = { "terminal" } })
				end,
				hl = { bg = "bg" },
				-- Quickly add a condition to the ViMode to only show it when buffer is active!
				{ condition = conditions.is_active, heirline_components.component.mode({ mode_text = {} }) },
				heirline_components.component.fill(),
				TerminalName,
				heirline_components.component.fill(),
				{
					condition = conditions.is_active,
					heirline_components.component.mode({ surround = { separator = "right" } }),
				},
			}
			local ExcludeStatusline = {
				condition = function()
					return conditions.buffer_matches({
						buftype = { "nofile", "prompt", "help", "quickfix" },
						filetype = { "^git.*", "fugitive", "oil", "alpha" },
					})
				end,
			}
			opts.statusline = {
				hl = function()
					if conditions.is_active() then
						return "StatusLine"
					else
						return "StatusLineNC"
					end
				end,
				fallthrough = false,
				ExcludeStatusline,
                TerminalStatusline,
				InactiveStatusline,
				DefaultStatusLine,
			}

			-- Setup
			heirline_components.init.subscribe_to_events()
			heirline.load_colors(heirline_components.hl.get_colors())
			heirline.setup(opts)
		end,
	},
	-- {
	-- 	"nvim-lualine/lualine.nvim",
	-- 	config = function()
	-- 		local lualine_status, lualine = pcall(require, "lualine")
	-- 		if not lualine_status then
	-- 			return
	-- 		end
	--
	-- 		local prose_status, prose = pcall(require, "nvim-prose")
	-- 		if not prose_status then
	-- 			return
	-- 		end
	--
	-- 		-- configure Lualine with modified theme
	-- 		lualine.setup({
	-- 			options = {
	-- 				icons_enabled = true,
	-- 				theme = "auto",
	-- 				component_separators = { left = "", right = "" },
	-- 				section_separators = { left = "", right = "" },
	-- 				disabled_filetypes = {
	--                        "alpha",
	--                        "diff",
	--                        "DiffviewFiles",
	--                        "NeogitCommitMessage",
	--                        "NeogitDiffView",
	-- 					"neo-tree",
	-- 					"no-neck-pain",
	-- 					"NvimTree",
	-- 					"oil",
	--                        "undotree",
	-- 				},
	-- 				ignore_focus = {},
	-- 				always_divide_middle = true,
	-- 				globalstatus = false,
	-- 				refresh = {
	-- 					statusline = 1000,
	-- 					tabline = 1000,
	-- 					winbar = 1000,
	-- 				},
	-- 			},
	-- 			sections = {
	-- 				lualine_a = { { "mode", separator = { left = "" }, right_padding = 2 } },
	-- 				lualine_b = { "branch", "diagnostics" },
	-- 				lualine_c = { { "filename" } },
	-- 				lualine_x = {
	-- 					{
	-- 						require("noice").api.statusline.mode.get,
	-- 						cond = require("noice").api.statusline.mode.has,
	-- 						color = { fg = "#ff9e64" },
	-- 					},
	-- 				},
	-- 				lualine_y = { "filetype" },
	-- 				lualine_z = { { "location", separator = { right = "" }, left_padding = 2 } },
	-- 			},
	-- 			inactive_sections = {
	-- 				lualine_c = { { "filename", path = 2 } },
	-- 				lualine_z = { "location" },
	-- 			},
	-- 			tabline = {},
	-- 			winbar = {
	-- 				lualine_z = {
	-- 					{
	-- 						prose.word_count,
	-- 						cond = prose.is_available,
	-- 						separator = { left = "", right = "" },
	-- 						left_padding = 2,
	-- 						right_padding = 2,
	-- 					},
	-- 				},
	-- 			},
	-- 			inactive_winbar = {},
	-- 			extensions = {},
	-- 		})
	-- 	end,
	-- },
}
