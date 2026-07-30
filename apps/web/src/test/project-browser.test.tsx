import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectBrowser } from "../components/ProjectBrowser";
import type { Entry, SelectionMode } from "../api/types";
import { molecularProject } from "./molecular-fixtures";

const actions = {
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onVisibility: vi.fn(),
  onLock: vi.fn(),
  onIsolate: vi.fn(),
  onGroup: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

function renderBrowser(element: ReactElement) {
  return render(<Tooltip.Provider>{element}</Tooltip.Provider>);
}

describe("project browser selection and discovery", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("searches, filters, sorts, and collapses grouped entries", async () => {
    const user = userEvent.setup();
    renderBrowser(<ProjectBrowser project={molecularProject()} {...actions} />);
    const listbox = screen.getByRole("listbox");

    expect(within(listbox).getAllByRole("option").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Receptor"),
      expect.stringContaining("Ligand"),
    ]);
    await user.selectOptions(screen.getByLabelText("Sort structures"), "atoms");
    expect(within(listbox).getAllByRole("option")[0]).toHaveTextContent("Receptor");
    await user.type(screen.getByPlaceholderText("Search structures"), "lig");
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    expect(within(listbox).getByRole("option")).toHaveTextContent("Ligand");
    await user.clear(screen.getByPlaceholderText("Search structures"));
    await user.selectOptions(screen.getByLabelText("Filter structure type"), "protein");
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Filter structure type"), "all");
    await user.click(screen.getByLabelText("Collapse Target"));
    expect(within(listbox).queryByRole("option", { name: /Receptor/ })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Expand Target"));
    expect(within(listbox).getByRole("option", { name: /Receptor/ })).toBeInTheDocument();
  });

  it("emits replace, additive, subtractive, and group multi-selection operations", () => {
    const onSelectEntries = vi.fn();
    renderBrowser(
      <ProjectBrowser
        project={molecularProject()}
        selectedEntryIds={new Set(["protein"])}
        onSelectEntries={onSelectEntries}
        {...actions}
      />,
    );
    const listbox = screen.getByRole("listbox");
    const receptor = within(listbox).getByRole("option", { name: /Receptor/ });
    const ligand = within(listbox).getByRole("option", { name: /Ligand/ });
    expect(receptor).toHaveAttribute("aria-selected", "true");
    fireEvent.click(receptor);
    fireEvent.click(ligand, { ctrlKey: true });
    fireEvent.click(ligand, { altKey: true });
    fireEvent.click(within(screen.getByText("Target").closest(".group-heading")!).getByText("Target"));

    const calls = onSelectEntries.mock.calls as [Entry[], SelectionMode][];
    expect(calls.map((call) => call[1])).toEqual([
      "replace",
      "add",
      "subtract",
      "replace",
    ]);
    expect(calls[3][0].map((entry) => entry.id)).toEqual(["protein"]);
  });
});
