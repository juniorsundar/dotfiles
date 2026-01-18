M = {
  apply_font = function(config, wezterm)
    config.font = wezterm.font_with_fallback {
      "Lilex Nerd Font",
    }
    return config
  end,
}

return M
