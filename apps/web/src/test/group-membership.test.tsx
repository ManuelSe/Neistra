import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupMembershipDialog } from "../components/GroupMembershipDialog";
import { captureGroupScope, groupLabels } from "../groups/membership";
import { canonicalSelection } from "../selection/selection";
import { molecularProject } from "./molecular-fixtures";

afterEach(cleanup);
const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }, { structure_id: "ligand", atom_id: 1 }]);
const project = molecularProject();
const scope = captureGroupScope(project, selection, "protein", new Set(["protein"]));

describe("complete-entry grouping scope", () => {
  it("captures selected entries including filter-hidden and partially selected structures", () => {
    expect(scope.entryIds).toEqual(["ligand", "protein"]);
    expect(scope.hiddenCount).toBe(1);
    expect(scope.revision).toBe(project.revision);
    const original = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
    const captured = captureGroupScope(project, original, "ligand", new Set(["ligand"]));
    expect(captured.entryIds).toEqual(["ligand"]);
    original.atoms[0].atom_id = 2;
    expect(captured.selection.atoms[0].atom_id).toBe(1);
  });

  it("disambiguates duplicate names without changing stored names or colliding with literal names", () => {
    const groups = [
      { ...project.groups[0], id: "b", name: "Same" },
      { ...project.groups[0], id: "a", name: "Same" },
      { ...project.groups[0], id: "c", name: "Same · Group 1" },
    ];
    expect([...groupLabels(groups).values()]).toEqual(["Same · Group 2", "Same · Group 3", "Same · Group 1"]);
    expect(groups[0].name).toBe("Same");
  });
});

describe("membership dialog", () => {
  it("shows complete scope, sends the captured batch, and reports failures without dismissing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Revision conflict"));
    const onClose = vi.fn();
    render(<Tooltip.Provider><GroupMembershipDialog project={project} request={{ mode: "move", scope }} busy={false} onSubmit={onSubmit} onClose={onClose} /></Tooltip.Provider>);
    expect(screen.getByText(/2 complete structures \(1 hidden/)).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Destination group"), "group-1");
    await user.click(screen.getByRole("button", { name: "Move structures" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Revision conflict"));
    expect(onSubmit).toHaveBeenCalledWith(scope, { groupId: "group-1" });
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("blocks obsolete revisions and pending submissions", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<Tooltip.Provider><GroupMembershipDialog project={{ ...project, revision: scope.revision + 1 }} request={{ mode: "move", scope }} busy={false} onSubmit={onSubmit} onClose={vi.fn()} /></Tooltip.Provider>);
    expect(screen.getByRole("alert")).toHaveTextContent("The project changed");
    expect(screen.getByRole("button", { name: "Move structures" })).toBeDisabled();
    rerender(<Tooltip.Provider><GroupMembershipDialog project={project} request={{ mode: "move", scope }} busy onSubmit={onSubmit} onClose={vi.fn()} /></Tooltip.Provider>);
    expect(screen.getByRole("button", { name: "Move structures" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("creates a group for the captured batch and validates the name", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<Tooltip.Provider><GroupMembershipDialog project={project} request={{ mode: "create", scope }} busy={false} onSubmit={onSubmit} onClose={onClose} /></Tooltip.Provider>);
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    await user.type(screen.getByLabelText("Group name"), "  Inputs  ");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(onSubmit).toHaveBeenCalledWith(scope, { name: "Inputs" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
