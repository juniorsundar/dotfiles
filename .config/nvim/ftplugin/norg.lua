local function lookup_word()
	local word = vim.fn.expand("<cword>")
	local command = "dict " .. word

	-- Run the command and capture the output
	local handle = io.popen(command)
	local result = handle:read("*a")
	handle:close()

	-- Process the output to convert to Markdown
	local markdown_lines = {}
	local in_definition = false

	-- Process each line
	for line in result:gmatch("[^\r\n]+") do
		if line:match("^%s*$") then
			-- Add empty lines as-is
			table.insert(markdown_lines, "")
		elseif line:match("^From ") then
			-- Convert dictionary source to a Markdown header
			table.insert(markdown_lines, "# " .. line)
			in_definition = false
		elseif line:match("^%s*%d+:%s") then
			-- Convert numbered definitions to a Markdown sub-header
			table.insert(markdown_lines, "## " .. line:gsub("^%s*", ""))
			in_definition = true
		elseif in_definition then
			-- Convert indented definition content
			table.insert(markdown_lines, "> " .. line:gsub("^%s+", ""))
		else
			-- Convert other lines
			table.insert(markdown_lines, line)
		end
	end

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

	-- Insert the result into the buffer
	if #markdown_lines > 0 then
		vim.api.nvim_buf_set_lines(0, 0, -1, false, markdown_lines)
	else
		vim.api.nvim_buf_set_lines(0, 0, -1, false, { "No definitions found." })
	end
	-- vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(result, "\n"))
	-- Set the buffer to read-only again
	vim.bo[0].modifiable = false
	vim.bo[0].readonly = true
end

-- Key mapping to call the function
vim.api.nvim_set_keymap("n", "<leader>lw", ":lua lookup_word()<CR>", { noremap = true, silent = true })

vim.keymap.set("v", "Nd", lookup_word, { noremap = true, silent = true, desc = "Dictionary" })
