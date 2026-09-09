import { expect, it } from "vitest";
import { observeViewerAttribution } from "../viewer/domPresentation";

it("labels vendor attribution across DOM recreation and stops on disposal", async () => {
  const target = document.createElement("div");
  target.innerHTML = '<a class="msp-logo" href="https://molstar.org"></a>';
  const stop = observeViewerAttribution(target);
  expect(target.firstElementChild).toHaveAttribute("aria-label", "Mol* molecular viewer (opens in a new tab)");
  target.innerHTML = '<div><a class="msp-logo" href="https://molstar.org"></a></div>';
  await Promise.resolve();
  expect(target.querySelector("a")).toHaveAttribute("rel", "noopener noreferrer");
  expect(target.querySelector("a")).toHaveAttribute("aria-label");
  stop();
  target.innerHTML = '<a class="msp-logo"></a>';
  await Promise.resolve();
  expect(target.querySelector("a")).not.toHaveAttribute("aria-label");
});

it("labels only unlabelled vendor popup fields from their existing row label", async () => {
  const target = document.createElement("div");
  const stop = observeViewerAttribution(target);
  target.innerHTML = `<div class="msp-viewport-controls-panel">
    <div class="msp-control-row"><span class="msp-control-row-label">Background</span>
      <button class="msp-combined-color-button" style="background: rgb(23, 26, 31)"></button></div>
    <div class="msp-control-row"><span class="msp-control-row-label">Clipping</span>
      <div><input value="50"><input aria-label="Already named" value="25"></div></div>
    <input title="Preserved title"><input>
  </div><input value="Outside vendor popup">`;
  await Promise.resolve();
  expect(target.querySelector("button")).toHaveAttribute("aria-label", "Background");
  expect(target.querySelector("button")?.style.background).toBe("rgb(23, 26, 31)");
  const inputs = target.querySelectorAll("input");
  expect(inputs[0]).toHaveAttribute("aria-label", "Clipping");
  expect(inputs[0]).toHaveValue("50");
  expect(inputs[1]).toHaveAttribute("aria-label", "Already named");
  for (const input of [...inputs].slice(2)) expect(input).not.toHaveAttribute("aria-label");
  stop();
});
