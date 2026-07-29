# vsconsult

vsconsult is a keyboard-first VSCodium picker that provides Consult-like narrowing and preview in a dedicated bottom Panel tab.

## Language

**Picker**:
The complete transient interaction for querying, navigating, previewing, and accepting a collection of candidates.
_Avoid_: Selector, search box, palette

**Candidate**:
A selectable workspace resource shown by the picker. The prototype's candidates are workspace files.
_Avoid_: Item, option, result

**Query**:
The text used to narrow and rank candidates by fuzzy matching their workspace-relative paths.
_Avoid_: Search term, filter

**Narrowing**:
Reducing and ranking the visible candidate set as the query changes.
_Avoid_: Searching, filtering

**Selection**:
The single highlighted candidate controlled by keyboard navigation.
_Avoid_: Choice, cursor

**Preview**:
A temporary editor display of the selection after a short debounce. A preview does not become the chosen file until accepted.
_Avoid_: Open, commit

**Accept**:
Commit the selection as the chosen editor, exit the picker, and return focus to the editor.
_Avoid_: Submit, confirm, open

**Cancel**:
Exit the picker without accepting and restore the origin.
_Avoid_: Close, dismiss

**Origin**:
The editor, document, and selection active when the picker was invoked, restored on cancellation.
_Avoid_: Previous file, starting tab

**Panel visibility**:
Whether the bottom Panel region was visible before invoking the picker. Exit restores this visibility state but does not promise to reactivate the previously selected Panel tab.
_Avoid_: Panel state, prior panel
