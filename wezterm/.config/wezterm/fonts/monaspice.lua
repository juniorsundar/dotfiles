M = {
	apply_font = function(config, wezterm)
		config.font = wezterm.font_with_fallback({ "Monaspace Neon", "NFM" })
		config.font_rules = {
			{
				intensity = "Bold",
				italic = false,
				font = wezterm.font("Monaspace Neon", { weight = "Bold" }),
			},
			{
				intensity = "Normal",
				italic = true,
				font = wezterm.font("Monaspace Radon", { weight = "Light" }),
			},
			{
				intensity = "Bold",
				italic = true,
				font = wezterm.font("Monaspace Radon", { weight = "Bold" }),
			},
		}
		config.line_height = 1.1
		return config
	end,
}

return M
