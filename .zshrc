# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# If you come from bash you might have to change your $PATH.
export PATH=$HOME/bin:/usr/local/bin:$HOME/.local/bin:$PATH

export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="powerlevel10k/powerlevel10k"
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# CASE_SENSITIVE="true"
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
# zstyle ':omz:update' mode reminder  # just remind me to update when it's time
# zstyle ':omz:update' frequency 13

# DISABLE_MAGIC_FUNCTIONS="true"
# DISABLE_LS_COLORS="true"
# DISABLE_AUTO_TITLE="true"
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
COMPLETION_WAITING_DOTS="%F{yellow} ...%f"
# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
plugins=(git zsh-autosuggestions zsh-syntax-highlighting tmux)

source $ZSH/oh-my-zsh.sh

# Sourcing ROS 2
source /opt/ros/humble/setup.zsh
eval "$(register-python-argcomplete3 ros2)"
eval "$(register-python-argcomplete3 colcon)"

# You may need to manually set your language environment
export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='nvim'
  export VISUAL='nvim'
else
  export EDITOR='nvim'
  export VISUAL='nvim'
fi

# Aliases
if [ -f ~/.zsh_aliases ]; then
    . ~/.zsh_aliases
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

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

source ~/.zoxide.zsh

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
