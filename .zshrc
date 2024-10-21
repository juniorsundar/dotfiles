# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"

# Load completions
fpath=($HOME/.zsh_completions $fpath)
autoload -Uz compinit; compinit

source "${ZINIT_HOME}/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit
unalias zi

# Correctly specify repositories
zinit light Aloxaf/fzf-tab
zinit ice depth"1"; zinit light romkatv/powerlevel10k
zinit light zsh-users/zsh-autosuggestions
zinit light zdharma-continuum/fast-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit ice wait lucid; zinit light olets/zsh-abbr

# Load git and tmux plugins from Oh-My-Zsh
zinit ice wait lucid; zinit snippet OMZP::git
zinit ice wait lucid; zinit snippet OMZP::tmux
zinit ice wait lucid; zinit snippet OMZP::nvm
zinit snippet OMZL::key-bindings.zsh

[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

# Aliases
if [ -f ~/.zsh_aliases ]; then
    source ~/.zsh_aliases
fi
source ~/.zoxide.zsh

# History settings
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
zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:z:*' fzf-preview 'eza -1a --color=always $realpath'
zstyle ':fzf-tab:complete:eza:*' fzf-preview 'eza -1a --color=always $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'

# Sourcing ROS 2 (lazy load)
_lazy_load_ros() {
  source /opt/ros/humble/setup.zsh
  eval "$(register-python-argcomplete3 ros2)"
  alias ros2='ros2'  # Ensure the alias persists after first run
  ros2 "$@"         # Pass arguments to ros2 if the alias is used with arguments
}

alias ros2=_lazy_load_ros
export CC=clang
export CXX=clang++
export CLANG_BASE="--build-base build --install-base install"
export BUILD_ARGS="--symlink-install ${CLANG_BASE} --cmake-args -DCMAKE_EXPORT_COMPILE_COMMANDS=ON"
alias cb="colcon build ${BUILD_ARGS}"

# Preferred editor for local and remote sessions
export EDITOR='nvim'
export VISUAL='nvim'

# Go
export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin

# Rust
source "$HOME/.cargo/env"

# LaTeX
export PATH=$PATH:/usr/local/texlive/2023/bin/x86_64-linux
export INFOPATH=$INFOPATH:/usr/local/texlive/2023/texmf-dist/doc/info
export MANPATH=$MANPATH:/usr/local/texlive/2023/texmf-dist/doc/man

export MANPATH="/usr/local/man:$MANPATH"

export FIRMWARE_DIR=/home/juniorsundar-unikie/Documents/new/PX4-Autopilot

# Theme for FZF
## cyberdream
export FZF_DEFAULT_OPTS=" \
--color=bg+:#26282e,bg:#16181a,spinner:#ffd1dc,hl:#ff6e5e \
--color=fg:#ffffff,header:#ff6e5e,info:#bd5eff,pointer:#ffd1dc \
--color=marker:#ffd1dc,fg+:#ffffff,prompt:#bd5eff,hl+:#ff6e5e"
## modus_vivendi
# export FZF_DEFAULT_OPTS=" \
# --color=bg+:#2a1f00,bg:#000000,spinner:#ffbfbf,hl:#ff5f59 \
# --color=fg:#ffffff,header:#ff5f59,info:#b6a0ff,pointer:#ffbfbf \
# --color=marker:#ffbfbf,fg+:#ffffff,prompt:#b6a0ff,hl+:#ff5f59"

export XDG_DATA_DIRS=$XDG_DATA_DIRS:/var/lib/flatpak/exports/share:$HOME/.local/share/flatpak/exports/share

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

bindkey -v
