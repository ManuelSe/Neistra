import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry, ViewerSettings } from "../api/types";
import { ViewerControls } from "../components/ViewerControls";
import { molecularEntry } from "./molecular-fixtures";

afterEach(cleanup);

function controls(
  entry: Entry,
  onSettings: (entryId: string, settings: ViewerSettings) => void,
) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <ViewerControls
        entries={[entry]}
        activeEntryId={entry.id}
        camera={null}
        scenes={[]}
        selectedCount={0}
        busy={false}
        isolated={false}
        onActiveEntry={() => undefined}
        onSettings={onSettings}
        onCameraMode={() => undefined}
        onZoom={() => undefined}
        onIsolation={() => undefined}
        onCreateScene={() => undefined}
        onApplyScene={() => undefined}
        onDeleteScene={() => undefined}
      />
    </Tooltip.Provider>
  );
}

describe("viewer controls", () => {
  it("exposes the non-polar preference with an explicit master dependency", async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn<(entryId: string, settings: ViewerSettings) => void>();
    const entry = molecularEntry("ligand", "Ligand", "ligand");
    const view = render(controls(entry, onSettings));

    await user.click(screen.getByRole("button", { name: "Open viewer controls" }));
    const showHydrogens = screen.getByRole("checkbox", {
      name: "Show hydrogens",
    });
    const showNonpolar = screen.getByRole("checkbox", {
      name: "Show non-polar hydrogens",
    });
    expect(showHydrogens).toBeChecked();
    expect(showNonpolar).toBeChecked();
    expect(showNonpolar).toHaveAccessibleDescription(
      "Turn off to keep polar hydrogens only. Requires Show hydrogens.",
    );

    showNonpolar.focus();
    await user.keyboard("[Space]");
    const updated = onSettings.mock.calls.at(-1);
    expect(updated?.[0]).toBe(entry.id);
    expect(updated?.[1].components.hydrogens).toBe(true);
    expect(updated?.[1].components.nonpolar_hydrogens).toBe(false);

    const hiddenEntry = {
      ...entry,
      viewer_settings: {
        ...entry.viewer_settings,
        components: {
          ...entry.viewer_settings.components,
          hydrogens: false,
          nonpolar_hydrogens: false,
        },
      },
    };
    view.rerender(controls(hiddenEntry, onSettings));
    expect(
      screen.getByRole("checkbox", { name: "Show non-polar hydrogens" }),
    ).toBeDisabled();
  });
});
