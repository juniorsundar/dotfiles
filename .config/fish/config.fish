if status is-interactive
    # Commands to run in interactive sessions can go here
end

fish_config theme choose cyberdream
fish_add_path -g ~/bin /sbin /usr/local/bin ~/.local/bin /usr/local/go/bin ~/go/bin /usr/local/texlive/2023/bin/x86_64-linux
set -U fish_user_paths $HOME/.cargo/bin $fish_user_paths
set -gx EDITOR vim

alias ls "eza --hyperlink --color=auto --icons=auto"
alias cat "bat --theme='base16-256'"
 
abbr --add du dust
abbr --add grep rg
abbr --add cd z
abbr --add G lazygit
abbr --add nv "fd --type f --hidden --exclude .git | fzf --layout=reverse | xargs nvim"


# Catppuccin theme for FZF
export FZF_DEFAULT_OPTS=" \
--color=bg+:#26282e,bg:#16181a,spinner:#ffd1dc,hl:#ff6e5e \
--color=fg:#ffffff,header:#ff6e5e,info:#bd5eff,pointer:#ffd1dc \
--color=marker:#ffd1dc,fg+:#ffffff,prompt:#bd5eff,hl+:#ff6e5e"

zoxide init fish | source
