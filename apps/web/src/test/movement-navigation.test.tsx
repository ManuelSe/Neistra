import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useMovementNavigation } from "../coordinates/useMovementNavigation";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("clears stale navigation for focus, blur, visibility, modal and phase interruptions", async () => {
  function Harness() {
    const [active, setActive] = useState(true);
    const [modal, setModal] = useState(false);
    const navigation = useMovementNavigation(active);
    return <><div data-movement-canvas="true" tabIndex={0} role="group" aria-label="Canvas" />
      <input aria-label="Field" /><button onClick={navigation.toggleView}>Toggle view</button>
      <button onClick={() => setActive(false)}>Submit</button>
      <button onClick={() => setModal(true)}>Open modal</button>
      {modal ? <div role="dialog" aria-label="Modal"><button>Modal action</button></div> : null}
      <output data-testid="owner">{navigation.cameraNavigation ? "camera" : "transform"}</output>
      <output data-testid="epoch">{navigation.inputEpoch}</output></>;
  }
  const user = userEvent.setup(); render(<Harness />);
  const canvas = screen.getByRole("group", { name: "Canvas" });
  canvas.focus(); await user.keyboard("{Shift>}[Space>][/Space]{/Shift}");
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
  await user.keyboard("[Space>]");
  expect(screen.getByTestId("owner")).toHaveTextContent("camera");
  await user.click(screen.getByRole("textbox"));
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
  await user.keyboard("[/Space]");
  await user.click(screen.getByRole("button", { name: "Toggle view" }));
  fireEvent(window, new Event("blur"));
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
  expect(Number(screen.getByTestId("epoch").textContent)).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Toggle view" }));
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
  vi.restoreAllMocks();
  await user.click(screen.getByRole("button", { name: "Toggle view" }));
  await user.click(screen.getByRole("button", { name: "Open modal" }));
  await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("transform"));
  canvas.focus(); await user.keyboard("[Space>][/Space]");
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  canvas.focus(); await user.keyboard("[Space>][/Space]");
  expect(screen.getByTestId("owner")).toHaveTextContent("transform");
});
