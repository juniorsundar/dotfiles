import { describe, expect, it } from "vitest";

import type { PickerCandidate } from "../picker/types.js";
import { renderPickCandidate } from "./render.js";

describe("renderPickCandidate", () => {
  it("renders primary = label, secondary = description (placeholder), tooltip = id", () => {
    const candidate: PickerCandidate = {
      id: "grep",
      label: "Grep",
      description: "Search workspace contents…",
    };
    expect(renderPickCandidate(candidate)).toEqual({
      primary: "Grep",
      secondary: "Search workspace contents…",
      tooltip: "grep",
    });
  });
});
