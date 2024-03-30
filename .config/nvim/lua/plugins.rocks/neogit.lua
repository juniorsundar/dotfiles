local neogit = require("neogit")
neogit.setup({
    signs = {
        hunk = { "", "" },
        item = { "", "" },
        section = { "", "" },
    },
    integrations = {
        telescope = true,
        diffview = true,
    },
})

vim.keymap.set("n", "gG", "<cmd>Neogit<cr>", { noremap = true, silent = false, desc = "Neogit" })
vim.keymap.set("v", "gG", "<cmd>Neogit<cr>", { noremap = true, silent = false, desc = "Neogit" })
