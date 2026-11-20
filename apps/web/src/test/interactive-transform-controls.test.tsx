import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { afterEach, expect, it, vi } from "vitest";
import { MovementOverlay, MovementControls } from "../components/MovementOverlay";
import { useMovementSession, type MovementWorkflow } from "../coordinates/useMovementSession";
import { TransformPanel } from "../components/TransformPanel";
import { MovementSession } from "../coordinates/MovementSession";
import type { StructureProjection } from "../api/types";
import { molecularProject, proteinProjection } from "./molecular-fixtures";
import { canonicalSelection } from "../selection/selection";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
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
    return <><button type="button" onClick={() => workflow.start()}>Move selection</button>
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

it.each(["pointer", "keyboard"] as const)("retains a captured movement while a modal owns focus and Escape after %s activation", async activation => {
  const project = molecularProject();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
  let resolve!: (value: Map<string, StructureProjection>) => void;
  const pending = new Promise<Map<string, StructureProjection>>(yes => { resolve = yes; });
  const load = vi.fn(() => pending), beforeStart = vi.fn();
  const begin = vi.spyOn(MovementSession.prototype, "begin");
  const commit = vi.fn(() => Promise.resolve(project));
  const ports = { context: () => ({ project, selection }), rendered: () => selection.atoms, load, beforeStart, commit,
    refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn() };
  let latest!: MovementWorkflow;
  function Harness() {
    const { workflow } = useMovementSession(ports);
    latest = workflow;
    const [dialog, setDialog] = useState(true);
    return <>
      <Dialog.Root open={dialog} onOpenChange={setDialog}>
        <Dialog.Trigger asChild><button type="button">Inspector</button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Content aria-describedby={undefined}>
          <Dialog.Title>Inspector panel</Dialog.Title>
          <TransformPanel project={project} selection={selection} busy={workflow.state.phase !== "idle"} movement={workflow}
            onPreview={vi.fn(() => Promise.resolve())} onClearPreview={vi.fn()} onTransform={vi.fn(() => Promise.resolve())}
            onSuperpose={vi.fn(() => Promise.resolve(null))} />
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      {workflow.state.capture ? <><MovementOverlay movement={workflow} zoom={vi.fn()}
        view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /><MovementControls movement={workflow} zoom={vi.fn()} unavailableReason={null} view={() => ({ camera: { mode: "perspective", position: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], radius: 5 }, height: 400, fov: Math.PI / 4 })} /></> : null}
    </>;
  }
  const user = userEvent.setup(); render(<Harness />);
  const launcher = screen.getByRole("button", { name: /^Move selection$/ });
  if (activation === "pointer") await user.click(launcher);
  else { launcher.focus(); await user.keyboard("{Enter}"); }
  expect(latest.state.phase).toBe("loading");
  expect(launcher).toHaveAttribute("aria-disabled", "true");
  expect(launcher).not.toBeDisabled(); expect(launcher.tabIndex).toBe(0);
  expect(launcher).toHaveFocus();
  await user.click(launcher); await user.keyboard("{Enter} ");
  expect(latest.state.phase).toBe("loading");
  expect(beforeStart).toHaveBeenCalledOnce(); expect(begin).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce();
  await act(async () => { resolve(new Map([["protein", proteinProjection()]])); await pending; });
  expect(latest.state.phase).toBe("active");
  const capture = latest.state.capture;
  expect(capture?.selection).toEqual(selection);
  expect(screen.getByRole("region", { name: "Move selection controls", hidden: true })).toBeInTheDocument();
  expect(launcher).toHaveAttribute("aria-disabled", "true"); expect(launcher).not.toBeDisabled(); expect(launcher).toHaveFocus();
  act(() => {
    latest.setMode("translate"); latest.setSensitivity(2);
    latest.update({ ...latest.state.pose, translation: [1, 2, 3] });
  });
  const pose = latest.state.pose;
  await user.click(launcher); await user.keyboard("{Enter} ");
  expect(beforeStart).toHaveBeenCalledOnce(); expect(begin).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce();
  expect(latest.state.capture).toBe(capture); expect(latest.state.pose).toEqual(pose);
  expect(latest.mode).toBe("translate"); expect(latest.sensitivity).toBe(2); expect(commit).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Inspector$/ })).toHaveFocus();
  expect(screen.getByRole("region", { name: "Move selection controls" })).toBeInTheDocument();
  expect(latest.state.capture).toBe(capture); expect(latest.state.pose).toEqual(pose);
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
  await user.click(screen.getByRole("button", { name: "Step right" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "More movement tools" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Move selection controls" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Move selection controls" })).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
});

it("keeps a busy project's real movement launcher focusable without admitting pointer or keyboard starts", async () => {
  const project = molecularProject();
  const selection = canonicalSelection([{ structure_id: "protein", atom_id: 1 }]);
  const beforeStart = vi.fn(), load = vi.fn(() => Promise.resolve(new Map([["protein", proteinProjection()]])));
  const commit = vi.fn(() => Promise.resolve(project));
  let latest!: MovementWorkflow;
  function Harness() {
    const { workflow } = useMovementSession({ context: () => ({ project, selection }), rendered: () => selection.atoms,
      load, beforeStart, commit, refresh: () => Promise.resolve(project), accept: vi.fn(), notice: vi.fn() });
    latest = workflow;
    return <TransformPanel project={project} selection={selection} busy movement={workflow}
      onPreview={vi.fn(() => Promise.resolve())} onClearPreview={vi.fn()} onTransform={vi.fn(() => Promise.resolve())}
      onSuperpose={vi.fn(() => Promise.resolve(null))} />;
  }
  const user = userEvent.setup(); render(<Harness />);
  const launcher = screen.getByRole("button", { name: /^Move selection$/ });
  expect(launcher).toHaveAttribute("aria-disabled", "true"); expect(launcher).not.toBeDisabled(); expect(launcher.tabIndex).toBe(0);
  await user.click(launcher); expect(launcher).toHaveFocus(); await user.keyboard("{Enter} ");
  expect(latest.state.phase).toBe("idle"); expect(latest.state.capture).toBeNull();
  expect(beforeStart).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
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
    return <><button onClick={() => workflow.start()}>Launch</button><input aria-label="Other input" />
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
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
  expect(screen.getByRole("button", { name: "Close movement panel" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Movement help and scientific limits" }));
  const help = screen.getByRole("dialog", { name: "Movement help and scientific limits" });
  expect(screen.getByRole("button", { name: "Close movement panel" })).toHaveFocus();
  expect(help).toHaveTextContent("1 captured atoms · 0 hidden");
  expect(help).toHaveTextContent("movement may distort bonds or create clashes");
  expect(help).toHaveTextContent("Missing bond records do not establish safety");
  expect(help).toHaveTextContent("without minimization, chemistry repair or docking validation");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(controls).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Movement help and scientific limits" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Movement help and scientific limits" }));
  await user.click(screen.getByRole("button", { name: "More movement tools" }));
  expect(screen.getByRole("button", { name: "Close movement panel" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(controls).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "More movement tools" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel movement" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Transform selection" })).toHaveFocus());
});
