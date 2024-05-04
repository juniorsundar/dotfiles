require("options")
require("keymaps")
-- require("rocks-setup")
if vim.g.vscode then
	-- Package manager
	local lazypath = vim.fn.stdpath("data") .. "/lazy_bak/lazy.nvim"
	if not vim.loop.fs_stat(lazypath) then
		vim.fn.system({
			"git",
			"clone",
			"--filter=blob:none",
			"https://github.com/folke/lazy.nvim.git",
			"--branch=stable", -- latest stable release
			lazypath,
		})
	end
	print(lazypath)
	vim.opt.rtp:prepend(lazypath)
	print(vim.opt.rtp)

	require("lazy").setup("plugins")
else
	-- ordinary Neovim
end
