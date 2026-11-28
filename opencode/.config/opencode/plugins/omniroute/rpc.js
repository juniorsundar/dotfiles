/**
 * RPC contract shared by the server part (`index.js`) and the TUI part
 * (`tui.js`).
 *
 * `Rpc.define` from `@opencode/plugin/rpc` only validates that no error name
 * starts with `rpc.` and returns its argument unchanged, so the contract is a
 * plain object here. That keeps this file import-free and loadable from either
 * side.
 */

const modelEntry = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    group: { type: "string" },
    variants: { type: "number" },
    selected: { type: "boolean" },
  },
  required: ["id", "name", "group", "variants", "selected"],
};

export const OmniRouteRpc = {
  id: "omniroute",
  methods: {
    /**
     * Return the full discovered catalog (before the selection filter), with a
     * `selected` flag per model. `refresh: true` drops the cache and fetches
     * live first.
     */
    catalog: {
      input: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
      },
      output: {
        type: "object",
        properties: {
          providerId: { type: "string" },
          displayName: { type: "string" },
          /** False until the user has saved a selection; every model is shown. */
          hasSelection: { type: "boolean" },
          models: { type: "array", items: modelEntry },
        },
        required: ["providerId", "displayName", "hasSelection", "models"],
      },
    },
    /**
     * Persist the set of model ids to expose. `clear: true` drops the saved
     * selection and exposes the whole catalog again.
     */
    select: {
      input: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          clear: { type: "boolean" },
        },
        required: ["ids"],
      },
      output: {
        type: "object",
        properties: { visible: { type: "number" }, total: { type: "number" } },
        required: ["visible", "total"],
      },
    },
  },
  events: {
    selectionChanged: {
      schema: {
        type: "object",
        properties: { providerId: { type: "string" } },
        required: ["providerId"],
      },
    },
    /**
     * A live `/omniroute-refresh` finished. The TUI opens the picker when
     * nothing has been chosen yet, which is the "refresh, then choose" flow.
     */
    refreshed: {
      schema: {
        type: "object",
        properties: { providerId: { type: "string" } },
        required: ["providerId"],
      },
    },
  },
};
