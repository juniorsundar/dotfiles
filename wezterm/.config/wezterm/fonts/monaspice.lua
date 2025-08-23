M = {
  apply_font = function(config, wezterm)
    config.font = wezterm.font_with_fallback { "Monaspace Neon", "NFM" }
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
    config.harfbuzz_features =
      { "calt", "liga", "dlig", "ss01", "ss02", "ss03", "ss04", "ss05", "ss06", "ss07", "ss08" }

    config.line_height = 1.1
    return config
  end,
}

return M
