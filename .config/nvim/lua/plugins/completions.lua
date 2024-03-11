return {
	{
		"windwp/nvim-autopairs",
		event = "InsertEnter",
		config = function()
			-- Import nvim-autopairs safely
			local autopairs_setup, autopairs = pcall(require, "nvim-autopairs")
			if not autopairs_setup then
				return
			end

			-- Configure autopairs
			autopairs.setup({
				check_ts = true, -- Enable treesitter
				ts_config = {
					lua = { "string" }, -- Don't add pairs in lua string treesitter nodes
					javascript = { "template_string" }, -- Don't add pairs in JavaScript template_string treesitter nodes
					java = false, -- Don't check treesitter on Java
				},
				disable_filetype = { "TelescopePrompt", "spectre_panel" },
				fast_wrap = {
					map = "<M-e>",
					chars = { "{", "[", "(", '"', "'" },
					pattern = string.gsub([[ [%'%"%)%>%]%)%}%,] ]], "%s+", ""),
					offset = 0, -- Offset from pattern match
					end_key = "$",
					keys = "qwertyuiopzxcvbnmasdfghjkl",
					check_comma = true,
					highlight = "PmenuSel",
					highlight_grey = "LineNr",
				},
			})

			-- Import nvim-autopairs completion functionality safely
			local cmp_autopairs_setup, cmp_autopairs = pcall(require, "nvim-autopairs.completion.cmp")
			if not cmp_autopairs_setup then
				return
			end
			-- Import nvim-cmp plugin safely (completions plugin)
			local cmp_setup, cmp = pcall(require, "cmp")
			if not cmp_setup then
				return
			end

			-- Make autopairs and completion work together
			cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done())
		end,
	},
	{
		"hrsh7th/nvim-cmp",
		event = "InsertEnter",
		dependencies = {
			"hrsh7th/cmp-nvim-lsp",
			"hrsh7th/cmp-path",
			"hrsh7th/cmp-cmdline",
			{
				"L3MON4D3/LuaSnip",
				dependencies = {
					"saadparwaiz1/cmp_luasnip",
					"rafamadriz/friendly-snippets",
				},

				build = (function()
					if vim.fn.has("win32") == 1 or vim.fn.executable("make") == 0 then
						return
					end
					return "make install_jsregexp"
				end)(),
			},
		},

		config = function()
			local has_words_before = function()
				unpack = unpack or table.unpack
				local line, col = unpack(vim.api.nvim_win_get_cursor(0))
				return col ~= 0
					and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
			end

			local cmp = require("cmp")
			local luasnip = require("luasnip")
			local WIDE_HEIGHT = 40

			local kind_icons = {
				Text = "",
				Method = "󰆧",
				Function = "󰊕",
				Constructor = "",
				Field = "󰇽",
				Variable = "󰂡",
				Class = "󰠱",
				Interface = "",
				Module = "",
				Property = "󰜢",
				Unit = "",
				Value = "󰎠",
				Enum = "",
				Keyword = "󰌋",
				Snippet = "",
				Color = "󰏘",
				File = "󰈙",
				Reference = "",
				Folder = "󰉋",
				EnumMember = "",
				Constant = "󰏿",
				Struct = "",
				Event = "",
				Operator = "",
				TypeParameter = "󰅲",
			}

			require("luasnip.loaders.from_vscode").lazy_load()

			cmp.setup({
				formatting = {
					fields = { "kind", "abbr", "menu" },
					format = function(entry, vim_item)
						vim_item.menu = true and  "    (" .. vim_item.kind .. ")" or ""
						vim_item.kind = " " .. kind_icons[vim_item.kind] .. " "
						return vim_item
					end,req
				},
				snippet = {

					completion = {
						completeopt = "menu,menuone",
					},
					expand = function(args)
						require("luasnip").lsp_expand(args.body) -- For `luasnip` users.
					end,
				},

				window = {
					completion = {
						border = { "", "", "", "", "", "", "", "" },
						winhighlight = "Normal:Pmenu,FloatBorder:Pmenu,Search:None",
						scrolloff = 0,
						col_offset = -3,
						side_padding = 0,
						scrollbar = true,
					},
					documentation = {
						max_height = math.floor(WIDE_HEIGHT * (WIDE_HEIGHT / vim.o.lines)),
						max_width = math.floor((WIDE_HEIGHT * 2) * (vim.o.columns / (WIDE_HEIGHT * 2 * 16 / 9))),
						border = { "", "", "", " ", "", "", "", " " },
						winhighlight = "FloatBorder:NormalFloat",
					},
				},
				mapping = cmp.mapping.preset.insert({
					["<C-b>"] = cmp.mapping.scroll_docs(-4),
					["<C-f>"] = cmp.mapping.scroll_docs(4),
					["<C-Space>"] = cmp.mapping.complete(),
					["<C-e>"] = cmp.mapping.abort(),
					["<CR>"] = cmp.mapping.confirm({ select = true }), -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
					["<Tab>"] = cmp.mapping(function(fallback)
						-- Hint: if the completion menu is visible select next one
						if cmp.visible() then
							cmp.select_next_item()
						elseif has_words_before() then
							cmp.complete()
						else
							fallback()
						end
					end, { "i", "s" }), -- i - insert mode; s - select mode
					["<S-Tab>"] = cmp.mapping(function(fallback)
						if cmp.visible() then
							cmp.select_prev_item()
						elseif luasnip.jumpable(-1) then
							luasnip.jump(-1)
						else
							fallback()
						end
					end, { "i", "s" }),
				}),
				sources = cmp.config.sources({
					{ name = "nvim_lsp" },
					{ name = "luasnip" }, -- For luasnip users.
					{ name = "path" },
				}),
			})
		end,
	},
}
