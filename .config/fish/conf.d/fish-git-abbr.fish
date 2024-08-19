set -l git_version (string split ' ' (git version 2> /dev/null))[3]
set -l git_components (string split . $git_version)

function __git_current_branch
    set ref ''
    set ref (git symbolic-ref --quiet HEAD 2> /dev/null)
    set ret $status
    if test $ret -ne 0
        if test $ret -eq 128
            return
        end
        set ref (git rev-parse --short HEAD 2> /dev/null)
        if test $status -ne 0
            return
        end
    end
    echo (string replace -r -- 'refs/heads/' '' $ref)
end

function __git_develop_branch
    command git rev-parse --git-dir &>/dev/null || return
    for branch in dev devel development
        if command git show-ref -q --verify refs/heads/$branch
            echo $branch
            return
        end
    end
    echo develop
end

function __git_main_branch
    set refs refs/heads/main \
    refs/heads/trunk \
    refs/heads/mainline \
    refs/heads/default \
    refs/remotes/origin/main \
    refs/remotes/origin/trunk \
    refs/remotes/origin/mainline \
    refs/remotes/origin/default \
    refs/remotes/upstream/main \
    refs/remotes/upstream/trunk \
    refs/remotes/upstream/mainline \
    refs/remotes/upstream/default
    for ref in $refs
        if command git show-ref -q --verify $ref
            echo (basename $ref)
        end
        return
    end
    echo master
end

function grename
    if test -z $argv[1] -o -z $argv[2]
        echo "Usage: $argv[0] old_branch new_branch"
        return 1
    end
    git branch -m $argv[1] $argv[2]
    if git push origin :$argv[1]
        git push --set-upstream origin $argv[2]
    end
end

function __grt
    echo "cd $(git rev-parse --show-toplevel 2> /dev/null || echo .)"
end
abbr -a grt -f __grt

abbr -a ggpnp 'ggl && ggp'
abbr -a ggpur ggu

abbr -a g git
abbr -a ga git add
abbr -a gaa git add --all
abbr -a gapa git add --patch
abbr -a gau git add --update
abbr -a gav git add --verbose

alias gwip 'git add -A; git rm (git ls-files --deleted) 2> /dev/null; git commit --no-verify --no-gpg-sign --message "--wip-- [skip ci]"'

abbr -a gam git am
abbr -a gama git am --abort
abbr -a gamc git am --continue
abbr -a gamscp git am --show-current-patch
abbr -a gams git am --skip
abbr -a gap git apply
abbr -a gapt git apply --3way
abbr -a gbs git bisect
abbr -a gbsb git bisect bad
abbr -a gbsg git bisect good
abbr -a gbsn git bisect new
abbr -a gbso git bisect old
abbr -a gbsr git bisect reset
abbr -a gbss git bisect start
abbr -a gbl git blame -w
abbr -a gb git branch
abbr -a gba git branch --all
abbr -a gbd git branch --delete
abbr -a gbD git branch --delete --force

function __gbda
    echo "git branch --no-color --merged | command grep -vE '^([+*]|\s*($(__git_main_branch)|$(__git_develop_branch))\s*\$)' | command xargs git branch --delete 2>/dev/null"
end
abbr -a gbda -f __gbda

abbr -a gbgd 'LANG=C git branch --no-color -vv | grep \': gone\]\' | awk \'"\'"\'{print $1}\'"\'"\' | xargs git branch -d'
abbr -a gbgD 'LANG=C git branch --no-color -vv | grep \': gone\]\' | awk \'"\'"\'{print $1}\'"\'"\' | xargs git branch -D'
abbr -a gbm git branch --move
abbr -a gbnm git branch --no-merged
abbr -a gbr git branch --remote

function __ggsup
    echo "git branch --set-upstream-to=origin/$(__git_current_branch)"
end
abbr -a ggsup -f __ggsup

abbr -a gbg 'LANG=C git branch -vv | grep \': gone\]\''
abbr -a gco git checkout
abbr -a gcor git checkout --recurse-submodules
abbr -a gcb git checkout -b

function __gcd
    echo "git checkout $(__git_develop_branch)"
end
abbr -a gcd -f __gcd

function __gcm
    echo "git checkout $(__git_main_branch)"
end
abbr -a gcm -f __gcm

abbr -a gcp git cherry-pick
abbr -a gcpa git cherry-pick --abort
abbr -a gcpc git cherry-pick --continue
abbr -a gclean git clean --interactive -d
abbr -a gcl git clone --recurse-submodules

function gccd
    command git clone --recurse-submodules $argv
    if test -d $argv[-1]
        cd $argv[-1]
    else 
        cd (basename $argv[-1] .git)
    end
end

