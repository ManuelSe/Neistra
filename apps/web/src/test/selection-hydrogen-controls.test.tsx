import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SelectionHydrogenControls } from "../components/SelectionHydrogenControls";
import { SelectionStyleDialog } from "../components/SelectionStyleDialog";
import * as HydrogenTargets from "../selection/hydrogenTargets";
import { molecularEntry, proteinProjection } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const entry = molecularEntry("protein", "Receptor", "protein"), projection = proteinProjection();
  projection.structure.atoms[1].element = "H";
  projection.structure.atoms[2].element = "H";
  projection.structure.bonds = [2, 3].map((id) => ({ id, atom_1_id: 1, atom_2_id: id,
    order: 1, aromatic: false, stereo: null, inferred: false }));
  const props: ComponentProps<typeof SelectionHydrogenControls> = {
    entries: [entry], structures: new Map([["protein", projection]]),
    selection: { schema_version: 1, atoms: [{ structure_id: "protein", atom_id: 1 }], granularity: "atom", source: "inspector" },
    busy: false, onChange: vi.fn().mockResolvedValue(undefined),
  };
  return { entry, projection, props };
}
const panel = (props: ComponentProps<typeof SelectionHydrogenControls>) => <Tooltip.Provider delayDuration={0}><SelectionHydrogenControls {...props} /></Tooltip.Provider>;

it("uses attached hidden hydrogen targets for pointer and keyboard actions without changing selection", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  const selected = structuredClone(props.selection);
  entry.viewer_settings.selection_hidden_atoms = [2, 3];
  entry.viewer_settings.components.nonpolar_hydrogens = false;
  render(panel(props));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle).toHaveAttribute("aria-disabled", "false");
  toggle.focus();
  await user.keyboard("{Enter}");
  expect(props.onChange).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "set", show: true }, {
    schema_version: 1, granularity: "atom", source: "inspector", atoms: [{ structure_id: "protein", atom_id: 2 }, { structure_id: "protein", atom_id: 3 }],
  });
  await user.keyboard(" ");
  expect(props.onChange).toHaveBeenCalledTimes(2);
  expect(props.selection).toEqual(selected);
  expect(entry.viewer_settings.components.nonpolar_hydrogens).toBe(false);
});

it("treats inherited and explicit equal preferences as uniform and does not publish on render", async () => {
  const { props, entry } = fixture(), user = userEvent.setup();
  entry.viewer_settings.selection_nonpolar_hydrogens = [{ atom_ids: [2], show: true }];
  render(panel(props));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(props.onChange).not.toHaveBeenCalled();
  toggle.focus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Hydrogens: All. Show polar only. Includes entry settings.");
  await user.click(screen.getByRole("button", { name: "Use entry hydrogen setting" }));
  expect(props.onChange).toHaveBeenLastCalledWith({ property: "nonpolar_hydrogens", action: "reset" }, expect.objectContaining({ atoms: [{ structure_id: "protein", atom_id: 2 }, { structure_id: "protein", atom_id: 3 }] }));
});

it("keeps no-target and unavailable states disabled and suppresses their actions", async () => {
  const { props, projection } = fixture(), user = userEvent.setup();
  projection.structure.bonds = [];
  const view = render(panel(props));
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  expect(screen.getByText("No existing hydrogens in this target.")).toBeVisible();
  await user.click(toggle);
  expect(props.onChange).not.toHaveBeenCalled();
  view.rerender(panel({ ...props, structures: new Map() }));
  expect(screen.queryByText("No existing hydrogens in this target.")).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  await user.keyboard("{Enter}");
  expect(props.onChange).not.toHaveBeenCalled();
});

it("does not repeat target resolution for busy or focus renders", () => {
  const { props } = fixture();
  const resolve = vi.spyOn(HydrogenTargets, "resolveHydrogenTargets");
  const view = render(panel(props));
  expect(resolve).toHaveBeenCalledTimes(1);
  view.rerender(panel({ ...props, busy: true }));
  screen.getByRole("button", { name: "Show non-polar hydrogens" }).focus();
  expect(resolve).toHaveBeenCalledTimes(1);
});

it("places the icon before Polymer and retains focus while one shared action is pending", async () => {
  const { props } = fixture(), user = userEvent.setup();
  let finish!: () => void;
  const onHydrogenAppearance = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const dialog = { ...props, open: true, eligibilityBusy: false, selectionColorMode: "carbon" as const,
    onSelectionColorModeChange: vi.fn(), onOpenChange: vi.fn(), onAction: vi.fn().mockResolvedValue(undefined), onHydrogenAppearance };
  render(<Tooltip.Provider><SelectionStyleDialog {...dialog} /></Tooltip.Provider>);
  const atomic = screen.getByRole("group", { name: "Atom detail" });
  const hydrogen = screen.getByRole("group", { name: "Hydrogens" });
  const polymer = screen.getByRole("group", { name: "Polymer" });
  expect(atomic.compareDocumentPosition(hydrogen) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(hydrogen.compareDocumentPosition(polymer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  const toggle = screen.getByRole("button", { name: "Show non-polar hydrogens" });
  await user.click(toggle);
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(onHydrogenAppearance).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await Promise.resolve(); });
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-disabled", "false");
});
