M = {
	apply_font = function(config, wezterm)
		config.font = wezterm.font_with_fallback({
			"Iosevka",
			"Symbols Nerd Font",
		})
		return config
	end,
}

return M
