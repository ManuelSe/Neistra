import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

const properties = (page: Page) => page.getByRole("region", { name: "Properties", exact: true });
const value = (region: Locator, label: string) => region.locator(".ligand-properties-groups dt").filter({ hasText: new RegExp(`^${label}$`) })
  .locator("..").locator("dd");

async function inspect(page: Page, entryId: string) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) {
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
  }
  await openLigandInformation(page);
  await page.getByRole("region", { name: "Ligand of interest", exact: true })
    .getByRole("combobox", { name: "Entry", exact: true }).selectOption(entryId);
}


async function closeInspector(page: Page) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await drawer.isVisible()) {
    await drawer.getByRole("combobox", { name: "Entry", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`keeps an explicitly cancelled update cancelled through reopening until Retry (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    let release!: () => void, started!: () => void, settled!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const captured = new Promise<void>(resolve => { started = resolve; });
    const completedRoute = new Promise<void>(resolve => { settled = resolve; });
    let holdNext = true, submissions = 0;
    page.on("request", outgoing => {
      if (outgoing.method() === "PUT" && /\/ligand-properties\/consumers\/[^/]+$/.test(new URL(outgoing.url()).pathname)) submissions++;
    });
    await page.route(url => /\/ligand-properties\/consumers\/[^/]+$/.test(url.pathname), async route => {
      if (!holdNext || route.request().method() !== "PUT") { await route.continue(); return; }
      holdNext = false; started();
      try { await held; await route.continue(); } finally { settled(); }
    });
    try {
      const initial = await prepare(page, request, [{ name: "property-cancellation.smi", mimeType: "chemical/x-daylight-smiles",
        buffer: Buffer.from("CCO ethanol\n") }], `Property cancellation ${theme}`);
      const entry = initial.entries[0], base = `/api/v1/projects/${initial.id}`;
      const before = await (await request.get(base)).json() as Project;
      const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await toggle.count()) await toggle.click();
      await inspect(page, entry.id); await captured;
      const region = properties(page);
      const cancelled = page.waitForResponse(response => response.request().method() === "DELETE"
        && new URL(response.url()).pathname.startsWith(`${base}/ligand-properties/consumers/`));
      await region.getByRole("button", { name: "Cancel update", exact: true }).click();
      expect((await cancelled).ok()).toBe(true);
      await expect(region.getByRole("status")).toHaveText("Update cancelled No profile selected.");
      release(); await completedRoute;
      await closeInspector(page);
      await inspect(page, entry.id);
      await expect(region.getByRole("status")).toHaveText("Update cancelled No profile selected.");
      expect(submissions).toBe(1);
      expect(await (await request.get(base)).json()).toEqual(before);
      await region.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(value(region, "Carbon atoms")).toHaveText("2", { timeout: 30_000 });
      expect(submissions).toBe(2);
      expect(await (await request.get(base)).json()).toEqual(before);
      await page.screenshot({ path: info.outputPath(`property-cancellation-retry-${theme}.png`) });
    } finally { release(); }
  });

  test(`automatically calculates current ethanol properties without changing project state (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const initial = await prepare(page, request, [{ name: "property-ethanol.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Current properties ${theme}`);
    const entry = initial.entries[0], base = `/api/v1/projects/${initial.id}`;
    const read = async () => await (await request.get(base)).json() as Project;
    const original = await (await request.get(`${base}/entries/${entry.id}/original`)).body();
    const before = await read();
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await inspect(page, entry.id);
    const region = properties(page);
    await expect(value(region, "Heavy atoms")).toHaveText("3", { timeout: 30_000 });
    await expect(value(region, "Carbon atoms")).toHaveText("2");
    await expect(value(region, "Heteroatoms")).toHaveText("1");
    await expect(value(region, "Hydrogen bond donors")).toHaveText("1");
    await expect(value(region, "Hydrogen bond acceptors")).toHaveText("1");
    await expect(value(region, "Rotatable bonds")).toHaveText("0");
    await expect(value(region, "Topological polar surface area")).toContainText("20.23");
    expect(await read()).toEqual(before);
    expect(await (await request.get(`${base}/entries/${entry.id}/original`)).body()).toEqual(original);
    await page.reload();
    await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout: 30_000 });
    await inspect(page, entry.id);
    await expect(value(properties(page), "Carbon atoms")).toHaveText("2");
    expect(await read()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`current-properties-${theme}.png`) });
  });

  test(`retires old properties during an edit and restores exact Undo/Redo inputs (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const initial = await prepare(page, request, [{ name: "property-edit.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Property edit ${theme}`);
    const entry = initial.entries[0], base = `/api/v1/projects/${initial.id}`;
    const original = await (await request.get(`${base}/entries/${entry.id}/original`)).body();
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await inspect(page, entry.id);
    await expect(value(properties(page), "Carbon atoms")).toHaveText("2", { timeout: 30_000 });
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const captured = new Promise<void>(resolve => { started = resolve; });
    let holdNext = true;
    await page.route(url => url.pathname.startsWith(`${base}/ligand-properties/`), async route => {
      const outgoing = route.request();
      if (!holdNext || !["POST", "PUT"].includes(outgoing.method())) { await route.continue(); return; }
      const payload = outgoing.postDataJSON() as { entries?: { source_artifact_id: string }[] } | null;
      if (!payload?.entries?.some(source => source.source_artifact_id !== entry.current_artifact_id)) {
        await route.continue(); return;
      }
      holdNext = false; started(); await held; await route.continue();
    });
    try {
      await openInspectorTools(page);
      await page.getByRole("tab", { name: "selection", exact: true }).click();
      await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
      await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
      await page.getByRole("button", { name: "Apply query", exact: true }).click();
      await openLigandInformation(page);
      await closeInspector(page);
      await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit molecule", exact: true });
      await editor.getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
      await expect.poll(async () => (await (await request.get(`${base}/entries/${entry.id}/structure`)).json() as StructureProjection)
        .structure.atoms.find((atom: { id: number }) => atom.id === 1)!.element).toBe("N");
      // The active target updates automatically while the editor is still open;
      // reopening the inspector must not be what starts its property request.
      await captured;
      await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
      await inspect(page, entry.id);
      // The new request starts after the current-source render. Old ethanol
      // values must already be retired while the new demand is held.
      expect(await value(properties(page), "Carbon atoms").allTextContents()).not.toContain("2");
      release();
      await expect(value(properties(page), "Carbon atoms")).toHaveText("1", { timeout: 30_000 });
      await expect(value(properties(page), "Heteroatoms")).toHaveText("2");
      await closeInspector(page);
      await page.getByRole("button", { name: /^Undo:/ }).click();
      await inspect(page, entry.id);
      await expect(value(properties(page), "Carbon atoms")).toHaveText("2");
      await closeInspector(page);
      await page.getByRole("button", { name: /^Redo:/ }).click();
      await inspect(page, entry.id);
      await expect(value(properties(page), "Carbon atoms")).toHaveText("1", { timeout: 30_000 });
      expect(await (await request.get(`${base}/entries/${entry.id}/original`)).body()).toEqual(original);
      await page.screenshot({ path: info.outputPath(`current-properties-redo-${theme}.png`) });
    } finally { release(); }
  });
}
