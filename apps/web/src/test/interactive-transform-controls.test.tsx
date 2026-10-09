import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MovementOverlay } from "../components/MovementOverlay";
import { useMovementSession } from "../coordinates/useMovementSession";
import { molecularProject, proteinProjection } from "./molecular-fixtures";
import { canonicalSelection } from "../selection/selection";

afterEach(cleanup);
it("shares keyboard steps with one Apply and restores launcher focus after Cancel", async () => {
  const project = molecularProject();
  const projection = proteinProjection();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }, { structure_id: "protein", atom_id: 2 }]);
  const commit = vi.fn(() => Promise.resolve({ ...project, revision: project.revision + 1 }));
  const zoom = vi.fn();
  const ports = { context: () => ({ project, selection }), rendered: () => selection.atoms,
    load: () => Promise.resolve(new Map([["protein", projection]])), commit,
    refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn() };
  function Harness() {
    const { workflow } = useMovementSession(ports);
    return <><button type="button" onClick={workflow.start}>Move selection</button>
      {workflow.state.capture ? <MovementOverlay movement={workflow} zoom={zoom}
        view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /> : null}</>;
  }
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
  const launcher = screen.getByRole("button", { name: "Move selection" });
  await user.click(launcher);
  await waitFor(() => expect(screen.getByRole("group", { name: "Move selection canvas" })).toHaveFocus());
  await user.keyboard("{ArrowRight}{ArrowUp}");
  await user.click(screen.getByRole("button", { name: "Translate" }));
  await user.click(screen.getByRole("button", { name: "Step right" }));
  expect(commit).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Move selection controls" })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "Depth" }));
  await user.click(screen.getByRole("button", { name: "Step away" }));
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(zoom).toHaveBeenCalledExactlyOnceWith(0.85);
  await user.click(screen.getByRole("button", { name: "Apply movement" }));
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(commit.mock.calls[0]).toEqual([project, expect.objectContaining({ selection, translation: [0, 0, expect.any(Number)] })]);
});

it("retains a captured movement while a modal owns focus and Escape", async () => {
  const project = molecularProject();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
  const commit = vi.fn(() => Promise.resolve(project));
  const ports = { context: () => ({ project, selection }), rendered: () => selection.atoms,
    load: () => Promise.resolve(new Map([["protein", proteinProjection()]])), commit,
    refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn() };
  function Harness() {
    const { workflow } = useMovementSession(ports);
    const [dialog, setDialog] = useState(true);
    return <>
      {dialog ? <div role="dialog" aria-label="Inspector panel"
        onKeyDown={event => { if (event.key === "Escape") setDialog(false); }}>
        <button type="button" onClick={workflow.start}>Move selection</button>
      </div> : null}
      {workflow.state.capture ? <MovementOverlay movement={workflow} zoom={vi.fn()}
        view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /> : null}
    </>;
  }
  const user = userEvent.setup(); render(<Harness />);
  const launcher = screen.getByRole("button", { name: "Move selection" });
  await user.click(launcher);
  await screen.findByRole("region", { name: "Move selection controls" });
  expect(launcher).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Move selection controls" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Step right" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Move selection controls" })).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
});
