import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SurfaceEditor } from "../components/SurfaceEditor";
import { molecularEntry, proteinProjection, surfaceObject } from "./molecular-fixtures";
import { capturedFragmentSource, surfaceSourceAtoms } from "../selection/surfaceSources";

afterEach(cleanup);
it("applies independent appearance as one command and restores a draft after undo", async () => {
  const entry = molecularEntry("e", "Ligand", "ligand");
  const surface = surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2] }, { inherit_atom_colors: true });
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  const view = render(<SurfaceEditor entry={entry} surface={surface} selection={[]} busy={false} onSave={save} />);
  await user.selectOptions(screen.getByLabelText("Surface color scheme"), "custom");
  expect(screen.getByRole("checkbox", { name: "Inherit atom colors" })).not.toBeChecked();
  await user.clear(screen.getByLabelText("Surface opacity"));
  expect(screen.getByRole("button", { name: "Apply appearance" })).toBeDisabled();
  await user.type(screen.getByLabelText("Surface opacity"), "0.25");
  await user.selectOptions(screen.getByLabelText("Surface display"), "mesh");
  await user.click(screen.getByRole("button", { name: "Apply appearance" }));
  expect(save).toHaveBeenCalledExactlyOnceWith({ appearance: { ...surface.appearance, color_by: "custom", opacity: 0.25, mode: "mesh", inherit_atom_colors: false } });
  view.rerender(<SurfaceEditor entry={entry} surface={{ ...surface, appearance: { ...surface.appearance, opacity: 0.6 } }} selection={[]} busy={false} onSave={save} />);
  expect(screen.getByLabelText("Surface opacity")).toHaveValue(0.6);
  expect(screen.getByLabelText("Surface display")).toHaveValue("solid");
});

it("explicitly selects fragment sources and replaces only same-owner captured atoms", async () => {
  const entry = molecularEntry("e", "Ligand", "ligand"); entry.atom_ids = [1, 2, 3];
  const surface = surfaceObject("f", { kind: "fragment", profile: "molecular-v1", atom_ids: [1, 2] });
  const select = vi.fn(), save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  const view = render(<SurfaceEditor entry={entry} surface={surface} selection={[{ structure_id: "other", atom_id: 1 }]} busy={false} onSave={save} onSelect={select} />);
  await user.click(screen.getByRole("button", { name: "Select source atoms" }));
  expect(select).toHaveBeenCalledWith([1, 2].map(atom_id => ({ structure_id: "e", atom_id })));
  await user.click(screen.getByRole("button", { name: "Replace fragment source" }));
  expect(screen.getByRole("alert")).toHaveTextContent("only to this entry"); expect(save).not.toHaveBeenCalled();
  view.rerender(<SurfaceEditor entry={entry} surface={surface} selection={[{ structure_id: "e", atom_id: 3 }]} busy={false} onSave={save} />);
  await user.click(screen.getByRole("button", { name: "Replace fragment source" }));
  expect(save).toHaveBeenCalledWith({ source: { kind: "fragment", profile: "molecular-v1", atom_ids: [3] } });
});

it("selects complete protein context rather than seeds or viewer visibility, and replaces radius/seeds explicitly", async () => {
  const entry = molecularEntry("e", "Receptor", "protein");
  const projection = proteinProjection();
  const surface = surfaceObject("p", { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "hidden", atom_id: 99 }] });
  const load = vi.fn().mockResolvedValue(projection), save = vi.fn().mockResolvedValue(undefined), select = vi.fn(), user = userEvent.setup();
  render(<SurfaceEditor entry={entry} surface={surface} selection={[{ structure_id: "hidden", atom_id: 1 }]} load={load} onSelect={select} busy={false} onSave={save} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Select source atoms" })).toBeEnabled());
  expect(screen.getByText(/complete protein calculation context/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Select source atoms" }));
  expect(select).toHaveBeenCalledWith(surfaceSourceAtoms(entry, surface, projection));
  expect(select.mock.calls[0][0]).not.toContainEqual({ structure_id: "hidden", atom_id: 99 });
  await user.clear(screen.getByLabelText("Surface pocket radius")); await user.type(screen.getByLabelText("Surface pocket radius"), "5.5");
  await user.click(screen.getByRole("button", { name: "Apply radius" }));
  expect(save).toHaveBeenLastCalledWith({ source: { ...surface.source, radius: 5.5 } });
  await user.click(screen.getByRole("button", { name: "Replace seeds from selection" }));
  expect(save).toHaveBeenLastCalledWith({ source: { ...surface.source, radius: 5.5, seed_atom_references: [{ structure_id: "hidden", atom_id: 1 }] } });
});

it("ignores stale context completion after an artifact change and keeps unavailable definitions manageable", async () => {
  const entry = molecularEntry("e", "Receptor", "protein");
  const surface = surfaceObject("p", { kind: "pocket", profile: "pocket-v1", radius: 5, seed_atom_references: [{ structure_id: "e", atom_id: 1 }] });
  let complete!: (value: ReturnType<typeof proteinProjection>) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockRejectedValue(new Error("Missing artifact"));
  const view = render(<SurfaceEditor entry={entry} surface={surface} selection={[]} load={load} busy={false} onSave={vi.fn()} />);
  view.rerender(<SurfaceEditor entry={{ ...entry, current_artifact_id: "new" }} surface={surface} selection={[]} load={load} busy={false} onSave={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Missing artifact");
  complete(proteinProjection());
  await waitFor(() => expect(screen.getByRole("button", { name: "Select source atoms" })).toBeDisabled());
  expect(screen.getByRole("button", { name: "Retry source context" })).toBeEnabled();
});

it("validates captured fragment ownership and uses all current entry atoms", () => {
  const entry = molecularEntry("e", "Owner", "protein"); entry.atom_ids = [1, 2, 4];
  expect(surfaceSourceAtoms(entry, surfaceObject("all", { kind: "entry" }))).toEqual([1, 2, 4].map(atom_id => ({ structure_id: "e", atom_id })));
  expect(() => capturedFragmentSource(entry, [{ structure_id: "e", atom_id: 3 }])).toThrow("unavailable");
  expect(capturedFragmentSource(entry, [4, 1, 1].map(atom_id => ({ structure_id: "e", atom_id })))).toEqual({ kind: "fragment", profile: "molecular-v1", atom_ids: [1, 4] });
});
