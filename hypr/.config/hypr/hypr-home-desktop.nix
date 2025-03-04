{ inputs, pkgs, ... }:
let
  # Read your existing configuration files
  mainConfig = builtins.readFile ./hyprland.conf;
  windowRules = builtins.readFile ./home.conf;
  colors = builtins.readFile ./catppuccin.conf;
in
''
  # Your existing configurations
${windowRules}
${colors}
${mainConfig}
''
