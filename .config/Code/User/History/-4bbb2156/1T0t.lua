require("options")
require("keymaps")
-- require("rocks-setup")
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
vim.opt.rtp:prepend(lazypath)
print(vim.opt.rtp[1])

require("lazy").setup("plugins")