abbr -a gcam git commit --all --message
abbr -a gcas git commit --all --signoff
abbr -a gcasm git commit --all --signoff --message
abbr -a gcs git commit --gpg-sign
abbr -a gcss git commit --gpg-sign --signoff
abbr -a gcssm git commit --gpg-sign --signoff --message
abbr -a gcmsg git commit --message
abbr -a gcsm git commit --signoff --message
abbr -a gc git commit --verbose
abbr -a gca git commit --verbose --all
abbr -a gca! git commit --verbose --all --amend
abbr -a gcan! git commit --verbose --all --no-edit --amend
abbr -a gcans! git commit --verbose --all --signoff --no-edit --amend
abbr -a gc! git commit --verbose --amend
abbr -a gcn! git commit --verbose --no-edit --amend
abbr -a gcf git config --list
abbr -a gdct 'git describe --tags (git rev-list --tags --max-count=1)'
abbr -a gd git diff
abbr -a gdca git diff --cached
abbr -a gdcw git diff --cached --word-diff
abbr -a gds git diff --staged
abbr -a gdw git diff --staged --word-diff
abbr -a gdv --set-cursor 'git diff % | view -'
abbr -a gdup git diff @{upstream}
abbr -a gdnolock --set-cursor 'git diff % \':(exclude)package-lock.json\' \':exclude(*.lock)\''
abbr -a gdt git diff-tree --no-commit-id --name-only -r
abbr -a gf git fetch

set -l min_components (string split . '2.8')
if test $git_components[1] -ge $min_components[1] -a $git_components[2] -ge $min_components[2] -o $git_components[1] -gt $min_components[1]
    abbr -a gfa git fetch --all --prune --jobs=10
else
    abbr -a gfa git fetch --all --prune
end

abbr -a gfo git fetch origin
abbr -a gg git gui ciool
abbr -a gga git gui citool --amend
abbr -a ghh git help
abbr -a glgg git log --graph
abbr -a glgga git log --graph --decorate --all
abbr -a glgm git log --graph --max-count=10
abbr -a glods git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset' --date=short
abbr -a glod git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset'
abbr -a glola git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset' --all
abbr -a glols git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset' --stat
abbr -a glol git log --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset'
abbr -a glo git log --oneline --decorate
abbr -a glog git log --oneline --decorate --graph
abbr -a gloga git log --oneline --decorate --graph --all
abbr -a glp --set-cursor 'git log --pretty=%'
abbr -a glg git log --stat
abbr -a glgp git log --stat --patch
abbr -a gignored 'git ls-files -v | grep \'^[[:lower:]]\''
abbr -a gfg 'git ls-files | grep'
abbr -a gm git merge
abbr -a gma git merge --abort
abbr -a gms git merge --squash

function __gmom
    echo "git merge origin/$(__git_main_branch)"
end
abbr -a gmom -f __gmom

function __gmum
    echo "git merge upstream/$(__git_main_branch)"
end
abbr -a gmum -f __gmum

abbr -a gmtl git mergetool --no-prompt
abbr -a gmtlvim git mergetool --no-prompt --tool=vimdiff
abbr -a gl git pull
abbr -a gpr git pull --rebase
abbr -a gup git pull --rebase
abbr -a gupa git pull --rebase --autostash
abbr -a gupav git pull --rebase --autostash --verbose
abbr -a gupv git pull --rebase --verbose

function ggu
    if test (count $argv) -eq 1
        git pull --rebase origin $argv
    else
        git pull --rebase origin (__git_current_branch)
    end
end

function __gupom
    echo "git pull --rebase origin $(__git_main_branch)"
end
abbr -a gupom -f __gupom

function __gupomi
    echo "git pull --rebase=interactive origin $(__git_main_branch)"
end
abbr -a gupomi -f __gupomi

function __ggpull
    echo "git pull origin $(__git_current_branch)"
end
abbr -a ggpull -f __ggpull

function ggl
    if test (count $argv) -gt 0
        git pull origin $argv
    else
        git pull origin (__git_current_branch)
    end
end

function __gluc
    echo "git pull upstream $(__git_current_branch)"
end
abbr -a gluc -f __gluc

function __glum
    echo "git pull upstream $(__git_main_branch)"
end
abbr -a glum -f __glum

abbr -a gp git push
abbr -a gpd git push --dry-run

function ggf
    if test (count $argv) -eq 1
        git push --force origin $argv
    else
        git push --force origin (__git_current_branch)
    end
end

abbr -a gpf! git push --force

set -l min_components (string split . '2.30')
if test $git_components[1] -ge $min_components[1] -a $git_components[2] -ge $min_components[2] -o $git_components[1] -gt $min_components[1]
    abbr -a gpf git push --force-with-lease --force-if-includes
else
    abbr -a gpf git push --force-with-lease
end

function ggfl
    if test (count $argv) -eq 1
        git push --force-with-lease origin $argv
    else
        git push --force-with-lease origin (__git_current_branch)
    end
