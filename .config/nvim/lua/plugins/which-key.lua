return {
	"folke/which-key.nvim",
	init = function()
		vim.o.timeout = true
		vim.o.timeoutlen = 500
	end,
	config = function()
		local keymap = vim.keymap -- for conciseness
		local status_ok, which_key = pcall(require, "which-key")
		if not status_ok then
			return
		end

		local setup = {
			plugins = {
				marks = true, -- shows a list of your marks on ' and `
				registers = true, -- shows your registers on " in NORMAL or <C-r> in INSERT mode
				spelling = {
					enabled = true, -- enabling this will show WhichKey when pressing z= to select spelling suggestions
					suggestions = 20, -- how many suggestions should be shown in the list?
				},
				presets = {
					operators = false, -- adds help for operators like d, y, ... and registers them for motion / text object completion
					motions = true, -- adds help for motions
					text_objects = true, -- help for text objects triggered after entering an operator
					windows = true, -- default bindings on <c-w>
					nav = true, -- misc bindings to work with windows
					z = true, -- bindings for folds, spelling and others prefixed with z
					g = true, -- bindings for prefixed with g
				},
			},
			key_labels = {
				-- Custom labels for keys
			},
			icons = {
				breadcrumb = "»", -- symbol used in the command line area that shows your active key combo
				separator = "➜", -- symbol used between a key and its label
				group = "+", -- symbol prepended to a group
			},
			popup_mappings = {
				scroll_down = "<c-d>", -- binding to scroll down inside the popup
				scroll_up = "<c-u>", -- binding to scroll up inside the popup
			},
			window = {
				border = "rounded", -- none, single, double, shadow
				position = "bottom", -- bottom, top
				margin = { 1, 0, 1, 0 }, -- extra window margin [top, right, bottom, left]
				padding = { 2, 2, 2, 2 }, -- extra window padding [top, right, bottom, left]
				winblend = 0,
			},
			layout = {
				height = { min = 4, max = 25 }, -- min and max height of the columns
				width = { min = 20, max = 50 }, -- min and max width of the columns
				spacing = 3, -- spacing between columns
				align = "center", -- align columns left, center or right
			},
			ignore_missing = false, -- enable this to hide mappings for which you didn't specify a label
			hidden = { "<silent>", "<cmd>", "<Cmd>", "<CR>", "call", "lua", "^:", "^ " }, -- hide mapping boilerplate
			show_help = true, -- show help message on the command line when the popup is visible
			triggers = "auto", -- automatically setup triggers
			triggers_blacklist = {
				i = { "j", "k" },
				v = { "j", "k" },
			},
		}

		local opts = {
			mode = "n", -- NORMAL mode
			prefix = "<leader>",
			buffer = nil, -- Global mappings. Specify a buffer number for buffer local mappings
			silent = true, -- use `silent` when creating keymaps
			noremap = true, -- use `noremap` when creating keymaps
			nowait = true, -- use `nowait` when creating keymaps
		}

		local function open_neotree_to_dir()
			local input = vim.fn.input("Enter Directory Path: ", "", "file")
			if input ~= "" then
				vim.cmd("Neotree dir=" .. input)
			end
		end

		local mappings = {
			a = { "<cmd>Alpha<cr>", "Alpha" },
			b = {
				"<cmd>lua require('telescope.builtin').buffers(require('telescope.themes').get_dropdown{previewer = false})<cr>",
				"Buffers",
			},
			w = { "<cmd>w!<cr>", "Save" },
			q = { "<cmd>q!<cr>", "Quit" },
			c = { "<cmd>bdelete!<cr>", "Close Buffer" },
			p = { "<cmd>lua require('telescope').extensions.projects.projects()<cr>", "Projects" },
			l = { "<cmd>Lazy<cr>", "Lazy" },
			m = { "<cmd>Mason<cr>", "Mason" },
			-- Autocompletion
			A = {
				name = "Autocompletion",
				e = { "<cmd>lua require 'cmp'.setup{ enabled = true }<cr>", "Enabled" },
				d = { "<cmd>lua require 'cmp'.setup{ enabled = false }<cr>", "Disabled" },
			},
			-- Explorer
			E = {
				name = "Explorer",
				e = { "<cmd>Neotree toggle<cr>", "Reveal Explorer" },
				l = { "<cmd>Neotree left<cr>", "Left Explorer" },
				f = { "<cmd>Neotree float<cr>", "Floating Explorer" },
				d = { open_neotree_to_dir, "Open Neotree to Directory" },
			},
			-- Find
			F = {
				name = "Find",
				f = { "<cmd>Telescope fd<cr>", "Files" },
				t = { "<cmd>Telescope live_grep theme=ivy<CR>", "Text" },
			},
			-- Git
			G = {
				name = "Git",
				g = { "<cmd>LazyGit<CR>", "Lazygit" },
				j = { "<cmd>lua require 'gitsigns'.next_hunk()<cr>", "Next Hunk" },
				k = { "<cmd>lua require 'gitsigns'.prev_hunk()<cr>", "Prev Hunk" },
				l = { "<cmd>lua require 'gitsigns'.blame_line()<cr>", "Blame" },
				p = { "<cmd>lua require 'gitsigns'.preview_hunk()<cr>", "Preview Hunk" },
				r = { "<cmd>lua require 'gitsigns'.reset_hunk()<cr>", "Reset Hunk" },
				R = { "<cmd>lua require 'gitsigns'.reset_buffer()<cr>", "Reset Buffer" },
				s = { "<cmd>lua require 'gitsigns'.stage_hunk()<cr>", "Stage Hunk" },
				u = {
					"<cmd>lua require 'gitsigns'.undo_stage_hunk()<cr>",
					"Undo Stage Hunk",
				},
				o = { "<cmd>Telescope git_status<cr>", "Open changed file" },
				b = { "<cmd>Telescope git_branches<cr>", "Checkout branch" },
				c = { "<cmd>Telescope git_commits<cr>", "Checkout commit" },
				d = {
					"<cmd>Gitsigns diffthis HEAD<cr>",
					"Diff",
				},
			},
			-- Language Server Protocol (LSP)
			L = {
				name = "LSP",
				a = { "<cmd>lua vim.lsp.buf.code_action()<cr>", "Code Action" },
				f = { "<cmd>lua vim.lsp.buf.format{async=true}<cr>", "Format" },
				l = { "<cmd>lua vim.lsp.codelens.run()<cr>", "CodeLens Action" },
				q = { "<cmd>lua vim.diagnostic.setloclist()<cr>", "Quickfix" },
				n = { "<cmd>lua vim.lsp.buf.rename()<cr>", "Rename" },
				r = { "<cmd>lua vim.lsp.buf.references()<cr>", "References" },
				d = { "<cmd> lua vim.lsp.buf.definition()<cr>", "Definition" },
				c = { "<cmd> lua vim.lsp.buf.declaration()<cr>", "Declaration" },
				i = { "<cmd> lua vim.lsp.buf.implementation()<cr>", "Implementation" },
				k = { "<cmd> lua vim.lsp.buf.hover()<cr>", "Hover" },
				t = { "<cmd> lua vim.lsp.buf.type_definition()<cr>", "Type Definition" },
				I = { "<cmd>LspInfo<cr>", "LSP Info" },
				D = {
					name = "Document",
					d = { "<cmd>Telescope diagnostics bufnr=0<cr>", "Document Diagnostics" },
					s = { "<cmd>Telescope lsp_document_symbols<cr>", "Document Symbols" },
					j = { "<cmd>lua vim.lsp.diagnostic.goto_next()<CR>", "Next Diagnostic" },
					k = { "<cmd>lua vim.lsp.diagnostic.goto_prev()<cr>", "Prev Diagnostic" },
				},
				W = {
					name = "Workspace",
					a = { "<cmd>lua vim.lsp.buf.add_workspace_folder()<cr>", "Add Workspace Folder" },
					d = { "<cmd>Telescope diagnostics<cr>", "Workspace Diagnostics" },
					s = { "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>", "Workspace Symbols" },
					r = { "<cmd>lua vim.lsp.buf.remove_workspace_folder()<cr>", "Remove Workspace Folder" },
					l = {
						"<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<cr>",
						"List Workspace Folders",
					},
				},
			},
			--Telescope
			S = {
				name = "Search",
				b = { "<cmd>Telescope git_branches<cr>", "Checkout branch" },
				c = { "<cmd>Telescope colorscheme<cr>", "Colorscheme" },
				h = { "<cmd>Telescope help_tags<cr>", "Find Help" },
				M = { "<cmd>Telescope man_pages<cr>", "Man Pages" },
				r = { "<cmd>Telescope oldfiles<cr>", "Open Recent File" },
				R = { "<cmd>Telescope registers<cr>", "Registers" },
				k = { "<cmd>Telescope keymaps<cr>", "Keymaps" },
				C = { "<cmd>Telescope commands<cr>", "Commands" },
			},

			T = {
				name = "Terminal",
				f = { "<cmd>ToggleTerm direction=float<cr>", "Float" },
				h = { "<cmd>ToggleTerm size=10 direction=horizontal<cr>", "Horizontal" },
				v = { "<cmd>ToggleTerm size=80 direction=vertical<cr>", "Vertical" },
			},

			N = {
				name = "Neorg",
				w = { ":Neorg workspace ", "Workspaces" },
				i = { "<cmd>Neorg index", "Index" },
				M = {
					name = "Metadata",
					i = { "<cmd>Neorg inject-metadata<cr>", "Inject" },
					u = { "<cmd>Neorg update-metadata<cr>", "Update" },
				},
			},
		}

		which_key.setup(setup)
		which_key.register(mappings, opts)
	end,
}
