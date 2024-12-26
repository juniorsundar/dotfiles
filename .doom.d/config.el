;;; $DOOMDIR/config.el -*- lexical-binding: t; -*-

;; Place your private configuration here! Remember, you do not need to run 'doom
;; sync' after modifying this file!


;; Some functionality uses this to identify you, e.g. GPG configuration, email
;; clients, file templates and snippets. It is optional.
;; (setq user-full-name "John Doe"
;;       user-mail-address "john@doe.com")

;; Doom exposes five (optional) variables for controlling fonts in Doom:
;;
;; - `doom-font' -- the primary font to use
;; - `doom-variable-pitch-font' -- a non-monospace font (where applicable)
;; - `doom-big-font' -- used for `doom-big-font-mode'; use this for
;;   presentations or streaming.
;; - `doom-symbol-font' -- for symbols
;; - `doom-serif-font' -- for the `fixed-pitch-serif' face
;;
;; See 'C-h v doom-font' for documentation and more examples of what they
;; accept. For example:
;;
(setq doom-font (font-spec :family "FiraCode Nerd Font" :size 16 :weight 'semi-light)
      doom-variable-pitch-font (font-spec :family "Fira Sans" :size 17)
      doom-symbol-font (font-spec :family "Symbols Nerd Font Mono" :size 16))
;; If you or Emacs can't find your font, use 'M-x describe-font' to look them
;; up, `M-x eval-region' to execute elisp code, and 'M-x doom/reload-font' to
;; refresh your font settings. If Emacs still can't find your font, it likely
;; wasn't installed correctly. Font issues are rarely Doom issues!

;; There are two ways to load a theme. Both assume the theme is installed and
;; available. You can either set `doom-theme' or manually load a theme with the
;; `load-theme' function. This is the default:
;; (setq doom-theme 'doom-one)

;; This determines the style of line numbers in effect. If set to `nil', line
;; numbers are disabled. For relative line numbers, set this to `relative'.
(setq display-line-numbers-type t)

;; If you use `org' and don't want your org files in the default location below,
;; change `org-directory'. It must be set before org loads!
(setq org-directory "~/Dropbox/org")
;; Ensure inline images are displayed when opening an Org file
(setq org-startup-with-inline-images t)
;; Function to display images
(defun display-inline-images ()
  "Display inline images in the buffer."
  (org-display-inline-images))
;; Add the display function to the Org mode hook
(add-hook 'org-mode-hook 'display-inline-images)

;; Recursive function to find all .org files in a directory
(defun my/org-agenda-files-recursive (directory)
  "Recursively find all .org files in DIRECTORY."
  (let ((org-file-list '()))
    (dolist (file (directory-files-recursively directory "\\.org$"))
      (setq org-file-list (append org-file-list (list file))))
    org-file-list))
(setq org-agenda-files (my/org-agenda-files-recursive "~/Dropbox/org/"))
(setq org-roam-directory (file-truename "~/Dropbox/org/"))
(setq org-roam-dailies-directory "journals/")
(setq org-roam-capture-templates
      '(("d" "default" plain "%?"
         ;; Accomodates for the fact that Logseq uses the "pages" directory
         :target (file+head "pages/${slug}.org" "#+title: ${title}\n")
         :unnarrowed t))
      org-roam-dailies-capture-templates
      '(("d" "default" entry "* %?"
         :target (file+head "%<%Y-%m-%d>.org" "#+title: %<%Y-%m-%d>\n"))))
;; Whenever you reconfigure a package, make sure to wrap your config in an
;; `after!' block, otherwise Doom's defaults may override your settings. E.g.
;;
;;   (after! PACKAGE
;;     (setq x y))
;;
;; The exceptions to this rule:
;;
;;   - Setting file/directory variables (like `org-directory')
;;   - Setting variables which explicitly tell you to set them before their
;;     package is loaded (see 'C-h v VARIABLE' to look up their documentation).
;;   - Setting doom variables (which start with 'doom-' or '+').
;;
;; Here are some additional functions/macros that will help you configure Doom.
;;
;; - `load!' for loading external *.el files relative to this one
;; - `use-package!' for configuring packages
;; - `after!' for running code after a package has loaded
;; - `add-load-path!' for adding directories to the `load-path', relative to
;;   this file. Emacs searches the `load-path' when you load packages with
;;   `require' or `use-package'.
;; - `map!' for binding new keys
;;
;; To get information about any of these functions/macros, move the cursor over
;; the highlighted symbol at press 'K' (non-evil users must press 'C-c c k').
;; This will open documentation for it, including demos of how they are used.
;; Alternatively, use `C-h o' to look up a symbol (functions, variables, faces,
;; etc).
;;
;; You can also try 'gd' (or 'C-c c d') to jump to their definition and see how
;; they are implemented.
;; (setq doom-theme 'catppuccin)
(load-theme 'catppuccin :no-confirm)
(setq catppuccin-flavor 'cyberdream) ;; or 'latte, 'macchiato, or 'mocha
(catppuccin-reload)

;; Enable traditional ligature support in eww-mode, if the
;; Enable all Cascadia and Fira Code ligatures in programming modes
;; (after! ligature
(set-font-ligatures! 't "--" "---" "==" "===" "!=" "!==" "=!="
                        "=:=" "=/=" "<=" ">=" "&&" "&&&" "&=" "++" "+++" "***" ";;" "!!"
                        "??" "???" "?:" "?." "?=" "<:" ":<" ":>" ">:" "<:<" "<>" "<<<" ">>>"
                        "<<" ">>" "||" "-|" "_|_" "|-" "||-" "|=" "||=" "##" "###" "####"
                        "#{" "#[" "]#" "#(" "#?" "#_" "#_(" "#:" "#!" "#=" "^=" "<$>" "<$"
                        "$>" "<+>" "<+" "+>" "<*>" "<*" "*>" "</" "</>" "/>" "<!--" "<#--"
                        "-->" "->" "->>" "<<-" "<-" "<=<" "=<<" "<<=" "<==" "<=>" "<==>"
                        "==>" "=>" "=>>" ">=>" ">>=" ">>-" ">-" "-<" "-<<" ">->" "<-<" "<-|"
                        "<=|" "|=>" "|->" "<->" "<~~" "<~" "<~>" "~~" "~~>" "~>" "~-" "-~"
                        "~@" "[||]" "|]" "[|" "|}" "{|" "[<" ">]" "|>" "<|" "||>" "<||"
                        "|||>" "<|||" "<|>" "..." ".." ".=" "..<" ".?" "::" ":::" ":=" "::="
                        ":?" ":?>" "//" "///" "/*" "*/" "/=" "//=" "/==" "@_" "__" "???"
                        "<:<" ";;;")
;; )
(setq fontaine-presets
      '((default
         :default-family "FiraCode Nerd Font"
         :default-weight regular
         :default-height 110
         :fixed-pitch-family "FiraCode Nerd Font"
         :fixed-pitch-weight regular
         :italic-family "CaskaydiaCove Nerd Font"
         :italic-slant italic
         :variable-pitch-family "Fira Sans"
         :variable-pitch-weight regular
         :variable-pitch-height 120)))

;; Ensure the italic face is only italic and not underlined
(set-face-attribute 'italic nil
                    :underline nil
                    :slant 'italic
                    :family "CaskaydiaCove Nerd Font")
