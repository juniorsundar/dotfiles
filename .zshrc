# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

OMZ_HOME="${XDG_DATA_HOME:-${HOME}/}.oh-my-zsh"
OMZ_CP_DIR="$OMZ_HOME/custom/plugins"
OMZ_CT_DIR="$OMZ_HOME/custom/themes"
# Download OMZ, if it's not there yet
if [ ! -d "$OMZ_HOME" ]; then
   git clone https://github.com/ohmyzsh/ohmyzsh.git "$OMZ_HOME"

   # Download all needed plugins
   git clone https://github.com/Aloxaf/fzf-tab $OMZ_CP_DIR/fzf-tab
   git clone https://github.com/zsh-users/zsh-autosuggestions $OMZ_CP_DIR/zsh-autosuggestions
   git clone https://github.com/zsh-users/zsh-completions $OMZ_CP_DIR/zsh-completions
   git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $OMZ_CP_DIR/zsh-syntax-highlighting
   git clone --depth=1 https://github.com/romkatv/powerlevel10k.git $OMZ_CT_DIR/powerlevel10k
fi
export ZSH="$HOME/.oh-my-zsh"

# Load plugins
plugins=(
    fzf-tab
    zsh-syntax-highlighting
    zsh-autosuggestions
    git
    sudo
)

# Aliases
if [ -f ~/.zsh_aliases ]; then
    . ~/.zsh_aliases
fi
fpath+=${OMZ_HOME}/custom/plugins/zsh-completions/src
fpath=($HOME/.zsh_completions $fpath)

# Themes
ZSH_THEME="powerlevel10k/powerlevel10k"

source $ZSH/oh-my-zsh.sh

# If you come from bash you might have to change your $PATH.
export PATH=$HOME/bin:/usr/local/bin:$HOME/.local/bin:$PATH

# Load completions
autoload -Uz compinit && compinit

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# Keybindings
bindkey -e

# History
HISTSIZE=5000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

# Completion styling
# disable sort when completing `git checkout`
zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -1 --color=always $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'

# Sourcing ROS 2
source /opt/ros/humble/setup.zsh
eval "$(register-python-argcomplete3 ros2)"
eval "$(register-python-argcomplete3 colcon)"

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='nvim'
  export VISUAL='nvim'
else
  export EDITOR='nvim'
  export VISUAL='nvim'
fi

# Go
export PATH=$PATH:/usr/local/go/bin

# Rust
. "$HOME/.cargo/env"

# LaTeX
export PATH=$PATH:/usr/local/texlive/2023/bin/x86_64-linux
export INFOPATH=$INFOPATH:/usr/local/texlive/2023/texmf-dist/doc/info
export MANPATH=$MANPATH:/usr/local/texlive/2023/texmf-dist/doc/man

# NVM and Node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export MANPATH="/usr/local/man:$MANPATH"

export FIRMWARE_DIR=/home/juniorsundar-unikie/Documents/new/PX4-Autopilot

. ~/.zoxide.zsh

# Catppuccin theme for FZF
export FZF_DEFAULT_OPTS=" \
--color=bg+:#414559,bg:#303446,spinner:#f2d5cf,hl:#e78284 \
--color=fg:#c6d0f5,header:#e78284,info:#ca9ee6,pointer:#f2d5cf \
--color=marker:#f2d5cf,fg+:#c6d0f5,prompt:#ca9ee6,hl+:#e78284"
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# >>> juliaup initialize >>>

# !! Contents within this block are managed by juliaup !!

path=('/home/juniorsundar/.juliaup/bin' $path)
export PATH

# <<< juliaup initialize <<<
