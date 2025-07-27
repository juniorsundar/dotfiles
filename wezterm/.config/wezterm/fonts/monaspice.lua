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
				font = wezterm.font("Monaspace Argon", { weight = "Light", style = "Italic" }),
			},
			{
				intensity = "Bold",
				italic = true,
				font = wezterm.font("Monaspace Argon", { weight = "Bold", style = "Italic" }),
			},
		}
		config.line_height = 1.1
		return config
	end,
}

return M
