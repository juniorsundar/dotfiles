local M = {}

function M.extract_metadata(norg_address)
    -- Read the entire file content
    local file = io.open(norg_address, "r")
    if not file then
        print("Could not open file: " .. norg_address)
        return nil
    end
    local content = file:read("*all")
    file:close()

    -- Extract metadata block
    local metadata_block = content:match("@document%.meta(.-)@end")
    if not metadata_block then
        print("No metadata found in file: " .. norg_address)
        return nil
    end

    -- Parse metadata block into a table
    local metadata = {}
    for line in metadata_block:gmatch("[^\r\n]+") do
        local key, value = line:match("^%s*(%w+):%s*(.-)%s*$")
        if key and value then
            if value:match("^%[.-%]$") then
                -- Handle array values (categories)
                local array_values = {}
                for item in value:gmatch("%[(.-)%]") do
                    table.insert(array_values, item)
                end
                metadata[key] = array_values
            else
                metadata[key] = value
            end
        end
    end

    return metadata
end

return M
