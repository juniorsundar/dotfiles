return {
	"kdheepak/lazygit.nvim",
	dependencies = { "nvim-lua/plenary.nvim" },
    config = function ()
        vim.keymap.set("n", "G", "<cmd>LazyGit<CR>", {noremap = true, silent = false, desc = "Lazygit"})
        vim.keymap.set("v", "G", "<cmd>LazyGit<CR>", {noremap = true, silent = false, desc = "Lazygit"})
    end
}
