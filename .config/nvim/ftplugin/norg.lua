local function lookup_word()
	local word = vim.fn.expand("<cword>")
	local command = "dict " .. word

	-- Run the command and capture the output
	local handle = io.popen(command)
	local result = handle:read("*a")
	handle:close()

	-- Create a new buffer
	vim.cmd("new")

	-- Set buffer options to avoid save prompts
	vim.bo[0].buftype = "nofile"
	vim.bo[0].bufhidden = "wipe"
	vim.bo[0].swapfile = false
	vim.bo[0].filetype = "markdown"

	-- Set the buffer to modifiable
	vim.bo[0].modifiable = true
	vim.bo[0].readonly = false

	vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(result, "\n"))
	-- Set the buffer to read-only again
	vim.bo[0].modifiable = false
	vim.bo[0].readonly = true
end

-- Key mapping to call the function
vim.api.nvim_set_keymap("n", "<leader>lw", ":lua lookup_word()<CR>", { noremap = true, silent = true })

vim.keymap.set("v", "Nd", lookup_word, { noremap = true, silent = true, desc = "Dictionary" })
