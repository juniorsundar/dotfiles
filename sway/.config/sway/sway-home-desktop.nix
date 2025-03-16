{ inputs, pkgs, ... }:
let
  # Read your existing configuration files
  mainConfig = builtins.readFile ./config;
in
''
  # Your existing configurations
${mainConfig}
''

