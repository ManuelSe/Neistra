import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MovementOverlay, MovementControls } from "../components/MovementOverlay";
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
      {workflow.state.capture ? <><MovementOverlay movement={workflow} zoom={zoom}
        view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /><MovementControls movement={workflow} zoom={zoom} unavailableReason={null} view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /></> : null}</>;
  }
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
  const launcher = screen.getByRole("button", { name: "Move selection" });
  await user.click(launcher);
  await waitFor(() => expect(screen.getByRole("group", { name: "Move selection canvas" })).toHaveFocus());
  await user.keyboard("{ArrowRight}{ArrowUp}");
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
  await user.click(screen.getByRole("button", { name: "Translate" }));
  await user.click(screen.getByRole("button", { name: "Step right" }));
  expect(commit).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "More movement tools" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Move selection controls" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Move selection controls" })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
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
      {workflow.state.capture ? <><MovementOverlay movement={workflow} zoom={vi.fn()}
        view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /><MovementControls movement={workflow} zoom={vi.fn()} unavailableReason={null} view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /></> : null}
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
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
  await user.click(screen.getByRole("button", { name: "Step right" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "More movement tools" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Move selection controls" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Move selection controls" })).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
});

it("retains one capture and pose across scoped Space and explicit view-toggle ownership", async () => {
  const project = molecularProject();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
  const load = vi.fn(() => Promise.resolve(new Map([["protein", proteinProjection()]])));
  const commit = vi.fn(() => Promise.resolve(project));
  const ports = { context: () => ({ project, selection }), rendered: () => selection.atoms, load, commit,
    refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn() };
  function Harness() {
    const { workflow } = useMovementSession(ports);
    const view = () => ({ camera: { mode: "perspective" as const, position: [0, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number], radius: 5 }, height: 400, fov: Math.PI / 4 });
    return <><button onClick={workflow.start}>Launch</button><input aria-label="Other input" />
      <output data-testid="ownership">{workflow.cameraNavigation ? "camera" : "transform"}</output>
      <output data-testid="pose">{JSON.stringify(workflow.state.pose)}</output>
      {workflow.state.capture ? <><MovementOverlay movement={workflow} view={view} zoom={vi.fn()} />
        <MovementControls movement={workflow} view={view} zoom={vi.fn()} unavailableReason={null} /></> : null}</>;
  }
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Launch" }));
  const canvas = await screen.findByRole("group", { name: "Move selection canvas" });
  await user.keyboard("{ArrowRight}");
  const pose = screen.getByTestId("pose").textContent;
  for (let i = 0; i < 3; i++) {
    canvas.focus(); await user.keyboard("[Space>]");
    expect(screen.getByTestId("ownership")).toHaveTextContent("camera");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("pose")).toHaveTextContent(pose);
    await user.keyboard("[/Space]");
    expect(screen.getByTestId("ownership")).toHaveTextContent("transform");
  }
  await user.click(screen.getByRole("button", { name: "Adjust view" }));
  canvas.focus(); await user.keyboard("[Space>][/Space]");
  expect(screen.getByTestId("ownership")).toHaveTextContent("camera");
  await user.click(screen.getByRole("button", { name: "Resume transform" }));
  await user.click(screen.getByRole("textbox", { name: "Other input" }));
  await user.keyboard(" ");
  expect(screen.getByRole("textbox")).toHaveValue(" ");
  expect(screen.getByTestId("ownership")).toHaveTextContent("transform");
  expect(screen.getByTestId("pose")).toHaveTextContent(pose);
  expect(load).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled();
});

it("keeps primary actions textless and exposes scientific help without hiding the transaction", async () => {
  const project = molecularProject();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
  function Harness() {
    const { workflow } = useMovementSession({
      context: () => ({ project, selection }), rendered: () => selection.atoms,
      load: () => Promise.resolve(new Map([["protein", proteinProjection()]])),
      commit: vi.fn(() => Promise.resolve(project)), refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn(),
    });
    return <div className="structure-viewer"><MovementControls movement={workflow} view={() => null} zoom={vi.fn()} unavailableReason={null} />
      {workflow.state.capture ? <MovementOverlay movement={workflow} view={() => null} zoom={vi.fn()} /> : null}</div>;
  }
  const user = userEvent.setup(); render(<Harness />);
  const launcher = screen.getByRole("button", { name: "Transform selection" });
  expect(launcher.textContent).toBe("");
  await user.hover(launcher);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Rotate and translate");
  await user.click(launcher);
  const controls = await screen.findByRole("region", { name: "Move selection controls" });
  for (const button of controls.querySelectorAll("button")) expect(button.textContent).toBe("");
  await user.click(screen.getByRole("button", { name: "Movement help and scientific limits" }));
  const help = screen.getByRole("dialog", { name: "Movement help and scientific limits" });
  expect(help).toHaveTextContent("1 captured atoms · 0 hidden");
  expect(help).toHaveTextContent("movement may distort bonds or create clashes");
  expect(help).toHaveTextContent("Missing bond records do not establish safety");
  expect(help).toHaveTextContent("without minimization, chemistry repair or docking validation");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(controls).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Movement help and scientific limits" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel movement" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Transform selection" })).toHaveFocus());
});
