{
  description = "Development shell for Pi agent extensions";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              typescript
              eslint
              oxlint
              prettier
            ];

            shellHook = ''
              pi_pkg="$(npm root -g 2>/dev/null)/@earendil-works/pi-coding-agent"
              if [ -d "$pi_pkg" ]; then
                mkdir -p .direnv/node_modules/@earendil-works .direnv/node_modules/@types
                ln -sfn "$pi_pkg" .direnv/node_modules/@earendil-works/pi-coding-agent
                for pkg in pi-ai pi-tui; do
                  if [ -d "$pi_pkg/node_modules/@earendil-works/$pkg" ]; then
                    ln -sfn "$pi_pkg/node_modules/@earendil-works/$pkg" ".direnv/node_modules/@earendil-works/$pkg"
                  fi
                done
                for pkg in typebox; do
                  if [ -d "$pi_pkg/node_modules/$pkg" ]; then
                    ln -sfn "$pi_pkg/node_modules/$pkg" ".direnv/node_modules/$pkg"
                  fi
                done
                if [ -d "$pi_pkg/node_modules/@types/node" ]; then
                  ln -sfn "$pi_pkg/node_modules/@types/node" .direnv/node_modules/@types/node
                fi
              else
                echo "Warning: @earendil-works/pi-coding-agent was not found in npm root -g" >&2
              fi

              echo "Pi agent dev shell"
              echo "  Type-check: tsc --noEmit"
              echo "  Lint:       oxlint extensions"
              echo "  Format:     prettier --write <files>"
            '';
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);
    };
}
