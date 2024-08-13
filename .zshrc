# # Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# # Initialization code that may require console input (password prompts, [y/n]
# # confirmations, etc.) must go above this block; everything else may go below.
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
   git clone https://github.com/zdharma-continuum/fast-syntax-highlighting $OMZ_CP_DIR/fast-syntax-highlighting
   git clone https://github.com/zsh-users/zsh-completions $OMZ_CP_DIR/zsh-completions

   git clone --depth=1 https://github.com/romkatv/powerlevel10k.git $OMZ_CT_DIR/powerlevel10k
fi
export ZSH="$HOME/.oh-my-zsh"

# Load plugins
plugins=(
    fzf-tab
    fast-syntax-highlighting
    zsh-autosuggestions
    git
    sudo
    tmux
)

# Themes
ZSH_THEME="powerlevel10k/powerlevel10k"

fpath+=$OMZ_CP_DIR/zsh-completions/src
source $ZSH/oh-my-zsh.sh

# Aliases
if [ -f ~/.zsh_aliases ]; then
    . ~/.zsh_aliases
fi
. ~/.zoxide.zsh
fpath=($HOME/.zsh_completions $fpath)

# If you come from bash you might have to change your $PATH.
export PATH=$HOME/bin:/sbin:/usr/local/bin:$HOME/.local/bin:$PATH

# Load completions
autoload -Uz compinit
zstyle ':completion:*' lazy true

_lazy_compinit() {
  compinit
  zmodload -i zsh/complist
}

# Hook to initialize compinit when completion is first attempted
zle -N _lazy_compinit
zle -N expand-or-complete _lazy_compinit
zle -N complete-word _lazy_compinit
zle -N list-choices _lazy_compinit
zle -N menu-select _lazy_compinit
zle -N delete-char-or-list _lazy_compinit

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

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
## There is a lot of hover head here
## So we are Lazy-loading ROS setup
## You are sacrificing autocomplete at first use for speed
_lazy_load_ros() {
  source /opt/ros/humble/setup.zsh
  eval "$(register-python-argcomplete3 ros2)"
  # unfunction _lazy_load_ros
}
# alias ros2='_lazy_load_ros && ros2'
# eval "$(register-python-argcomplete3 colcon)"

export CC=clang
export CXX=clang++
export CLANG_BASE="--build-base build --install-base install"
export BUILD_ARGS="--symlink-install ${CLANG_BASE} --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON"
alias cb="colcon build ${BUILD_ARGS}"

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='nvim'
  export VISUAL='nvim'
else
  export EDITOR='nvim'
  export VISUAL='nvim'
fi

# Go
export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin

# Rust
. "$HOME/.cargo/env"

# LaTeX
export PATH=$PATH:/usr/local/texlive/2023/bin/x86_64-linux
export INFOPATH=$INFOPATH:/usr/local/texlive/2023/texmf-dist/doc/info
export MANPATH=$MANPATH:/usr/local/texlive/2023/texmf-dist/doc/man

# NVM and Node
_lazy_load_nvm() {
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
  unfunction _lazy_load_nvm
}
alias node='_lazy_load_nvm && node'
alias npm='_lazy_load_nvm && npm'
alias nvm='_lazy_load_nvm && nvm'

export MANPATH="/usr/local/man:$MANPATH"

export FIRMWARE_DIR=/home/juniorsundar-unikie/Documents/new/PX4-Autopilot

# Catppuccin theme for FZF
export FZF_DEFAULT_OPTS=" \
--color=bg+:#26282e,bg:#16181a,spinner:#ffd1dc,hl:#ff6e5e \
--color=fg:#ffffff,header:#ff6e5e,info:#bd5eff,pointer:#ffd1dc \
--color=marker:#ffd1dc,fg+:#ffffff,prompt:#bd5eff,hl+:#ff6e5e"

export XDG_DATA_DIRS=$XDG_DATA_DIRS:/var/lib/flatpak/exports/share:$HOME/.local/share/flatpak/exports/share 


[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
