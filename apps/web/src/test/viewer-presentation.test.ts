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
