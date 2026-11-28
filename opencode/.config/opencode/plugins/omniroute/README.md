# omniroute (local OpenCode V2 plugin)

OmniRoute gateway provider for OpenCode V2: dynamic model discovery, `/connect`
API-key auth, thinking-level variants, HTTP auth injection, Gemini tool-schema
sanitising, and — the reason this fork exists — a **model picker**, because the
gateway advertises ~400 entries and most of them are noise.

`dist/` is the vendored V1 bundle (discovery, combos, enrichment, disk cache);
`index.js` is the V2 server part, `tui.js` the TUI part and `rpc.js` the shared
RPC contract.

## Commands

| Command | Where | What it does |
| --- | --- | --- |
| `/omniroute-refresh` | server | Drop the cached catalog and fetch it live. |
| `/omniroute-models` | TUI | Open the picker over the current catalog. |
| `/omniroute-models refresh` | TUI | Re-fetch the catalog first, then open the picker. |
| `/omniroute-models reset` | TUI | Forget the selection; expose the whole filtered catalog. |
| `/omniroute-models-reset` | TUI | Same, as its own command. |

The picker is Enter-driven: type to search, Enter toggles the highlighted model
and reopens the list, and the rows under the `commands` heading do the rest —
type `save` to apply, `toggle all` to flip every checkbox at once, `group: cc`
to toggle a whole upstream prefix, `discard` to undo. Escape cancels without
saving.

The selection is stored with `ctx.storage` under `selection/<providerId>` and
survives restarts. Nothing is saved until you pick `save selection`, so a fresh
install exposes the whole filtered catalog and never ends up with zero models.

## Options

```jsonc
{
  "plugins": [
    {
      "package": "./plugins/omniroute",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "hideTierModels": true,   // drop `<id>-low|-medium|-high|-xhigh` siblings
        "hideModeWrappers": true, // drop `no-think/<id>` when `<id>` also exists
        "chatOnly": true,         // drop image / audio / embedding / video models
        "models": {
          "include": ["cc/*", "auto/*"], // id globs, applied first
          "exclude": ["*-preview"]       // id globs, applied after include
        }
      }
    }
  ]
}
```

All three filters default to on. On the current gateway they take 384 advertised
entries down to 185 distinct chat models before any picking.

`models.include` / `models.exclude` are non-interactive alternatives to the
picker, for operators who never open the TUI. Ids are matched case-insensitively
with `*` and `?` wildcards.

## Notes

- A curated `providers.<id>.models` block in `opencode.json` still wins; delete it
  to let the plugin manage the catalog.
- The disk snapshot at `~/.local/share/opencode/plugins/omniroute-<id>.json` is a
  last-known-good copy of the raw gateway responses, so a cold start needs no
  network round-trip.
- `/omniroute-models` needs the TUI part; the server part alone still registers
  the provider with the filtered catalog.
