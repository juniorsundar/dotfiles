-- define common options
local opts = {
	noremap = false, -- non-recursive
	silent = true, -- do not show message
}

-----------------
-- Normal mode --
-----------------

-- Hint: see `:h vim.map.set()`
-- Better window navigation
vim.keymap.set("n", "<C-h>", "<C-w>h", opts)
vim.keymap.set("n", "<C-j>", "<C-w>j", opts)
vim.keymap.set("n", "<C-k>", "<C-w>k", opts)
vim.keymap.set("n", "<C-l>", "<C-w>l", opts)
-- Resize with arrows
-- delta: 2 lines
vim.keymap.set("n", "<C-A-Up>", ":resize -2<CR>", opts)
vim.keymap.set("n", "<C-A-Down>", ":resize +2<CR>", opts)
vim.keymap.set("n", "<C-A-Left>", ":vertical resize -2<CR>", opts)
vim.keymap.set("n", "<C-A-Right>", ":vertical resize +2<CR>", opts)

vim.keymap.set("n", "<C-Right>", "w", opts)
vim.keymap.set("n", "<C-Left>", "b", opts)
vim.keymap.set("n", "<C-Up>", "gk", opts)
vim.keymap.set("n", "<C-Down>", "gj", opts)

vim.keymap.set("n", "<S-A-Up>", "<cmd>m .-2<CR>==", opts)
vim.keymap.set("n", "<S-A-Down>", "<cmd>m .+1<CR>==", opts)

-----------------
-- Visual mode --
-----------------

-- Hint: start visual mode with the same area as the previous area and the same mode
vim.keymap.set("v", "<", "<gv", opts)
vim.keymap.set("v", ">", ">gv", opts)
vim.keymap.set("v", "<S-A-Up>", "<cmd>m .-2<CR>==", opts)
vim.keymap.set("v", "<S-A-Down>", "<cmd>m .+1<CR>==", opts)

-----------------
-- Terminal mode --
-----------------

vim.keymap.set('t', '<C-\\><C-\\>', '<C-\\><C-n>', { desc = 'Exit terminal mode' })

vim.g.mapleader = vim.api.nvim_replace_termcodes("<A-Space>", true, true, true)
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"

-- Hint: use `:h <option>` to figure out the meaning if needed
vim.opt.clipboard = "unnamedplus" -- use system clipboard
vim.opt.completeopt = { "menu", "menuone", "noselect" }
vim.opt.mouse = "a"               -- allow the mouse to be used in Nvim

-- Tab
vim.opt.tabstop = 4      -- number of visual spaces per TAB
vim.opt.softtabstop = 4  -- number of spacesin tab when editing
vim.opt.shiftwidth = 4   -- insert 4 spaces on a tab
vim.opt.expandtab = true -- tabs are spaces, mainly because of python

-- UI config
vim.opt.number = true         -- show absolute number
vim.opt.relativenumber = true -- add numbers to each line on the left side
vim.opt.cursorline = true     -- highlight cursor line underneath the cursor horizontally
vim.opt.splitbelow = true     -- open new vertical split bottom
vim.opt.splitright = true     -- open new horizontal splits right
vim.opt.termguicolors = true  -- enabl 24-bit RGB color in the TUI
vim.opt.showmode = false      -- we are experienced, wo don't need the "-- INSERT --" mode hint

-- Searching
vim.opt.incsearch = true     -- search as characters are entered
vim.opt.hlsearch = false     -- do not highlight matches
vim.opt.ignorecase = true    -- ignore case in searches by default
vim.opt.smartcase = true     -- but make it case sensitive if an uppercase is entered
vim.opt.inccommand = "split" -- shows how certain commands apply in a separate window

vim.opt.undofile = true
vim.opt.signcolumn = "yes"
vim.opt.scrolloff = 10

vim.o.grepprg = "rg --vimgrep"
vim.o.grepformat = "%f:%l:%c:%m"

vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking (copying) text",
	group = vim.api.nvim_create_augroup("kickstart-highlight-yank", { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

-- This file can be loaded by calling `lua require('plugins')` from your init.vim

-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
	-- Packer can manage itself
	use 'wbthomason/packer.nvim'

	use {
		"nvim-treesitter/nvim-treesitter",
		requires = {
			"nvim-treesitter/nvim-treesitter-context",
		},
		config = function()
			-- import nvim-treesitter plugin safely
			local status, treesitter = pcall(require, "nvim-treesitter.configs")
			if not status then
				return
			end

			-- configure treesitter
			treesitter.setup({
				-- enable syntax highlighting
				highlight = { enable = true, additional_vim_regex_highlighting = false },
				-- enable indentation
				indent = { enable = true },
				-- ensure these language parsers are installed
				ensure_installed = {
					"yaml",
					"markdown",
					"markdown_inline",
					"bash",
					"vim",
					"vimdoc",
				},
				-- auto install above language parsers
				auto_install = false,
			})
		end,
	}

	use {
		"catppuccin/nvim",
		config = function()
			require("catppuccin").setup({
				custom_highlights = function(colors)
					return {
						WhichKeyBorder = { fg = colors.base },
						CmpBorder = { fg = colors.surface2 },
						Pmenu = { link = "NormalFloat" },
						SagaBorder = { link = "NormalFloat" }
					}
				end,
				integrations = {
					cmp = true,
					gitsigns = true,
					treesitter = true,
					alpha = true,
					barbar = true,
					flash = true,
					markdown = true,
					neogit = true,
					treesitter_context = true,
					which_key = true,
					mason = true,
				},
			})
			vim.cmd.colorscheme("catppuccin-frappe")
		end,
	}

	use {
        'ggandor/leap.nvim',
		config = function ()
            vim.keymap.set({'n', 'x', 'o'}, 'gf',  '<Plug>(leap-forward)')
            vim.keymap.set({'n', 'x', 'o'}, 'gF',  '<Plug>(leap-backward)')
            vim.keymap.set({'n', 'x', 'o'}, 'gs', '<Plug>(leap-from-window)')
		end,
	}

	use {
        'echasnovski/mini.jump',
		config = function ()
            require("mini.jump").setup({})
		end,
	}

	use {
		"echasnovski/mini.surround",
		config = function()
			require("mini.surround").setup()
		end,
    }

	use {
		"echasnovski/mini.pairs",
		config = function()
			require("mini.pairs").setup()
		end,
	}

	-- You can specify rocks in isolation
	-- use_rocks 'penlight'
	-- use_rocks {'lua-resty-http', 'lpeg'}

	-- Local plugins can be included
	-- use '~/projects/personal/hover.nvim'

	-- Plugins can have post-install/update hooks
	-- use {'iamcco/markdown-preview.nvim', run = 'cd app && yarn install', cmd = 'MarkdownPreview'}

	-- Post-install/update hook with neovim command
	-- use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }

	-- Post-install/update hook with call of vimscript function with argument
	-- use { 'glacambre/firenvim', run = function() vim.fn['firenvim#install'](0) end }

	-- Use specific branch, dependency and run lua file after load
	-- use {
	-- 'glepnir/galaxyline.nvim', branch = 'main', config = function() require'statusline' end,
	-- requires = {'kyazdani42/nvim-web-devicons'}
	-- }

	-- Use dependency and run lua function after load
	-- use {
	-- 'lewis6991/gitsigns.nvim', requires = { 'nvim-lua/plenary.nvim' },
	-- config = function() require('gitsigns').setup() end
	-- }

	-- You can alias plugin names
	-- use {'dracula/vim', as = 'dracula'}
end)
