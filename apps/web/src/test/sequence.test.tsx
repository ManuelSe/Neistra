import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Selection, SelectionMode } from "../api/types";
import { ProjectInspector } from "../components/ProjectInspector";
import { combineSelection, emptySelection } from "../selection/selection";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function Harness() {
  const [selection, setSelection] = useState<Selection>(emptySelection());
  return (
    <ProjectInspector
      project={molecularProject()}
      selection={selection}
      busy={false}
      onApply={() => undefined}
      onApplySelection={(operand, mode: SelectionMode) =>
        setSelection((current) => combineSelection(current, operand, mode))
      }
      onClearSelection={() => setSelection(emptySelection())}
      onExpandSelection={() => undefined}
      onInvertSelection={() => undefined}
      onPredicateSelection={() => undefined}
      onSpatialSelection={() => undefined}
      onSaveSelection={() => undefined}
      onLoadSelection={() => undefined}
      onDeleteSelection={() => undefined}
    />
  );
}

describe("bidirectional sequence selection", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("turns sequence residue clicks into the common selection and reflects them in summary", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const projection =
        url.includes("/protein/") ? proteinProjection() : {
          ...proteinProjection(),
          entry_id: "ligand",
          structure: {
            ...proteinProjection().structure,
            structure_type: "ligand" as const,
            chains: [],
            residues: [],
            atoms: [],
          },
        };
      return Promise.resolve(
        new Response(JSON.stringify(projection), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Harness />, { wrapper: wrapper(client) });

    await user.click(screen.getByRole("tab", { name: "sequence" }));
    const residue = await screen.findByRole("button", { name: /GLY 10/ });
    await user.click(residue);
    expect(residue).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("tab", { name: "selection" }));
    await waitFor(() => {
      const summary = screen.getByLabelText("Current selection summary");
      expect(summary).toHaveTextContent("Atoms2");
      expect(summary).toHaveTextContent("Residues1");
      expect(summary).toHaveTextContent("Chains1");
      expect(summary).toHaveTextContent("Structures1");
    });
  });
});
