M = {
    apply_font = function(config, wezterm)
        config.font = wezterm.font("CaskaydiaCove NF", { weight = "Regular" })
        config.font_rules = {
            {
                intensity = "Bold",
                italic = false,
                font = wezterm.font("CaskaydiaCove NF", { weight = "Bold" }),
            },
            {
                intensity = "Normal",
                italic = true,
                font = wezterm.font("CaskaydiaCove NF", { weight = "Regular", style = "Italic" }),
            },
            {
                intensity = "Bold",
                italic = true,
                font = wezterm.font("CaskaydiaCove NF", { weight = "Bold", style = "Italic" }),
            },
        }
        config.line_height = 1.1
        return config
    end
}

return M
