import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NewMoleculeDialog } from "../components/NewMoleculeDialog";

afterEach(cleanup);

it("creates the visible carbon/zero defaults and supports an explicitly unknown charge", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<Tooltip.Provider><NewMoleculeDialog open onOpenChange={vi.fn()} onCreate={onCreate} /></Tooltip.Provider>);
  expect(screen.getByLabelText("First element", { exact: true })).toHaveValue("C");
  expect(screen.getByLabelText("First formal charge", { exact: true })).toHaveValue(0);
  await user.click(screen.getByRole("button", { name: "Create molecule" }));
  expect(onCreate).toHaveBeenLastCalledWith({ name: "New molecule", element: "C", charge: 0 }, expect.any(Function));
  await user.click(screen.getByLabelText("Charge unknown", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Create molecule" }));
  expect(onCreate).toHaveBeenLastCalledWith({ name: "New molecule", element: "C", charge: null }, expect.any(Function));
});

it("invalidates response ownership when closing a pending creation", async () => {
  let owns!: () => boolean;
  const onCreate = vi.fn((_input, ownership: () => boolean) => { owns = ownership; return new Promise<void>(() => undefined); });
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(<Tooltip.Provider><NewMoleculeDialog open onOpenChange={onOpenChange} onCreate={onCreate} /></Tooltip.Provider>);
  await user.click(screen.getByRole("button", { name: "Create molecule" }));
  expect(owns()).toBe(true);
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(owns()).toBe(false);
});
