-- Automatically generated packer.nvim plugin loader code

if vim.api.nvim_call_function('has', {'nvim-0.5'}) ~= 1 then
  vim.api.nvim_command('echohl WarningMsg | echom "Invalid Neovim version for packer.nvim! | echohl None"')
  return
end

vim.api.nvim_command('packadd packer.nvim')

local no_errors, error_msg = pcall(function()

_G._packer = _G._packer or {}
_G._packer.inside_compile = true

local time
local profile_info
local should_profile = false
if should_profile then
  local hrtime = vim.loop.hrtime
  profile_info = {}
  time = function(chunk, start)
    if start then
      profile_info[chunk] = hrtime()
    else
      profile_info[chunk] = (hrtime() - profile_info[chunk]) / 1e6
    end
  end
else
  time = function(chunk, start) end
end

local function save_profiles(threshold)
  local sorted_times = {}
  for chunk_name, time_taken in pairs(profile_info) do
    sorted_times[#sorted_times + 1] = {chunk_name, time_taken}
  end
  table.sort(sorted_times, function(a, b) return a[2] > b[2] end)
  local results = {}
  for i, elem in ipairs(sorted_times) do
    if not threshold or threshold and elem[2] > threshold then
      results[i] = elem[1] .. ' took ' .. elem[2] .. 'ms'
    end
  end
  if threshold then
    table.insert(results, '(Only showing plugins that took longer than ' .. threshold .. ' ms ' .. 'to load)')
  end

  _G._packer.profile_output = results
end

time([[Luarocks path setup]], true)
local package_path_str = "/home/juniorsundar/.cache/nvim/packer_hererocks/2.1.1713484068/share/lua/5.1/?.lua;/home/juniorsundar/.cache/nvim/packer_hererocks/2.1.1713484068/share/lua/5.1/?/init.lua;/home/juniorsundar/.cache/nvim/packer_hererocks/2.1.1713484068/lib/luarocks/rocks-5.1/?.lua;/home/juniorsundar/.cache/nvim/packer_hererocks/2.1.1713484068/lib/luarocks/rocks-5.1/?/init.lua"
local install_cpath_pattern = "/home/juniorsundar/.cache/nvim/packer_hererocks/2.1.1713484068/lib/lua/5.1/?.so"
if not string.find(package.path, package_path_str, 1, true) then
  package.path = package.path .. ';' .. package_path_str
end

if not string.find(package.cpath, install_cpath_pattern, 1, true) then
  package.cpath = package.cpath .. ';' .. install_cpath_pattern
end

time([[Luarocks path setup]], false)
time([[try_loadstring definition]], true)
local function try_loadstring(s, component, name)
  local success, result = pcall(loadstring(s), name, _G.packer_plugins[name])
  if not success then
    vim.schedule(function()
      vim.api.nvim_notify('packer.nvim: Error running ' .. component .. ' for ' .. name .. ': ' .. result, vim.log.levels.ERROR, {})
    end)
  end
  return result
end

time([[try_loadstring definition]], false)
time([[Defining packer_plugins]], true)
_G.packer_plugins = {
  ["leap.nvim"] = {
    config = { "\27LJ\2\nÙ\1\0\0\5\0\f\0\0226\0\0\0009\0\1\0009\0\2\0005\2\3\0'\3\4\0'\4\5\0B\0\4\0016\0\0\0009\0\1\0009\0\2\0005\2\6\0'\3\a\0'\4\b\0B\0\4\0016\0\0\0009\0\1\0009\0\2\0005\2\t\0'\3\n\0'\4\v\0B\0\4\1K\0\1\0\29<Plug>(leap-from-window)\ags\1\4\0\0\6n\6x\6o\26<Plug>(leap-backward)\agF\1\4\0\0\6n\6x\6o\25<Plug>(leap-forward)\agf\1\4\0\0\6n\6x\6o\bset\vkeymap\bvim\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/leap.nvim",
    url = "https://github.com/ggandor/leap.nvim"
  },
  ["mini.jump"] = {
    config = { "\27LJ\2\n;\0\0\3\0\3\0\a6\0\0\0'\2\1\0B\0\2\0029\0\2\0004\2\0\0B\0\2\1K\0\1\0\nsetup\14mini.jump\frequire\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/mini.jump",
    url = "https://github.com/echasnovski/mini.jump"
  },
  ["mini.pairs"] = {
    config = { "\27LJ\2\n8\0\0\3\0\3\0\0066\0\0\0'\2\1\0B\0\2\0029\0\2\0B\0\1\1K\0\1\0\nsetup\15mini.pairs\frequire\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/mini.pairs",
    url = "https://github.com/echasnovski/mini.pairs"
  },
  ["mini.surround"] = {
    config = { "\27LJ\2\n;\0\0\3\0\3\0\0066\0\0\0'\2\1\0B\0\2\0029\0\2\0B\0\1\1K\0\1\0\nsetup\18mini.surround\frequire\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/mini.surround",
    url = "https://github.com/echasnovski/mini.surround"
  },
  nvim = {
    config = { "\27LJ\2\ná\1\0\1\4\0\f\0\0145\1\3\0005\2\1\0009\3\0\0=\3\2\2=\2\4\0015\2\6\0009\3\5\0=\3\2\2=\2\a\0015\2\b\0=\2\t\0015\2\n\0=\2\v\1L\1\2\0\15SagaBorder\1\0\1\tlink\16NormalFloat\nPmenu\1\0\1\tlink\16NormalFloat\14CmpBorder\1\0\1\afg\0\rsurface2\19WhichKeyBorder\1\0\4\nPmenu\0\19WhichKeyBorder\0\14CmpBorder\0\15SagaBorder\0\afg\1\0\1\afg\0\tbase¶\2\1\0\4\0\f\0\0166\0\0\0'\2\1\0B\0\2\0029\0\2\0005\2\4\0003\3\3\0=\3\5\0025\3\6\0=\3\a\2B\0\2\0016\0\b\0009\0\t\0009\0\n\0'\2\v\0B\0\2\1K\0\1\0\22catppuccin-frappe\16colorscheme\bcmd\bvim\17integrations\1\0\v\nalpha\2\rgitsigns\2\15treesitter\2\rmarkdown\2\nmason\2\bcmp\2\14which_key\2\23treesitter_context\2\vneogit\2\nflash\2\vbarbar\2\22custom_highlights\1\0\2\17integrations\0\22custom_highlights\0\0\nsetup\15catppuccin\frequire\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/nvim",
    url = "https://github.com/catppuccin/nvim"
  },
  ["nvim-treesitter"] = {
    config = { "\27LJ\2\nº\2\0\0\6\0\v\0\0176\0\0\0006\2\1\0'\3\2\0B\0\3\3\14\0\0\0X\2\1€K\0\1\0009\2\3\0015\4\5\0005\5\4\0=\5\6\0045\5\a\0=\5\b\0045\5\t\0=\5\n\4B\2\2\1K\0\1\0\21ensure_installed\1\a\0\0\tyaml\rmarkdown\20markdown_inline\tbash\bvim\vvimdoc\vindent\1\0\1\venable\2\14highlight\1\0\4\vindent\0\14highlight\0\17auto_install\1\21ensure_installed\0\1\0\2&additional_vim_regex_highlighting\1\venable\2\nsetup\28nvim-treesitter.configs\frequire\npcall\0" },
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/nvim-treesitter",
    url = "https://github.com/nvim-treesitter/nvim-treesitter"
  },
  ["nvim-treesitter-context"] = {
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/nvim-treesitter-context",
    url = "https://github.com/nvim-treesitter/nvim-treesitter-context"
  },
  ["packer.nvim"] = {
    loaded = true,
    path = "/home/juniorsundar/.local/share/nvim/site/pack/packer/start/packer.nvim",
    url = "https://github.com/wbthomason/packer.nvim"
  }
}

time([[Defining packer_plugins]], false)
-- Config for: mini.surround
time([[Config for mini.surround]], true)
try_loadstring("\27LJ\2\n;\0\0\3\0\3\0\0066\0\0\0'\2\1\0B\0\2\0029\0\2\0B\0\1\1K\0\1\0\nsetup\18mini.surround\frequire\0", "config", "mini.surround")
time([[Config for mini.surround]], false)
-- Config for: leap.nvim
time([[Config for leap.nvim]], true)
try_loadstring("\27LJ\2\nÙ\1\0\0\5\0\f\0\0226\0\0\0009\0\1\0009\0\2\0005\2\3\0'\3\4\0'\4\5\0B\0\4\0016\0\0\0009\0\1\0009\0\2\0005\2\6\0'\3\a\0'\4\b\0B\0\4\0016\0\0\0009\0\1\0009\0\2\0005\2\t\0'\3\n\0'\4\v\0B\0\4\1K\0\1\0\29<Plug>(leap-from-window)\ags\1\4\0\0\6n\6x\6o\26<Plug>(leap-backward)\agF\1\4\0\0\6n\6x\6o\25<Plug>(leap-forward)\agf\1\4\0\0\6n\6x\6o\bset\vkeymap\bvim\0", "config", "leap.nvim")
time([[Config for leap.nvim]], false)
-- Config for: nvim-treesitter
time([[Config for nvim-treesitter]], true)
try_loadstring("\27LJ\2\nº\2\0\0\6\0\v\0\0176\0\0\0006\2\1\0'\3\2\0B\0\3\3\14\0\0\0X\2\1€K\0\1\0009\2\3\0015\4\5\0005\5\4\0=\5\6\0045\5\a\0=\5\b\0045\5\t\0=\5\n\4B\2\2\1K\0\1\0\21ensure_installed\1\a\0\0\tyaml\rmarkdown\20markdown_inline\tbash\bvim\vvimdoc\vindent\1\0\1\venable\2\14highlight\1\0\4\vindent\0\14highlight\0\17auto_install\1\21ensure_installed\0\1\0\2&additional_vim_regex_highlighting\1\venable\2\nsetup\28nvim-treesitter.configs\frequire\npcall\0", "config", "nvim-treesitter")
time([[Config for nvim-treesitter]], false)
-- Config for: mini.pairs
time([[Config for mini.pairs]], true)
try_loadstring("\27LJ\2\n8\0\0\3\0\3\0\0066\0\0\0'\2\1\0B\0\2\0029\0\2\0B\0\1\1K\0\1\0\nsetup\15mini.pairs\frequire\0", "config", "mini.pairs")
time([[Config for mini.pairs]], false)
-- Config for: nvim
time([[Config for nvim]], true)
try_loadstring("\27LJ\2\ná\1\0\1\4\0\f\0\0145\1\3\0005\2\1\0009\3\0\0=\3\2\2=\2\4\0015\2\6\0009\3\5\0=\3\2\2=\2\a\0015\2\b\0=\2\t\0015\2\n\0=\2\v\1L\1\2\0\15SagaBorder\1\0\1\tlink\16NormalFloat\nPmenu\1\0\1\tlink\16NormalFloat\14CmpBorder\1\0\1\afg\0\rsurface2\19WhichKeyBorder\1\0\4\nPmenu\0\19WhichKeyBorder\0\14CmpBorder\0\15SagaBorder\0\afg\1\0\1\afg\0\tbase¶\2\1\0\4\0\f\0\0166\0\0\0'\2\1\0B\0\2\0029\0\2\0005\2\4\0003\3\3\0=\3\5\0025\3\6\0=\3\a\2B\0\2\0016\0\b\0009\0\t\0009\0\n\0'\2\v\0B\0\2\1K\0\1\0\22catppuccin-frappe\16colorscheme\bcmd\bvim\17integrations\1\0\v\nalpha\2\rgitsigns\2\15treesitter\2\rmarkdown\2\nmason\2\bcmp\2\14which_key\2\23treesitter_context\2\vneogit\2\nflash\2\vbarbar\2\22custom_highlights\1\0\2\17integrations\0\22custom_highlights\0\0\nsetup\15catppuccin\frequire\0", "config", "nvim")
time([[Config for nvim]], false)
-- Config for: mini.jump
time([[Config for mini.jump]], true)
try_loadstring("\27LJ\2\n;\0\0\3\0\3\0\a6\0\0\0'\2\1\0B\0\2\0029\0\2\0004\2\0\0B\0\2\1K\0\1\0\nsetup\14mini.jump\frequire\0", "config", "mini.jump")
time([[Config for mini.jump]], false)

_G._packer.inside_compile = false
if _G._packer.needs_bufread == true then
  vim.cmd("doautocmd BufRead")
end
_G._packer.needs_bufread = false

if should_profile then save_profiles() end

end)

if not no_errors then
  error_msg = error_msg:gsub('"', '\\"')
  vim.api.nvim_command('echohl ErrorMsg | echom "Error in packer_compiled: '..error_msg..'" | echom "Please check your config for correctness" | echohl None')
end
