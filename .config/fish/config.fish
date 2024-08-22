if status is-interactive
    # Commands to run in interactive sessions can go here
end

fish_config theme choose cyberdream
fish_add_path -g ~/bin /sbin /usr/local/bin ~/.local/bin /usr/local/go/bin ~/go/bin /usr/local/texlive/2023/bin/x86_64-linux
set -U fish_user_paths $HOME/.cargo/bin $fish_user_paths

set -gx EDITOR nvim
set -Ux FZF_COMPLETE 2
set -Ux FZF_PREVIEW_DIR_CMD "eza --color=auto --icons=auto -a --oneline"

fish_vi_key_bindings

abbr --add ls "eza --hyperlink --color=auto --icons=auto"
abbr --add cat "bat --theme='base16-256'"
abbr --add du dust
abbr --add grep rg
abbr --add cd z
abbr --add G lazygit
abbr --add nv "fd --type f --hidden --exclude .git | fzf --layout=reverse | xargs nvim"

alias dronsole-sh='docker run --rm -it -v $(pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest'
alias dronsole='docker run --rm -it -p 3000:3000 -p 8888:8888 -p 4280:4280 -p 4222:4222 -v $(pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest' 

# Catppuccin theme for FZF
export FZF_DEFAULT_OPTS=" \
--color=bg+:#26282e,bg:#16181a,spinner:#ffd1dc,hl:#ff6e5e \
--color=fg:#ffffff,header:#ff6e5e,info:#bd5eff,pointer:#ffd1dc \
--color=marker:#ffd1dc,fg+:#ffffff,prompt:#bd5eff,hl+:#ff6e5e \
--layout=reverse --height=40% --preview='bat --style=numbers --color=always --line-range=:500 {}' --preview-window=right:60%:wrap --min-height=10"

zoxide init fish | source
