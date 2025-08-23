M = {
  apply_font = function(config, wezterm)
    config.font = wezterm.font_with_fallback {
      "CaskaydiaCove NF",
    }
    return config
  end,
}

return M
