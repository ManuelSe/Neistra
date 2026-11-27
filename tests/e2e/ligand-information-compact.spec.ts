import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import { prepared, configure, panel, coordinateEntries } from "./support/minimization";
import { openInspectorTools, openLigandInformation, browseComponents } from "./support/navigation";

const inspector = (page: Page) => page.getByRole("dialog", { name: "Inspector panel", exact: true });
async function activate(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const hit = await control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return target === node || node.contains(target);
  });
  expect(hit).toBe(true);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await control.tap(); else await control.click();
}
async function closeInspector(page: Page) {
  const drawer = inspector(page);
  await drawer.getByRole("button", { name: /^(Inspector tools|Ligand information)$/ }).focus();
  await page.keyboard.press("Escape"); await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeFocused();
}

for (const theme of ["light", "dark"] as const) test(`keeps compact drawer input above a retained minimization proposal (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  const project = await prepared(page, request), entry = project.entries[0];
  const endpoint = `/api/v1/projects/${project.id}`;
  const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await openInspectorTools(page);
  await inspector(page).getByRole("tab", { name: "selection", exact: true }).click();
  await inspector(page).getByRole("combobox", { name: "Select by", exact: true }).selectOption("structure");
  await inspector(page).getByRole("textbox", { name: "Value", exact: true }).fill(entry.id);
  await inspector(page).getByRole("button", { name: "Apply query", exact: true }).click();
  await expect(page.locator(".viewer-status")).toContainText(`/ ${entry.atom_count} selected`);
  await closeInspector(page);
  await configure(page);
  const minimization = panel(page);
  await minimization.getByRole("spinbutton", { name: "Minimization iterations", exact: true }).fill("1");
  await minimization.getByRole("button", { name: "Run minimization", exact: true }).click();
  await expect(minimization.getByRole("button", { name: "Accept unconverged coordinates", exact: true })).toBeEnabled({ timeout: 60_000 });
  await minimization.getByRole("checkbox", { name: "Show coordinate preview", exact: true }).check();
  await expect.poll(() => coordinateEntries(page)).toEqual([entry.id]);
  const before = await (await request.get(endpoint)).json() as Project;
  const focus: object[] = [];
  const preview = () => page.evaluate(async () => (await import("/src/minimization/store.ts")).useMinimizationStore.getState().preview);
  const capturedPreview = await preview(); expect(capturedPreview).not.toBeNull();
  try {
    await openLigandInformation(page);
    await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
    const properties = inspector(page).getByRole("region", { name: "Properties", exact: true });
    await properties.getByRole("combobox", { name: "Profile", exact: true }).selectOption("ro5-veber");
    await expect(properties.getByRole("status")).toHaveText("Preview — properties unavailable Preview — profile unavailable.");
    const summary = properties.locator(".comparison-table summary");
    await activate(page, summary); await expect(properties.locator(".comparison-table")).toHaveAttribute("open", "");
    await expect(properties.locator(".comparison-table tbody tr td > span:first-child")).toHaveText(Array(6).fill("Unavailable"));
    await info.attach(`compact-foreground-primary-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
    await activate(page, properties.getByRole("button", { name: "Property options", exact: true }));
    const options = page.getByRole("dialog", { name: "Property options", exact: true });
    await expect(options).toBeVisible();
    await options.evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
    await info.attach(`compact-foreground-options-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
    const optionControls = options.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
    const optionCount = await optionControls.count();
    for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < optionCount + 2; i++) {
      await page.keyboard.press(key);
      expect(await options.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape"); await expect(options).toBeHidden();
    await expect(inspector(page)).toBeVisible(); await expect.poll(() => coordinateEntries(page)).toEqual([entry.id]);
    // An aria-modal drawer must keep ordinary keyboard navigation in its foreground.
    const controls = inspector(page).locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [contenteditable="true"], [tabindex="0"]');
    const visible = [];
    for (const control of await controls.all()) if (await control.isVisible()) visible.push(control);
    expect(visible.length).toBeGreaterThan(0); await visible[0].focus();
    for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < visible.length + 1; i++) {
      await page.keyboard.press(key);
      const snapshot = await inspector(page).evaluate(node => ({ inside: node.contains(document.activeElement),
        active: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 80) }));
      focus.push({ key, ...snapshot }); expect(snapshot.inside).toBe(true);
    }
    const headerAction = inspector(page).getByRole("button", { name: "Inspector tools", exact: true });
    const methods = properties.locator(".ligand-property-methods summary");
    await methods.focus(); await page.keyboard.press("Tab"); await expect(headerAction).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(methods).toBeFocused();
    await openInspectorTools(page);
    await activate(page, inspector(page).getByRole("tab", { name: "selection", exact: true }));
    const tools = inspector(page).locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]');
    const toolControls = [];
    for (const control of await tools.all()) if (await control.isVisible() && await control.evaluate(node => node.tabIndex >= 0)) toolControls.push(control);
    await toolControls[0].focus();
    for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < toolControls.length + 1; i++) {
      await page.keyboard.press(key); expect(await inspector(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    expect(await preview()).toEqual(capturedPreview);
    await inspector(page).locator(".inspector-scroll").hover(); await page.mouse.wheel(0, 300);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await inspector(page).locator(".inspector-scroll").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await closeInspector(page); await expect(minimization).toBeVisible();
    await openInspectorTools(page);
    const resumedHeading = inspector(page).getByRole("heading", { name: "Selection", exact: true });
    await expect(resumedHeading).toBeVisible(); await expect(resumedHeading).toBeFocused();
    await info.attach(`compact-foreground-tools-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("Shift+Tab");
    expect(await inspector(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
    await closeInspector(page); await expect(minimization).toBeVisible();
    await expect.poll(() => coordinateEntries(page)).toEqual([entry.id]);
    for (const [name, label] of [["Project browser", "Project browser panel"], ["History", "History and jobs panel"]] as const) {
      await page.getByRole("button", { name, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: label, exact: true }); await expect(drawer).toBeVisible();
      await info.attach(`compact-foreground-${name}-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
      if (name === "Project browser") {
        await browseComponents(page, entry.name);
        const components = drawer.getByRole("heading", { name: "Components", exact: true });
        await expect(components).toBeFocused(); await page.keyboard.press("Shift+Tab");
        expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
      }
      const nodes = drawer.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]');
      const eligible = [];
      for (const node of await nodes.all()) if (await node.isVisible() && await node.evaluate(element => element.tabIndex >= 0)) eligible.push(node);
      await eligible[0].focus();
      for (const key of ["Tab", "Shift+Tab"]) for (let i = 0; i < eligible.length + 1; i++) {
        await page.keyboard.press(key); expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press("Escape"); await expect(drawer).toBeHidden();
      expect(await preview()).toEqual(capturedPreview);
      await expect.poll(() => coordinateEntries(page)).toEqual([entry.id]);
    }
    await openLigandInformation(page);
    const scrim = page.getByRole("button", { name: "Close panel", exact: true });
    const spot = await scrim.evaluate(node => {
      const tool = document.querySelector(".minimization-panel")!.getBoundingClientRect();
      const drawer = document.querySelector(".mobile-panel.inspector")!.getBoundingClientRect();
      const x = drawer.left / 2, y = tool.top + Math.min(tool.height / 2, 100);
      const target = document.elementFromPoint(x, y);
      return { x, y, hit: target === node || node.contains(target) };
    });
    expect(spot.hit).toBe(true);
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(spot.x, spot.y); else await page.mouse.click(spot.x, spot.y);
    await expect(inspector(page)).toBeHidden(); await expect(minimization).toBeVisible();
    await expect.poll(() => coordinateEntries(page)).toEqual([entry.id]);
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    expect(await preview()).toEqual(capturedPreview);
    await activate(page, minimization.getByRole("button", { name: "Discard", exact: true }));
    await expect(minimization).toBeHidden(); await expect.poll(() => coordinateEntries(page)).toEqual([]);
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
  } finally {
    await info.attach("compact-modal-focus-boundaries", { body: JSON.stringify(focus), contentType: "application/json" });
  }
});
