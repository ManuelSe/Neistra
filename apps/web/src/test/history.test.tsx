import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoordinateTransform } from "../api/types";
import { TransformPanel } from "../components/TransformPanel";
import { molecularProject } from "./molecular-fixtures";

describe("coordinate command history boundary", () => {
  afterEach(cleanup);

  it("previews pointer movement and commits one command on gesture completion", async () => {
    const project = molecularProject();
    const onPreview = vi
      .fn<(transform: CoordinateTransform) => Promise<void>>()
      .mockResolvedValue(undefined);
    const onTransform = vi
      .fn<(transform: CoordinateTransform) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <TransformPanel
        project={project}
        selection={{
          schema_version: 1,
          atoms: [],
          granularity: "atom",
          source: "inspector",
        }}
        busy={false}
        onPreview={onPreview}
        onClearPreview={vi.fn()}
        onTransform={onTransform}
        onSuperpose={() => Promise.resolve(null)}
      />,
    );

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "1.4" } });
    fireEvent.change(slider, { target: { value: "2.1" } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(onTransform).toHaveBeenCalledOnce());
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onTransform.mock.calls[0][0]).toMatchObject({
      entry_id: "protein",
      scope: "structure",
      translation: [2.1, 0, 0],
      rotation_degrees: [0, 0, 0],
    });
  });

  it("disables coordinate mutation for a locked entry", () => {
    const project = molecularProject();
    project.entries[0] = { ...project.entries[0], locked: true };
    render(
      <TransformPanel
        project={project}
        selection={{
          schema_version: 1,
          atoms: [],
          granularity: "atom",
          source: "inspector",
        }}
        busy={false}
        onPreview={() => Promise.resolve()}
        onClearPreview={() => undefined}
        onTransform={() => Promise.resolve()}
        onSuperpose={() => Promise.resolve(null)}
      />,
    );

    expect(
      screen.getByText("Unlock Receptor before changing coordinates."),
    ).toBeVisible();
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply transform" })).toBeDisabled();
  });
});
