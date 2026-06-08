```bash
# Install gnu-stow (apt install stow ...)
# Install git (apt install git ...)

# Clone dotfiles repo
git clone https://github.com/juniorsundar/dotfiles.git $HOME/dotfiles

cd $HOME/dotfiles

# Symlink out the configs that you want
stow lazygit

# If stow fails because the folder already exists
stow --adopt lazygit
git checkout main
stow lazygit
```
