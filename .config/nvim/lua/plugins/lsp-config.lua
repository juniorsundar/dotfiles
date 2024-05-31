return {
	{
		"williamboman/mason.nvim",
		config = function()
			require("mason").setup()
		end,
	},
	{
		"williamboman/mason-lspconfig.nvim",
		config = function()
			require("mason-lspconfig").setup({
				ensure_installed = {
					"lua_ls",
					"pylsp",
					"clangd",
					"rust_analyzer",
					"gopls",
					"markdown_oxide",
					"marksman",
				},
			})
		end,
	},
	{
		"neovim/nvim-lspconfig",
		config = function()
			local capabilities = vim.lsp.protocol.make_client_capabilities()
			capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

			capabilities.workspace = {
				didChangeWatchedFiles = {
					dynamicRegistration = true,
				},
			}

			local lspconfig = require("lspconfig")

			local function lspSymbol(name, icon)
				local hl = "DiagnosticSign" .. name
				vim.fn.sign_define(hl, { text = icon, numhl = hl, texthl = hl })
			end

			lspSymbol("Error", "󰅙")
			lspSymbol("Info", "󰋼")
			lspSymbol("Hint", "󰌵")
			lspSymbol("Warn", "")

			vim.diagnostic.config({
				virtual_text = {
					prefix = "",
				},
				signs = true,
				underline = true,
				update_in_insert = false,
			})

			--  LspInfo window borders
			local win = require("lspconfig.ui.windows")
			local _default_opts = win.default_opts

			win.default_opts = function(options)
				local opts = _default_opts(options)
				opts.border = "single"
				return opts
			end

			lspconfig.lua_ls.setup({
				capabilities = capabilities,
				settings = {
					Lua = {
						runtime = { version = "LuaJIT" },
						workspace = {
							checkThirdParty = false,
							library = {
								"${3rd}/luv/library",
								unpack(vim.api.nvim_get_runtime_file("", true)),
							},
						},
						completion = {
							callSnippet = "Replace",
						},
						hint = {
							enable = true,
						},
						-- You can toggle below to ignore Lua_LS's noisy `missing-fields` warnings
						-- diagnostics = { disable = { 'missing-fields' } },
					},
				},
			})

			lspconfig.pylsp.setup({
				capabilities = capabilities,
				settings = {
					pylsp = {
						plugins = {
							-- formatter options
							black = { enabled = false },
							autopep8 = { enabled = false },
							yapf = { enabled = false },
							-- linter options
							pylint = { enabled = false, executable = "pylint" },
							pyflakes = { enabled = true },
							pycodestyle = { enabled = false },
							mccabe = { enabled = false },
							-- type checker
							pylsp_mypy = { enabled = true },
							-- auto-completion options
							jedi_completion = { fuzzy = true },
							-- import sorting
							pyls_isort = { enabled = true },
						},
					},
				},
			})

			lspconfig.clangd.setup({
				capabilities = capabilities,
				root_dir = lspconfig.util.root_pattern("compile_commands.json", ".clangd"),
			})

			lspconfig.rust_analyzer.setup({
				capabilities = capabilities,
			})

			lspconfig.gopls.setup({
				capabilities = capabilities,
				settings = {
					gopls = {
						["ui.inlayhint.hints"] = {
							assignVariableTypes = true,
							compositeLiteralFields = true,
							compositeLiteralTypes = true,
							constantValues = true,
							functionTypeParameters = true,
							parameterNames = true,
							rangeVariableTypes = true,
						},
					},
				},
			})

			lspconfig.markdown_oxide.setup({
				capabilities = capabilities,
				on_attach = function(_, bufnr)
					-- refresh codelens on TextChanged and InsertLeave as well
					vim.api.nvim_create_autocmd({ "TextChanged", "InsertLeave", "CursorHold", "LspAttach" }, {
						buffer = bufnr,
						callback = vim.lsp.codelens.refresh,
					})
					-- trigger codelens refresh
					vim.api.nvim_exec_autocmds("User", { pattern = "LspAttached" })
				end,
			})

			lspconfig.marksman.setup({
				single_file_support = false,
			})

			-- Use LspAttach autocommand to only map the following keys
			-- after the language server attaches to the current buffer
			vim.api.nvim_create_autocmd("LspAttach", {
				group = vim.api.nvim_create_augroup("UserLspConfig", {}),
				callback = function(event)
					-- Enable completion triggered by <c-x><c-o>
					vim.bo[event.buf].omnifunc = "v:lua.vim.lsp.omnifunc"

					-- Buffer local mappings.
					-- See `:help vim.lsp.*` for documentation on any of the below functions
					-- local opts = { buffer = event.buf }
					local client = vim.lsp.get_client_by_id(event.data.client_id)
					if client and client.server_capabilities.documentHighlightProvider then
						vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
							buffer = event.buf,
							callback = vim.lsp.buf.document_highlight,
						})

						vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
							buffer = event.buf,
							callback = vim.lsp.buf.clear_references,
						})
						vim.keymap.del("n", "K", { buffer = event.buf })
					end
				end,
			})
		end,
	},
	{
		"nvimtools/none-ls.nvim",
		event = "LspAttach",
		config = function()
			local null_ls = require("null-ls")

			null_ls.setup({
				sources = {
					null_ls.builtins.formatting.stylua,
					null_ls.builtins.formatting.black,
					null_ls.builtins.formatting.gofumpt,
				},
			})
		end,
	},
	{
		"nvimdev/lspsaga.nvim",
		event = "LspAttach",
		config = function()
			require("lspsaga").setup({
				lightbulb = {
					enable = false,
					sign = false,
				},
				ui = {
					-- currently only round theme
					theme = "rounded",
					border = "solid",
					lines = { "└", "├", "│", "─", "┌" },
					kind = require("catppuccin.groups.integrations.lsp_saga").custom_kind(),
				},
			})
		end,
	},
}
