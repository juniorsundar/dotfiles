M = {
	apply_font = function(config, wezterm)
		config.font = wezterm.font("JetBrainsMono Nerd Font", { weight = "Light" })
		config.font_rules = {
			{
				intensity = "Bold",
				italic = false,
				font = wezterm.font("JetBrainsMono Nerd Font", { weight = "ExtraBold" }),
			},
			{
				intensity = "Normal",
				italic = true,
				font = wezterm.font("JetBrainsMono Nerd Font", { weight = "Light", style = "Italic" }),
			},
			{
				intensity = "Bold",
				italic = true,
				font = wezterm.font("JetBrainsMono Nerd Font", { weight = "ExtraBold", style = "Italic" }),
			},
		}
		return config
	end,
}

return M
