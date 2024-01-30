return {
	{
	    "folke/noice.nvim",
	    event = "VeryLazy",
	    opts = {
	        -- add any options here
	    },
	    dependencies = {
	        "MunifTanjim/nui.nvim",
	        "rcarriga/nvim-notify",
	    },
	    config = function()
	        require("noice").setup({
	            cmdline = {
	                enabled = true,
	                view = "cmdline", -- view for rendering the cmdline. Change to `cmdline` to get a classic cmdline at the bottom
	                cmdline = { pattern = "^:", icon = "", lang = "vim" },
	                search_down = { kind = "search", pattern = "^/", icon = " ", lang = "regex" },
	                search_up = { kind = "search", pattern = "^%?", icon = " ", lang = "regex" },
	                filter = { pattern = "^:%s*!", icon = "$", lang = "bash" },
	                lua = {
	                    pattern = { "^:%s*lua%s+", "^:%s*lua%s*=%s*", "^:%s*=%s*" },
	                    icon = "",
	                    lang = "lua",
	                },
	                help = { pattern = "^:%s*he?l?p?%s+", icon = "" },
	                input = {}, -- Used by input()
	                -- lua = false, -- to disable a format, set to `false`
	            },
	            lsp = {
	                override = {
	                    -- override the default lsp markdown formatter with Noice
	                    ["vim.lsp.util.convert_input_to_markdown_lines"] = true,
	                    -- override the lsp markdown formatter with Noice
	                    ["vim.lsp.util.stylize_markdown"] = true,
	                    -- override cmp documentation with Noice (needs the other options to work)
	                    ["cmp.entry.get_documentation"] = true,
	                },
	            },
	            -- you can enable a preset for easier configuration
	            presets = {
	                bottom_search = true, -- use a classic bottom cmdline for search
	                command_palette = false, -- position the cmdline and popupmenu together
	                long_message_to_split = true, -- long messages will be sent to a split
	                inc_rename = false, -- enables an input dialog for inc-rename.nvim
	                lsp_doc_border = false, -- add a border to hover docs and signature help
	            },
	        })
	    end,
	},
}
