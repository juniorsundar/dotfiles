# Common
# alias fd="fdfind"
alias cat="bat --theme 'Catppuccin Frappe'"
alias cd="z"
alias du="dust"
alias grep="rg"
alias ls="eza --hyperlink --color=auto --icons=auto"
alias G="lazygit"

alias neorg="nvim ~/Dropbox/neorg/index.norg"

alias nv="fd --type f --hidden --exclude .git | fzf --height=10 --min-height=5 --layout=reverse | xargs nvim"

if [ ! -d "$HOME/.tmux/plugins/tpm" ]
then
    git clone https://github.com/tmux-plugins/tpm $HOME/.tmux/plugins/tpm
fi
alias tls="~/.config/tmux/tmux-fzf-session.sh"
alias zls="~/.config/zellij/zellij-fzf-session.sh"

alias dronsole-sh='docker run --rm -it -v $(pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest'
alias dronsole='docker run --rm -it -p 3000:3000 -p 8888:8888 -p 4280:4280 -p 4222:4222 -v $(pwd):/workspace -v $HOME/.dronsole:/root/.dronsole --entrypoint /bin/dronsole ghcr.io/tiiuae/tii-dronsole:latest' 
