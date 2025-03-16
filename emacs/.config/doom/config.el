;;; $DOOMDIR/config.el -*- lexical-binding: t; -*-

;; Place your private configuration here! Remember, you do not need to run 'doom
;; sync' after modifying this file!


(load-theme 'catppuccin :no-confirm)
;; (setq catppuccin-height-title-1 '1.0)
;; (setq catppuccin-height-title-2 '1.0)
;; (setq catppuccin-height-title-3 '1.0)
(setq catppuccin-flavor 'cyberdream) ;; or 'latte, 'macchiato, or 'mocha
(catppuccin-reload)

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
(setq doom-font (font-spec :family "FiraCode Nerd Font" :size 16 :weight 'semi-light)
      doom-variable-pitch-font (font-spec :family "SF Pro" :size 19))
;; If you or Emacs can't find your font, use 'M-x describe-font' to look them
;; up, `M-x eval-region' to execute elisp code, and 'M-x doom/reload-font' to
;; refresh your font settings. If Emacs still can't find your font, it likely
;; wasn't installed correctly. Font issues are rarely Doom issues!
(map! :leader :desc "Find text" :n "f t" #'consult-ripgrep)

(add-to-list 'exec-path (expand-file-name "~/.local/share/nvim/mason/bin"))

(after! emacs
  (setq display-line-numbers-type 'relative)
  ;; (setq display-line-numbers-type 'relative)
  )

(after! org
  (defvar my/org-enlarge-headings t)
  (defvar my/org-document-title 1.44)
  (defvar my/org-heading-height-1 1.3)
  (defvar my/org-heading-height-2 1.2)
  (defvar my/org-heading-height-3 1.1)
  (custom-set-faces
   `(org-document-title ((t (:inherit bold
                             ,@(when my/org-enlarge-headings
                                 `(:height ,my/org-heading-height-1))))))
   `(org-level-1 ((t (:inherit bold
                      ,@(when my/org-enlarge-headings
                          `(:height ,my/org-heading-height-1))))))
   `(org-level-2 ((t (:inherit bold
                      ,@(when my/org-enlarge-headings
                          `(:height ,my/org-heading-height-2))))))
   `(org-level-3 ((t (:weight normal
                      ,@(when my/org-enlarge-headings
                          `(:height ,my/org-heading-height-3)))))))

  (setq org-todo-keywords
        '((sequence "TODO(t)" "DOING(d!)" "HOLD(h)" "|" "DONE(D)" "CANCELLED(c)" "MAYBE(m)")))
  (setq org-todo-keyword-faces
        '(("DOING" . (:background "orange" :foreground "black"))
          ("DONE" . (:background "green" :foreground "black"))
          ("HOLD" . (:background "turquoise" :foreground "black"))
          ("TODO" . (:background "red" :foreground "white"))
          ("CANCELLED" . (:background "gray" :foreground "black"))
          ("MAYBE" . (:background "yellow" :foreground "black"))))
  ;; Customize agenda prefix format
  (setq org-agenda-prefix-format
        '((agenda . " %i %?-12t% s")  ; remove file name
          (todo . " %i ")
          (tags . " %i ")
          (search . " %i ")))

  (setq org-agenda-dim-blocked-tasks nil)

  (defface my-note-face
    '((t :background "#a6d189" :foreground "#1e1e2e" :extend t))
    "Face for NOTE blocks with full width background.")
  (defface my-important-face
    '((t :background "#ea6962" :foreground "#1e1e2e" :extend t))
    "Face for IMPORTANT blocks with full width background.")
  (defface my-warning-face
    '((t :background "#e5c890" :foreground "#1e1e2e" :extend t))
    "Face for WARNING blocks with full width background.")
  (defun apply-custom-org-block-face (start end face)
    "Apply FACE to the entire visual line from START to END."
    (let ((overlay (make-overlay start end)))
      (overlay-put overlay 'face face)
      (overlay-put overlay 'line-prefix
                   nil)
                   ;; (propertize " " 'face face 'display '(space :align-to 0)))
      (overlay-put overlay 'after-string
                   (propertize " " 'face face 'display '(space :align-to right-margin)))))
  (defun highlight-org-block-region ()
    "Highlight org blocks with full window width background."
    (remove-overlays (point-min) (point-max)) ; Clear existing overlays
    (save-excursion
      (goto-char (point-min))
      (while (re-search-forward "^[ \t]*#\\+BEGIN_\\(NOTE\\|IMPORTANT\\|WARN\\)" nil t)
        (let* ((block-type (match-string 1))
               (block-start (line-beginning-position))
               (face (pcase block-type
                       ("NOTE" 'my-note-face)
                       ("IMPORTANT" 'my-important-face)
                       ("WARN" 'my-warning-face))))
          (when (re-search-forward (format "^[ \t]*#\\+END_%s" block-type) nil t)
            (apply-custom-org-block-face block-start (line-end-position) face))))))
  (define-minor-mode org-block-highlight-mode
    "Minor mode for highlighting org blocks with full window width background."
    :lighter " OrgBlockHL"
    (if org-block-highlight-mode
        (progn
          (highlight-org-block-region)
          (add-hook 'after-change-functions
                    (lambda (&rest _) (highlight-org-block-region))
                    nil t))
      (remove-overlays (point-min) (point-max))))
  (add-hook 'org-mode-hook 'org-block-highlight-mode)

  (font-lock-mode 1)

  (setq org-directory "~/Dropbox/org")
  (setq org-startup-with-inline-images t)
  (defun display-inline-images ()
    "Display inline images in the buffer."
    (org-display-inline-images))
  (add-hook 'org-mode-hook 'display-inline-images)

  ;; ---- UPDATE CACHE FOR AGENDA
  (defvar my/org-agenda-files-cache nil
    "Cache for org agenda files.")
  (defun my/org-agenda-files-recursive (directory)
    "Recursively find all .org files in DIRECTORY."
    (let ((org-file-list '()))
      (dolist (file (directory-files-recursively directory "\\.org$"))
        (push file org-file-list))
      org-file-list))
  (defun my/update-org-agenda-files (&rest _)
    "Update `org-agenda-files` and the cache."
    (setq my/org-agenda-files-cache (my/org-agenda-files-recursive "~/Dropbox/org/"))
    (setq org-agenda-files my/org-agenda-files-cache))
  ;; Initialize the cache on startup
  (my/update-org-agenda-files)
  (defun my/org-agenda-maybe-update-files (&rest _)
    "Update `org-agenda-files` if the cache is empty."
    (unless my/org-agenda-files-cache
      (my/update-org-agenda-files)))
  (advice-add 'org-agenda :before #'my/org-agenda-maybe-update-files)
  (defun my/org-agenda-refresh-cache ()
    "Refresh the org agenda files cache."
    (interactive)
    (my/update-org-agenda-files))
  (map! :leader :desc "Refresh agenda cache" :n "o a r" #'my/org-agenda-refresh-cache)
  ;; -----------------------------------------


  (setq org-log-done 'time)
  (setq org-hide-emphasis-markers t)
  (setq org-pretty-entities t)
  (setq org-roam-directory (file-truename "~/Dropbox/org/pages"))
  (setq org-roam-dailies-directory "../journals/")

  (setq org-superstar-headline-bullets-list '("󰼏" "󰼐" "󰼑" "󰼒" "󰼓" "󰼔"))
  (setq org-attach-id-dir "~/Dropbox/org/assets/")

  (setq org-modern-star nil)

  (setq org-agenda-tags-column 0)
  (setq org-agenda-block-separator ?─)
  (setq org-agenda-time-grid
        '((daily today require-timed)
          (800 1000 1200 1400 1600 1800 2000)
          " ┄┄┄┄┄ " "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄"))
  (setq org-agenda-current-time-string
        "<-- now ───────")
  (setq org-modern-priority nil)

  (setq org-modern-todo-faces
        (quote (("TODO" :background "red" :foreground "white")
                ("DOING" :background "orange" :foreground "black")
                ("HOLD" :background "turquoise" :foreground "black")
                ("CANCELLED" . (:background "gray" :foreground "black"))
                ("MAYBE" . (:background "yellow" :foreground "black"))
                ("DONE" . (:background "green" :foreground "black")))))
  (global-org-modern-mode)

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

  )
(evil-define-key 'normal 'global (kbd "C-w") evil-window-map)

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
         :default-height 100
         :fixed-pitch-family "FiraCode Nerd Font"
         :fixed-pitch-weight regular
         :italic-family "CaskaydiaCove Nerd Font"
         :italic-slant italic
         :variable-pitch-family "Fira Sans"
         :variable-pitch-weight regular
         :variable-pitch-height 120)))

;; Set Nerd Font for symbols
(let ((font-spec (font-spec :family "Symbols Nerd Font Mono" :size 14)))
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
