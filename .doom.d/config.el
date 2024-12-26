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
      doom-variable-pitch-font (font-spec :family "Fira Sans" :size 17))
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
(after! emacs
  (setq display-line-numbers-type 'relative)
  )

;; If you use `org' and don't want your org files in the default location below,
;; change `org-directory'. It must be set before org loads!
(after! org
  (setq org-todo-keywords
        '((sequence "TODO(t)" "DOING(d!)" "HOLD(h)" "|" "DONE(D)" "CANCELLED(c)" "MAYBE(m)")))
  (setq org-todo-keyword-faces
        '(("DOING" . (:foreground "yellow"))
          ("DONE" . (:foreground "green"))
          ("HOLD" . (:foreground "turquoise"))
          ("TODO" . (:foreground "red"))
          ("CANCELLED" . (:foreground "gray"))
          ("MAYBE" . (:foreground "orange"))))
  ;; Customize agenda prefix format
  (setq org-agenda-prefix-format
        '((agenda . " %i %?-12t% s")  ; remove file name
          (todo . " %i ")
          (tags . " %i ")
          (search . " %i ")))

  (setq org-agenda-dim-blocked-tasks nil)

  ;; Define custom faces for the blocks and their content
  (defface my-note-face
    '((t (:background "#a6d189" :foreground "#1e1e2e" :weight bold)))
    "Face for notes.")

  (defface my-important-face
    '((t (:background "#ea6962" :foreground "#1e1e2e" :weight bold)))
    "Face for important notes.")

  (defface my-warning-face
    '((t (:background "#e5c890" :foreground "#1e1e2e" :weight bold)))
    "Face for warnings.")

  ;; Function  to apply  custom faces  to org  blocks and  their content
  (defun apply-custom-org-faces ()
    "Apply custom faces for specific Org blocks."
    (font-lock-add-keywords nil
                            '(("^[ \t]*#\\+BEGIN_NOTE" 0 'my-note-face t)
                              ("^[ \t]*#\\+END_NOTE" 0 'my-note-face t)
                              ("^[ \t]*#\\+BEGIN_IMPORTANT" 0 'my-important-face t)
                              ("^[ \t]*#\\+END_IMPORTANT" 0 'my-important-face t)
                              ("^[ \t]*#\\+BEGIN_WARN" 0 'my-warning-face t)
                              ("^[ \t]*#\\+END_WARN" 0 'my-warning-face t))
                            'append)
    (save-excursion
      (goto-char (point-min))
      (while (re-search-forward "^[ \t]*#\\+BEGIN_\\(NOTE\\|IMPORTANT\\|WARN\\)" nil t)
        (let* ((tag (match-string 1))
               (start (line-beginning-position))
               (end (progn (re-search-forward (format "^[ \t]*#\\+END_%s" tag)) (line-end-position)))
               (face (pcase tag
                       ("NOTE" 'my-note-face)
                       ("IMPORTANT" 'my-important-face)
                       ("WARN" 'my-warning-face))))
          ;; Apply face to the entire block content
          (put-text-property start end 'face face)))))

  ;; Add the function to org-mode-hook
  (add-hook 'org-mode-hook 'apply-custom-org-faces)

  ;; Ensure the changes take effect
  (font-lock-mode 1)
  (setq org-directory "~/Dropbox/org")
  (setq org-startup-with-inline-images t)
  (defun display-inline-images ()
    "Display inline images in the buffer."
    (org-display-inline-images))
  (add-hook 'org-mode-hook 'display-inline-images)
  (defun my/org-agenda-files-recursive (directory)
    "Recursively find all .org files in DIRECTORY."
    (let ((org-file-list '()))
      (dolist (file (directory-files-recursively directory "\\.org$"))
        (setq org-file-list (append org-file-list (list file))))
      org-file-list))
  (setq org-agenda-files (my/org-agenda-files-recursive "~/Dropbox/org/"))
  (defun my/update-org-agenda-files (&rest _)
    "Update `org-agenda-files` to include all .org files in the directory."
    (setq org-agenda-files (my/org-agenda-files-recursive "~/Dropbox/org/")))
  (advice-add 'org-agenda :before #'my/update-org-agenda-files)
  (setq org-log-done 'time)
  (setq org-hide-emphasis-markers t)
  (setq org-roam-directory (file-truename "~/Dropbox/org/pages"))
  (setq org-roam-dailies-directory "journals/")

  (setq org-superstar-headline-bullets-list '("󰼏" "󰼐" "󰼑" "󰼒" "󰼓" "󰼔"))
  )

(after! evil
  (defvar evil-window-map (make-sparse-keymap)
    "Keymap for Evil window commands.")

  ;; Basic window movement bindings
  (define-key evil-window-map (kbd "h") 'evil-window-left)
  (define-key evil-window-map (kbd "l") 'evil-window-right)
  (define-key evil-window-map (kbd "j") 'evil-window-down)
  (define-key evil-window-map (kbd "k") 'evil-window-up)
  (define-key evil-window-map (kbd "w") 'evil-window-next)

  (evil-define-key 'normal 'global (kbd "C-w") evil-window-map)
  )

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
         :default-height 120
         :fixed-pitch-family "FiraCode Nerd Font"
         :fixed-pitch-weight regular
         :italic-family "CaskaydiaCove Nerd Font"
         :italic-slant italic
         :variable-pitch-family "Fira Sans"
         :variable-pitch-weight regular
         :variable-pitch-height 140)))

;; Set Nerd Font for symbols
(let ((font-spec (font-spec :family "Symbols Nerd Font Mono" :size 18)))
  (set-fontset-font t 'unicode font-spec nil 'prepend)
  (set-fontset-font t '(#x1F000 . #x1F02F) font-spec)  ;; Mahjong Tiles
  (set-fontset-font t '(#x1F0A0 . #x1F0FF) font-spec)  ;; Playing Cards
  (set-fontset-font t '(#x1F300 . #x1F5FF) font-spec)  ;; Misc Symbols and Pictographs
  (set-fontset-font t '(#x1F600 . #x1F64F) font-spec)  ;; Emoticons
  (set-fontset-font t '(#x1F680 . #x1F6FF) font-spec)  ;; Transport and Map
  (set-fontset-font t '(#x1F700 . #x1F77F) font-spec)  ;; Alchemical Symbols
  (set-fontset-font t '(#x1F780 . #x1F7FF) font-spec)  ;; Geometric Shapes Extended
  (set-fontset-font t '(#x1F800 . #x1F8FF) font-spec)  ;; Supplemental Arrows-C
  (set-fontset-font t '(#x1F900 . #x1F9FF) font-spec)  ;; Supplemental Symbols and Pictographs
  (set-fontset-font t '(#x1FA00 . #x1FA6F) font-spec)  ;; Chess Symbols
  (set-fontset-font t '(#x1FA70 . #x1FAFF) font-spec)  ;; Symbols and Pictographs Extended-A
  (set-fontset-font t '(#x2600 . #x26FF) font-spec)    ;; Miscellaneous Symbols
  (set-fontset-font t '(#x2700 . #x27BF) font-spec))  ;; Dingbats

;; Ensure the italic face is only italic and not underlined
(set-face-attribute 'italic nil
                    :underline nil
                    :slant 'italic
                    :family "CaskaydiaCove Nerd Font")
