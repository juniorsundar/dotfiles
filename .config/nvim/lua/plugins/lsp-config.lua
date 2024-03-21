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
                ensure_installed = { "lua_ls", "pylsp", "clangd", "rust_analyzer", "gopls", "marksman" },
            })
        end,
    },
    {
        "neovim/nvim-lspconfig",
        dependencies = { "hrsh7th/cmp-nvim-lsp" },
        config = function()
            local capabilities = vim.lsp.protocol.make_client_capabilities()
            capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

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
                            -- Tells lua_ls where to find all the Lua files that you have loaded
                            -- for your neovim configuration.
                            library = {
                                "${3rd}/luv/library",
                                unpack(vim.api.nvim_get_runtime_file("", true)),
                            },
                            -- If lua_ls is really slow on your computer, you can try this instead:
                            -- library = { vim.env.VIMRUNTIME },
                        },
                        completion = {
                            callSnippet = "Replace",
                        },
                        -- You can toggle below to ignore Lua_LS's noisy `missing-fields` warnings
                        -- diagnostics = { disable = { 'missing-fields' } },
                    },
                },
            })

            lspconfig.pylsp.setup({
                capabilities = capabilities,
                configurationSources = { "flake8" },
                settings = {
                    pylsp = {
                        plugins = {
                            flake8 = {
                                enabled = true,
                                ignore = { "E128", "E122", "E251", "E501" },
                            },
                            mccabe = { enabled = false },
                            pyflakes = { enabled = false },
                            pycodestyle = {
                                enabled = false,
                                ignore = { "E128", "E122", "E251", "E501" },
                            },
                        },
                    },
                },
            })

            lspconfig.clangd.setup({
                capabilities = capabilities,
            })

            lspconfig.rust_analyzer.setup({
                capabilities = capabilities,
            })

            lspconfig.gopls.setup({
                capabilities = capabilities,
            })

            lspconfig.marksman.setup({
                capabilities = capabilities,
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
}
