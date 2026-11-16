import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { frameFixture, prepare } from "./interactions";
import { observe, selectPair } from "./modeling";

export async function prepareInformationProject(page: Page, request: APIRequestContext, label = "Viewer information", extraFixtures: string[] = []) {
  const project = await prepare(page, request, [{ name: "ordered-geometry.xyz", mimeType: "chemical/x-xyz",
    buffer: Buffer.from("4\nIndependent ordered geometry: distance3,angle90,torsion-45\nC 3 0 0\nN 0 0 0\nO 0 3 0\nF 3 3 3\n") },
  ...extraFixtures.map(path => ({ name: basename(path), mimeType: "application/octet-stream", buffer: readFileSync(path) }))], label);
  await frameFixture(page); await observe(page);
  return project;
}

export const setInformationSelection = selectPair;

export async function orderInformationTargets(page: Page, entryId: string, ids: number[]) {
  await page.getByRole("button", { name: /^(Order|Inspect) measurement targets$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Measurement targets", exact: true });
  for (const [index, id] of ids.entries()) await dialog.getByRole("combobox", {
    name: `Measurement target ${index + 1}${ids.length === 3 && index === 1 ? ", angle vertex" : ""}`, exact: true,
  }).selectOption(JSON.stringify([entryId, id]));
  await dialog.getByRole("button", { name: "Use order", exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function informationBounds(page: Page) {
  const bounds = await page.getByRole("region", { name: "Viewer information", exact: true }).evaluate(node => {
    const strip = node.getBoundingClientRect();
    const canvas = document.querySelector(".molstar-host canvas")!.getBoundingClientRect();
    const sequence = document.querySelector(".sequence-viewer")?.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, strip: { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom },
      canvasBottom: canvas.bottom, sequenceTop: sequence?.top ?? null };
  });
  expect(bounds.strip.left).toBeGreaterThanOrEqual(0);
  expect(bounds.strip.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.strip.top).toBeGreaterThanOrEqual(bounds.canvasBottom - 1);
  expect(bounds.strip.bottom).toBeLessThanOrEqual(bounds.height);
  if (bounds.sequenceTop !== null) expect(bounds.sequenceTop).toBeGreaterThanOrEqual(bounds.strip.bottom - 1);
  const dialog = page.locator(".viewer-info-dialog");
  if (await dialog.isVisible()) {
    const panel = (await dialog.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(bounds.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(bounds.height);
  }
  return bounds;
}
