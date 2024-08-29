if status is-interactive
    # Commands to run in interactive sessions can go here
    eval (zellij setup --generate-auto-start fish | string collect)
end


# Configure Fish theme
fish_config theme choose cyberdream

# Add directories to PATH
fish_add_path -g ~/bin /sbin /usr/local/bin ~/.local/bin /usr/local/go/bin ~/go/bin /usr/local/texlive/2023/bin/x86_64-linux ~/.nvm

# Set global paths
set -U fish_user_paths $HOME/.cargo/bin $fish_user_paths

# Environment variables and settings
set -gx EDITOR nvim
set -Ux FZF_COMPLETE 2
set -Ux FZF_PREVIEW_DIR_CMD "eza --color=auto --icons=auto -a --oneline"

# Key bindings
fish_vi_key_bindings

# Abbreviations
abbr --add ls "eza --hyperlink --color=auto --icons=auto"
abbr --add cat "bat --theme='base16-256'"
abbr --add du dust
abbr --add grep rg
abbr --add cd z
abbr --add G lazygit
abbr --add nv "fd --type f --hidden --exclude .git | fzf --layout=reverse | xargs nvim"
abbr --add zls 'zellij attach "$(zellij list-sessions -n -s | fzf --prompt "Select Zellij Session: ")"'

# Aliases
alias dronsole-sh='docker run --rm -it -v (pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest'
alias dronsole='docker run --rm -it -p 3000:3000 -p 8888:8888 -p 4280:4280 -p 4222:4222 -v (pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest'

# Catppuccin theme for FZF
set -gx FZF_DEFAULT_OPTS " \
--color=bg+:#26282e,bg:#16181a,spinner:#ffd1dc,hl:#ff6e5e \
--color=fg:#ffffff,header:#ff6e5e,info:#bd5eff,pointer:#ffd1dc \
--color=marker:#ffd1dc,fg+:#ffffff,prompt:#bd5eff,hl+:#ff6e5e \
--layout=reverse --height=40% --preview='bat --style=numbers --color=always --theme=base16-256 --line-range=:500 {}' --preview-window=right:60%:wrap --min-height=10"

# Initialize zoxide
zoxide init fish | source