end

function __gpsup
    echo "git push --set-upstream origin $(__git_current_branch)"
end
abbr -a gpsup -f __gpsup

set -l min_components (string split . '2.30')
if test $git_components[1] -ge $min_components[1] -a $git_components[2] -ge $min_components[2] -o $git_components[1] -gt $min_components[1]
    function __gpsupf
        echo "git push --set-upstream origin $(__git_current_branch) --force-with-lease --force-if-includes"
    end
    abbr -a gpsupf -f __gpsupf
else
    function __gpsupf
        echo "git push --set-upstream origin $(__git_current_branch) --force-with-lease"
    end
    abbr -a gpsupf -f __gpsupf
end

abbr -a gpv git push --verbose
abbr -a gpoat 'git push origin -- all && git push origin --tags'
abbr -a gpod git push origin --delete

function __ggpush
    echo "git push origin $(__git_current_branch)"
end
abbr -a ggpush -f __ggpush

function ggp
    if test (count $argv) -gt 0
        git push origin $argv
    else
        git push origin (__git_current_branch)
    end
end

abbr -a gpu git push upstream
abbr -a grb git rebase
abbr -a grba git rebase --abort
abbr -a grbc git rebase --continue
abbr -a grbi git rebase --interactive
abbr -a grbo git rebase --onto
abbr -a grbs git rebase --skip

function __grbd
    echo "git rebase $(__git_develop_branch)"
end
abbr -a grbd -f __grbd

function __grbm
    echo "git rebase $(__git_main_branch)"
end
abbr -a grbm -f __grbm

function __grbom
    echo "git rebase origin/$(__git_main_branch)"
end
abbr -a grbom -f __grbom

abbr -a gr git remote
abbr -a grv git remote --verbose
abbr -a gra git remote add
abbr -a grrm git remote remove
abbr -a grmv git remote rename
abbr -a grset git remote set-url
abbr -a grup git remote update
abbr -a grh git reset
abbr -a gru 'git reset --'
abbr -a grhh git reset --hard
abbr -a grhk git reset --keep
abbr -a grhs git reset --soft
abbr -a gpristine 'git reset --hard && git clean --froce -dfx'

function __groh
    echo "git reset origin/$(__git_current_branch) --hard"
end
abbr -a groh -f __groh

abbr -a grs git restore
abbr -a grss git restore --source
abbr -a grst git restore --staged
abbr -a gunwip 'git rev-list --max-count=1 --format =\'%s\' HEAD | grep -q \'\\--wip--\' && git reset HEAD~1'
abbr -a grev git revert
abbr -a grm git rm
abbr -a grmc git rm --cached
abbr -a gcount git shortlog --summary --numbered
abbr -a gsh git show
abbr -a gsps git show --pretty=short --show-signature
abbr -a gstall git stash --all
abbr -a gstaa git stash apply
abbr -a gstd git stash drop
abbr -a gstl git stash list
abbr -a gstp git stash pop

set -l min_components (string split . '2.13')
if test $git_components[1] -ge $min_components[1] -a $git_components[2] -ge $min_components[2] -o $git_components[1] -gt $min_components[1]
    abbr -a gsta git stash push
    abbr -a gstu git stash push --include-untracked
else
    abbr -a gsta git stash save
    abbr -a gstu git stash save --include-untracked
end

abbr -a gsts git stash show
abbr -a gst git status
abbr -a gss git status --short
abbr -a gsb git status --short --branch
abbr -a gsi git submodule init
abbr -a gsu git submodule update
abbr -a gsd git svn dcommit

function __git-svn-dcommit-push
    echo "git svn dcommit && git push github $(__git_main_branch):svntrunk"
end
abbr -a git-svn-dcommit-push -f __git-svn-dcommit-push

abbr -a gsr git svn rebase
abbr -a gsw 'git switch'
abbr -a gswc 'git switch --create'

function __gswd
    echo "git switch $(__git_develop_branch)"
end
abbr -a gswd -f __gswd

function __gswm
    echo "git switch $(__git_main_branch)"
end
abbr -a gswm -f __gswm

abbr -a gta git tag --annotate
abbr -a gts git tag --sign
abbr -a gtv 'git tag | sort -V'
abbr -a gignore git update-index --assume-unchanged
abbr -a gunignore git update-index --no-assume-unchanged
abbr -a gwch git whatchanged -p --abbrev-commit --pretty=medium
abbr -a gwt git worktree
abbr -a gwta git worktree add
abbr -a gwtls git worktree list
abbr -a gwtmv git worktree move
abbr -a gwtrm git worktree remove
# gstu: See above
abbr -a gk 'gitk --all --branches &!'
abbr -a gke 'gitk --all (git log --walk-reflogs --pretty=%h) &!'
