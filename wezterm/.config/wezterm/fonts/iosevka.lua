M = {
    apply_font = function(config, wezterm)
        config.font = wezterm.font_with_fallback {
            'IosevkaTerm NF',
        }
        return config
    end
}

return M
