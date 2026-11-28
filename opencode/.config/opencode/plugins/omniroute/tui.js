/**
 * OmniRoute TUI part — the model picker.
 *
 * The gateway advertises hundreds of models, most of them the same model in
 * several shapes (tier siblings, mode wrappers, aliases, non-chat endpoints).
 * The server part filters the obvious noise automatically, but only the person
 * using OpenCode knows which handful they actually want in the picker. This part
 * adds:
 *
 *   /omniroute-models            open the picker over the current catalog
 *   /omniroute-models refresh    re-fetch the catalog first, then open it
 *   /omniroute-models reset      forget the selection, expose everything again
 *   /omniroute-models-reset      same, as its own command
 *
 * Interaction is Enter-driven on purpose. The dialog's footer actions are not
 * reachable from the keyboard in OpenCode 2.4 (the search field keeps focus, and
 * Ctrl+<key> is swallowed as text editing), so every operation is an ordinary
 * row in the list: pick it with Enter, exactly like a model. Rows live under a
 * "commands" heading at the end of the list and are found by typing, e.g.
 * `save`, `toggle all`, `group: cc`, `discard`. `toggle all` flips every
 * checkbox, so it is both "select all" and "select none" depending on the
 * current state.
 *
 * Everything that needs the gateway (the catalog) and everything that must
 * survive a restart (the selection) lives in the server part; this file only
 * talks to it over the plugin RPC in `rpc.js`.
 */

import { Plugin } from "@opencode/plugin/tui";

import { OmniRouteRpc } from "./rpc.js";

/** `Plugin.define` is identity, but keep the export shape tolerant. */
const define = Plugin?.define ?? ((plugin) => plugin);

const MARK_SELECTED = "[x]";
const MARK_UNSELECTED = "[ ]";

/** Sentinel values for command rows; NUL keeps them clear of real model ids. */
const CMD = {
  save: "\u0000save",
  toggleAll: "\u0000toggle-all",
  revert: "\u0000revert",
  group: "\u0000group:",
};

const COMMANDS_CATEGORY = "commands";

