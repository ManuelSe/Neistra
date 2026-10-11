import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useGroupActionFocus } from "../groups/useGroupActionFocus";
import { captureGroupScope } from "../groups/membership";
import { canonicalSelection } from "../selection/selection";
import { molecularProject } from "./molecular-fixtures";

const project = molecularProject();
const scope = captureGroupScope(project, canonicalSelection([{ structure_id: "protein", atom_id: 1 }]), "protein", new Set(["protein"]));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ revision = project.revision, id = project.id }: { revision?: number; id?: string }) {
  const restore = useGroupActionFocus({ id, revision }, id);
  return <><div key={`${id}:${revision}`} data-entry-id="protein">
    <button className="entry-menu-trigger" onClick={() => restore(scope, null, project.revision + 1)}>Actions for receptor</button>
  </div><input aria-label="Unrelated field" /></>;
}

it("waits for the accepted revision before focusing the remounted group action", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);
  const original = screen.getByRole("button");
  await user.click(original);
  expect(original).toHaveFocus(); // Query notification has not rendered yet.
  rerender(<Harness revision={project.revision + 1} />);
  expect(original.isConnected).toBe(false);
  expect(screen.getByRole("button")).toHaveFocus();
});

it("keeps a later editable interaction focused when membership renders", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);
  await user.click(screen.getByRole("button"));
  await user.click(screen.getByRole("textbox"));
  await user.keyboard("keep focus");
  rerender(<Harness revision={project.revision + 1} />);
  expect(screen.getByRole("textbox")).toHaveFocus();
  expect(screen.getByRole("textbox")).toHaveValue("keep focus");
});

it("discards the pending focus request when the active project changes", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  const user = userEvent.setup();
  const { rerender } = render(<Harness />);
  await user.click(screen.getByRole("button"));
  rerender(<Harness id="other" revision={project.revision + 1} />);
  expect(screen.getByRole("button")).not.toHaveFocus();
});
