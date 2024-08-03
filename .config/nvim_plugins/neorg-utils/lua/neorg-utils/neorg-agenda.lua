local M = {}

local neorg_loaded, neorg = pcall(require, "neorg.core")
assert(neorg_loaded, "Neorg is not loaded - please make sure to load Neorg first")

local utils = require("neorg-utils.utils")

local function create_agenda_buffer(quickfix_list)
    -- Create a new buffer for the quickfix list
    local buf = vim.api.nvim_create_buf(false, true)

    -- Set the buffer name
    -- vim.api.nvim_buf_set_name(buf, "Quickfix.norg")

    -- Prepare the lines to be written to the buffer
    local buffer_lines = {}
    local current_file = nil

    for _, entry in ipairs(quickfix_list) do
        if current_file ~= entry.filename then
            if current_file then
                table.insert(buffer_lines, "") -- Add a blank line between different files
            end
            local file_metadata = utils.extract_file_metadata(entry.filename)
            if file_metadata then
                table.insert(buffer_lines, "===")
                table.insert(buffer_lines, "")
                table.insert(buffer_lines, "{:" .. entry.filename .. ":}[" .. file_metadata.title .. "]") -- Add the filename as a header
            else
                table.insert(buffer_lines, "===")
                table.insert(buffer_lines, "")
                table.insert(buffer_lines, "{:" .. entry.filename .. ":}") -- Add the filename as a header
            end
            current_file = entry.filename
        end
        table.insert(buffer_lines, entry.text)
    end

    -- Set the buffer lines
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, buffer_lines)

    -- Open the buffer in a new split window
    vim.cmd("tabnew")
    local win = vim.api.nvim_get_current_win()
    vim.api.nvim_win_set_buf(win, buf)

    vim.api.nvim_set_option_value("filetype", "norg", { buf = buf })
    vim.api.nvim_set_option_value("modifiable", false, { buf = buf })
    vim.api.nvim_set_option_value("readonly", true, { buf = buf })
    vim.api.nvim_set_option_value("wrap", false, { win = win })
    vim.api.nvim_set_option_value("conceallevel", 2, { win = win })
    vim.api.nvim_set_option_value("foldlevel", 999, { win = win })

    vim.api.nvim_buf_set_keymap(buf, 'n', 'q', ':tabclose<CR>', { noremap = true, silent = true })

    -- Optional: Set filetype to norg for syntax highlighting (if available)
    -- vim.api.nvim_buf_set_option(buf, "filetype", "norg")

    -- -- Function to set quickfix list in Neovim
    -- local function set_quickfix_list(qflist)
    -- 	vim.fn.setqflist(qflist, "r")
    -- 	vim.cmd("copen")
    -- end
    --
    -- -- Call the function to set the quickfix list
    -- set_quickfix_list(quickfix_list)
end

-- Function to read a specific line from a file
local function read_line(file, line_number)
    local current_line = 0
    for line in file:lines() do
        current_line = current_line + 1
        if current_line == line_number then
            return line
        end
    end
    return nil
end

-- Function to check if the line after the given line contains '@data agenda'
-- and extract lines until '@end'
local function check_and_extract_data(filename, line_number)
    local file = io.open(filename, "r")
    if not file then
        print("Error opening file: " .. filename)
        return nil
    end

    local next_line = read_line(file, line_number + 1)
    if next_line and string.match(next_line, "@data agenda") then
        local agenda_lines = {}
        for line in file:lines() do
            if string.match(line, "@end") then
                break
            end
            table.insert(agenda_lines, line)
        end
        file:close()
        return agenda_lines
    else
        file:close()
        return nil
    end
end

function M.neorg_agenda()
    -- rg '\* \(\s*(-?)\s*\)' --glob '*.norg'
    local current_workspace = neorg.modules.get_module("core.dirman").get_current_workspace()
    local base_directory = current_workspace[2]

    local rg_command = [[rg '\* \(\s*(-?)\s*\)' --glob '*.norg' --line-number ]] .. base_directory
    local rg_results = vim.fn.system(rg_command)

    local lines = {}
    for line in rg_results:gmatch("[^\r\n]+") do
        table.insert(lines, line)
    end

    local quickfix_list = {}

    for _, line in ipairs(lines) do
        local file, lnum, text = line:match("([^:]+):(%d+):(.*)")
        if file and lnum and text then
            table.insert(quickfix_list, {
                filename = file,
                lnum = tonumber(lnum),
                text = text,
            })
        end
    end
    -- print(vim.inspect(quickfix_list))
    for _, qf_value in ipairs(quickfix_list) do
        local agenda_data = check_and_extract_data(qf_value.filename, qf_value.lnum)
        if agenda_data then
            print("Agenda data found:")
            for _, line in ipairs(agenda_data) do
                print(line)
            end
        else
            print("No agenda data found.")
        end
    end

    create_agenda_buffer(quickfix_list)
end

return M