export default define({
  id: "omniroute.tui",
  setup(context) {
    const location = () => context.location ?? context.data.location.default();

    /** Request options that pin the call to this TUI's location. */
    const requestOptions = () => {
      const current = location();
      return current?.directory ? { location: { directory: current.directory } } : undefined;
    };

    const client = () => context.client.rpc(OmniRouteRpc);

    const notify = (message, variant = "info") => {
      void context.ui.toast.show({ title: "OmniRoute", message, variant });
    };

    /** Refresh the TUI's cached provider/model data after a selection change. */
    const invalidateModels = () => {
      const current = location();
      if (!current) return;
      context.data.location.model.invalidate(current);
      context.data.location.provider.invalidate(current);
    };

    const save = async (ids) => {
      const { visible, total } = await client().select({ ids }, requestOptions());
      invalidateModels();
      notify(
        visible === total ? `All ${total} model(s) visible` : `${visible}/${total} model(s) visible`,
        "success",
      );
    };

    /**
     * Run the picker. Returns true when a selection was saved.
     *
     * `onlyIfUnselected` makes it a no-op once a selection exists — used when a
     * refresh finishes, so the picker only interrupts the first time.
     */
    const pick = async ({ refresh = false, onlyIfUnselected = false } = {}) => {
      let catalog;
      try {
        catalog = await client().catalog({ refresh }, requestOptions());
      } catch (error) {
        notify(`Could not read the catalog: ${error?.message ?? error}`, "error");
        return false;
      }

      if (onlyIfUnselected && catalog?.hasSelection) return false;

      const models = catalog?.models ?? [];
      if (models.length === 0) {
        notify("No models discovered yet — run /omniroute-refresh first.", "warning");
        return false;
      }

      const total = models.length;
      const initial = new Set(models.filter((model) => model.selected).map((model) => model.id));
      const checked = new Set(initial);
      const groups = [...new Set(models.map((model) => model.group))];

      for (;;) {
        const allChecked = models.every((model) => checked.has(model.id));
        const options = [
          ...models.map((model) => ({
            title: `${checked.has(model.id) ? MARK_SELECTED : MARK_UNSELECTED} ${model.id}`,
            value: model.id,
            category: model.group,
            description:
              model.name && model.name !== model.id
                ? `${model.name}${model.variants > 0 ? ` · ${model.variants} thinking levels` : ""}`
                : model.variants > 0
                  ? `${model.variants} thinking levels`
                  : undefined,
          })),
          {
            title: "save selection",
            value: CMD.save,
            category: COMMANDS_CATEGORY,
            description: `Expose the ${checked.size} checked model(s) and hide the rest`,
          },
          {
            title: "toggle all",
            value: CMD.toggleAll,
            category: COMMANDS_CATEGORY,
            description: allChecked
              ? `Uncheck every one of the ${total} models`
              : `Check every one of the ${total} models`,
          },
          ...groups.map((group) => ({
            title: `toggle group: ${group}`,
            value: `${CMD.group}${group}`,
            category: COMMANDS_CATEGORY,
            description: `Check or uncheck all models in ${group}/`,
          })),
          {
            title: "discard changes",
            value: CMD.revert,
            category: COMMANDS_CATEGORY,
            description: "Go back to the selection this picker opened with",
          },
        ];

        const choice = await context.ui.dialog.select({
          title: `OmniRoute models · ${checked.size}/${total} visible`,
          placeholder: 'Search · Enter toggles · type "save" to apply · Esc cancels',
          options,
          // Titles carry the checkbox and the commands carry prose, so match on
          // the id and the description instead of the rendered title.
          search: (query, searchable) => {
            const needle = query.trim().toLowerCase();
            if (needle.length === 0) return searchable;
            return searchable.filter((option) => {
              if (typeof option.value === "string" && option.value.startsWith("\u0000")) {
                return option.title.toLowerCase().includes(needle);
              }
              return `${option.value} ${option.description ?? ""}`.toLowerCase().includes(needle);
            });
          },
        });

        // Escape, or any other dismissal: leave the saved selection untouched.
        if (choice === undefined) return false;

        if (choice === CMD.save) break;
        if (choice === CMD.toggleAll) {
          for (const model of models) {
            if (allChecked) checked.delete(model.id);
            else checked.add(model.id);
          }
          continue;
        }
        if (choice === CMD.revert) {
          checked.clear();
          for (const id of initial) checked.add(id);
          continue;
        }
        if (typeof choice === "string" && choice.startsWith(CMD.group)) {
          const group = choice.slice(CMD.group.length);
          const members = models.filter((model) => model.group === group);
          const allChecked = members.every((model) => checked.has(model.id));
          for (const model of members) {
            if (allChecked) checked.delete(model.id);
            else checked.add(model.id);
          }
          continue;
        }

        // A model row: toggle it and reopen with the new state.
        if (checked.has(choice)) checked.delete(choice);
        else checked.add(choice);
      }

      if (checked.size === 0) {
        const confirmed = await context.ui.dialog.confirm({
          title: "Hide every model?",
          message:
            "Saving an empty selection hides the whole OmniRoute provider. " +
            "Run /omniroute-models-reset to bring the models back.",
          label: { confirm: "Hide all", cancel: "Cancel" },
        });
        if (!confirmed) return false;
      }

      try {
        await save([...checked]);
        return true;
      } catch (error) {
        notify(`Could not save the selection: ${error?.message ?? error}`, "error");
        return false;
      }
    };

    /** Drop the saved selection and expose the whole filtered catalog. */
    const reset = async () => {
      try {
        const { total } = await client().select({ ids: [], clear: true }, requestOptions());
        invalidateModels();
        notify(`Selection cleared — all ${total} model(s) visible`, "success");
      } catch (error) {
        notify(`Could not clear the selection: ${error?.message ?? error}`, "error");
      }
    };

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "omniroute.models.pick",
          title: "OmniRoute: choose visible models",
          group: "OmniRoute",
          palette: true,
          slash: { name: "omniroute-models", arguments: true },
          run: async (input) => {
            const args = typeof input === "string" ? input.trim().toLowerCase() : "";
            if (args === "reset" || args === "all") await reset();
            else await pick({ refresh: args.split(/\s+/).includes("refresh") });
          },
        },
        {
          id: "omniroute.models.reset",
          title: "OmniRoute: show all models again",
          group: "OmniRoute",
          palette: true,
          slash: { name: "omniroute-models-reset" },
          run: () => reset(),
        },
      ],
      bindings: ["omniroute.models.pick", "omniroute.models.reset"],
    }));

    // Another window saved a selection: refresh this one's provider data. A
    // finished refresh offers the picker, but only until something is chosen.
    try {
      const subscriptions = [
        client().events.on("selectionChanged", () => invalidateModels()),
        client().events.on("refreshed", () => {
          invalidateModels();
          void pick({ onlyIfUnselected: true });
        }),
      ];
      return () => {
        for (const unsubscribe of subscriptions) unsubscribe?.();
      };
    } catch {
      // Older servers may not expose RPC events; the picker still works.
      return undefined;
    }
  },
});
