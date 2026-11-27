import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import type { PropertyAggregate, PropertyRequest } from "../../apps/web/src/ligandProperties/types";
import { prepare } from "./support/interactions";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

interface Preferences { revision: number; enabled_categories: string[] }
interface PrimaryTouch {
  environment: { width: number; height: number; touchPoints: number; coarse: boolean };
  actions: { target: string; mode: "touch" | "hybrid touch/keyboard"; outcome: string;
    pointerdowns: { trusted: boolean; pointerType: string; intendedTarget: boolean }[];
    changes: { trusted: boolean; value: string | null }[] }[];
}
async function primaryTouch(page: Page, mobile: boolean): Promise<PrimaryTouch | undefined> {
  if (!mobile) return undefined;
  const environment = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
    touchPoints: navigator.maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches }));
  expect(environment.width).toBe(320); expect(environment.touchPoints).toBeGreaterThan(0); expect(environment.coarse).toBe(true);
  return { environment, actions: [] };
}
async function primaryAction(control: Locator, touch: PrimaryTouch | undefined, target: string, outcome: string,
  verify: () => Promise<void>, mode: "touch" | "hybrid touch/keyboard" = "touch") {
  if (!touch) { await control.click(); await verify(); return; }
  const events = await control.evaluateHandle(node => {
    const pointerdowns: PrimaryTouch["actions"][number]["pointerdowns"] = [];
    const changes: PrimaryTouch["actions"][number]["changes"] = [];
    const pointer = (event: Event) => {
      if (event instanceof PointerEvent) pointerdowns.push({ trusted: event.isTrusted, pointerType: event.pointerType,
        intendedTarget: event.target instanceof Node && node.contains(event.target) });
    };
    const change = (event: Event) => changes.push({ trusted: event.isTrusted,
      value: event.target instanceof HTMLSelectElement ? event.target.value : null });
    node.addEventListener("pointerdown", pointer); node.addEventListener("change", change);
    return { pointerdowns, changes, dispose: () => {
      node.removeEventListener("pointerdown", pointer); node.removeEventListener("change", change);
    } };
  });
  try {
    await control.tap();
    const pointerdowns = await events.evaluate(value => value.pointerdowns);
    expect(pointerdowns).toEqual([{ trusted: true, pointerType: "touch", intendedTarget: true }]);
    await verify();
    touch.actions.push({ target, outcome, mode, pointerdowns, changes: await events.evaluate(value => value.changes) });
  } finally { await events.evaluate(value => value.dispose()); await events.dispose(); }
}
async function primarySelect(control: Locator, value: string, touch: PrimaryTouch | undefined, target: string) {
  if (!touch) { await control.selectOption(value); return; }
  const optionIndex = () => control.evaluate((node, wanted) => Array.from((node as HTMLSelectElement).options)
    .findIndex(option => option.value === wanted), value);
  await expect.poll(optionIndex).toBeGreaterThanOrEqual(0);
  const index = await optionIndex(); expect(index).toBeGreaterThanOrEqual(0);
  await primaryAction(control, touch, target, `Native selection committed to ${value}`, async () => {
    // Actual touch activation plus keyboard commitment; no finger-only picker claim.
    await control.press("Home");
    for (let offset = 0; offset < index; offset++) await control.press("ArrowDown");
    await control.press("Enter"); await expect(control).toHaveValue(value);
  }, "hybrid touch/keyboard");
  expect(touch.actions.at(-1)!.changes.at(-1)).toEqual({ trusted: true, value });
}
const preferencesPath = "/api/v1/workspace/ligand-property-preferences";
const panel = (page: Page) => page.getByRole("region", { name: "Project inspector", exact: true });
const properties = (page: Page) => panel(page).getByRole("region", { name: "Properties", exact: true });
const entryChoice = (page: Page) => panel(page).getByRole("combobox", { name: "Entry", exact: true });
async function preferences(request: APIRequestContext) { return await (await request.get(preferencesPath)).json() as Preferences; }
async function saveCategories(request: APIRequestContext, categories: string[]) {
  const current = await preferences(request);
  const response = await request.put(preferencesPath, { data: { expected_revision: current.revision, enabled_categories: categories } });
  expect(response.ok()).toBe(true); return await response.json() as Preferences;
}
async function setTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await button.isVisible()) await button.click();
}
async function settledFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function compositor(page: Page, info: TestInfo, label: string) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const body = Buffer.from(data, "base64"); await info.attach(label, { contentType: "image/png", body });
    return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  } finally { await session.detach(); }
}
async function position(control: Locator) {
  return control.evaluate(node => {
    const bounds = node.getBoundingClientRect(), owner = node.closest(".inspector-scroll");
    if (!(owner instanceof HTMLElement)) throw new Error("An inspector scroll owner is required.");
    const viewport = owner.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
      viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom),
      viewportLeft: Math.max(0, viewport.left), viewportRight: Math.min(innerWidth, viewport.right),
      hit: hit === node || node.contains(hit), scrollTop: owner.scrollTop, horizontalOverflow: owner.scrollWidth > owner.clientWidth + 1 };
  });
}
function reachable(value: Awaited<ReturnType<typeof position>>) {
  expect(value.top).toBeGreaterThanOrEqual(value.viewportTop - 1); expect(value.bottom).toBeLessThanOrEqual(value.viewportBottom + 1);
  expect(value.left).toBeGreaterThanOrEqual(value.viewportLeft - 1); expect(value.right).toBeLessThanOrEqual(value.viewportRight + 1);
  expect(value.hit).toBe(true); expect(value.horizontalOverflow).toBe(false);
}

for (const theme of ["light", "dark"] as const) {
  test(`joins exact identity, shared depiction and profile comparison without changing display preferences (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    const previous = await preferences(request), hidden = await saveCategories(request, []);
    let completed = false;
    const draws: string[] = [], demands: string[] = [];
    page.on("request", outgoing => {
      const path = new URL(outgoing.url()).pathname;
      if (outgoing.method() === "GET" && path.endsWith("/depiction")) draws.push(path);
      if (["POST", "PUT"].includes(outgoing.method()) && /\/ligand-properties\/consumers(?:\/[^/]+)?$/.test(path)) demands.push(path);
    });
    try {
      const project = await prepare(page, request, [
        { name: "ethanol.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") },
        { name: "propanol.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCCO propanol\n") },
      ], `Ligand information ${theme}`);
      const first = project.entries[0], second = project.entries[1], endpoint = `/api/v1/projects/${project.id}`;
      const read = async () => await (await request.get(endpoint)).json() as Project;
      const originals = await Promise.all(project.entries.map(async entry => ({ id: entry.id,
        bytes: await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body() })));
      await setTheme(page, theme);
      const touch = await primaryTouch(page, info.project.name === "mobile-chromium");
      if (touch && !await panel(page).isVisible()) await primaryAction(page.getByRole("button", { name: "Inspector", exact: true }), touch,
        "Inspector", "Primary sidebar opened", async () => {
          await expect(page.getByRole("dialog", { name: "Inspector panel", exact: true })).toBeVisible();
        });
      await openLigandInformation(page);
      await expect(entryChoice(page)).toHaveValue("");
      await expect(panel(page).getByRole("tablist", { name: "Inspector views", exact: true })).toBeHidden();
      await primarySelect(entryChoice(page), first.id, touch, "Inspected entry: first");
      const identity = panel(page).getByRole("group", { name: "Designated ligand information", exact: true });
      await expect(identity).toContainText("C2H6O");
      await expect(identity.locator(".ligand-designated-composition > div").filter({ hasText: "Formal charge" }).locator("dd")).toHaveText("0");
      const current = await read(), designation = current.entries.find(entry => entry.id === first.id)!.ligand_designation;
      expect(designation.status).toBe("resolved"); await expect(identity).toContainText(designation.instance_id!);
      await expect(identity.locator("img")).toBeVisible();
      await expect.poll(() => identity.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const drawingsBefore = draws.length;
      const choices = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
      await primaryAction(panel(page).getByRole("button", { name: "Change", exact: true }), touch,
        "Change ligand", "Qualified chooser opened", async () => { await expect(choices).toBeVisible(); });
      await expect(choices.getByRole("radio")).toHaveCount(1);
      await expect(choices.locator("img")).toBeVisible();
      if (touch) await primaryAction(choices.getByRole("radio"), touch, "Qualified candidate",
        "Exact candidate selected in draft", async () => { await expect(choices.getByRole("radio")).toBeChecked(); });
      await primaryAction(choices.getByRole("button", { name: "Cancel", exact: true }), touch,
        "Cancel ligand choice", "Chooser closed without changing designation", async () => { await expect(choices).toBeHidden(); });
      expect(draws).toHaveLength(drawingsBefore);
      const profile = properties(page).getByRole("combobox", { name: "Profile", exact: true });
      await expect(profile).toHaveValue(""); expect(demands).toEqual([]);
      await expect(properties(page).getByText("Choose a profile to compare properties.")).toBeVisible();
      if (touch) {
        const options = properties(page).getByRole("button", { name: "Property options", exact: true });
        const dialog = page.getByRole("dialog", { name: "Property options", exact: true });
        await primaryAction(options, touch, "Property options", "Category draft opened", async () => { await expect(dialog).toBeVisible(); });
        const category = dialog.getByRole("checkbox").first(); await expect(category).not.toBeChecked();
        await primaryAction(category, touch, "Draft category", "Draft checkbox checked", async () => { await expect(category).toBeChecked(); });
        await primaryAction(dialog.getByRole("button", { name: "Cancel", exact: true }), touch,
          "Cancel categories", "Draft discarded and focus restored", async () => {
            await expect(dialog).toBeHidden(); await expect(options).toBeFocused(); expect(await preferences(request)).toEqual(hidden);
          });
        expect(demands).toEqual([]);
      }
      for (const [id, axes] of [["veber", 2], ["ro5", 4], ["ro5-veber", 6]] as const) {
        await primarySelect(profile, id, touch, `Profile: ${id}`);
        await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
        const comparison = properties(page).getByRole("region", { name: "Profile comparison", exact: true });
        await expect(comparison.locator(".comparison-point")).toHaveCount(axes);
        await expect(comparison.locator("polygon")).toHaveCount(axes === 2 ? 0 : 1);
        await comparison.getByText("Values and criteria", { exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(comparison.getByRole("table")).toBeVisible();
        await expect(comparison.locator("tbody tr")).toHaveCount(axes);
        await comparison.getByText("Values and criteria", { exact: true }).press("Enter");
        if (touch) {
          const details = comparison.locator(".comparison-table"), summary = details.locator("summary");
          await primaryAction(summary, touch, `Values and criteria: ${id}`, "Equivalent table opened", async () => {
            await expect(details).toHaveAttribute("open", ""); await expect(comparison.getByRole("table")).toBeVisible();
          });
          await primaryAction(summary, touch, `Close values and criteria: ${id}`, "Equivalent table collapsed", async () => {
            await expect(details).not.toHaveAttribute("open", "");
          });
        }
      }
      if (touch) for (const [selector, label] of [[".ligand-profile-details", "Criteria and sources"], [".ligand-property-methods", "Methods and limits"]] as const) {
        const details = properties(page).locator(selector), summary = details.locator("summary");
        await primaryAction(summary, touch, label, "Scientific explanation opened", async () => { await expect(details).toHaveAttribute("open", ""); });
        await primaryAction(summary, touch, `Close ${label}`, "Scientific explanation collapsed", async () => { await expect(details).not.toHaveAttribute("open", ""); });
      }
      const allocationsBefore = demands.length;
      await openInspectorTools(page);
      await expect(panel(page).getByRole("tablist", { name: "Inspector views", exact: true })).toBeVisible();
      await openLigandInformation(page); await expect(entryChoice(page)).toHaveValue(first.id);
      await expect(profile).toHaveValue("ro5-veber"); await settledFrames(page);
      expect(demands).toHaveLength(allocationsBefore); expect(draws).toHaveLength(drawingsBefore);
      await primarySelect(entryChoice(page), second.id, touch, "Inspected entry: second"); await expect(identity).toContainText("C3H8O");
      await primarySelect(entryChoice(page), first.id, touch, "Inspected entry: return first"); await expect(identity).toContainText("C2H6O");
      if (touch) await info.attach(`primary-sidebar-touch-${theme}`, { contentType: "application/json", body: JSON.stringify({ ...touch,
        limits: "Browser-emulated trusted touch with six hybrid select commitments; not physical-device or finger-only picker certification." }) });
      await expect(page.locator(".viewer-status")).toContainText("/ 0 selected");
      expect(await read()).toEqual(current); expect(await preferences(request)).toEqual(hidden);
      for (const original of originals) expect(await (await request.get(`${endpoint}/entries/${original.id}/original`)).body()).toEqual(original.bytes);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include(".project-inspector").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await compositor(page, info, `ligand-information-current-${theme}`); completed = true;
    } finally { if (completed) await saveCategories(request, previous.enabled_categories); }
  });

  test(`preserves the focused methods position when current profile and radar publish (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    const previous = await preferences(request), hidden = await saveCategories(request, []);
    let release!: () => void, capture!: () => void, delivery: { request: PropertyRequest; response: PropertyAggregate } | null = null;
    const held = new Promise<void>(resolve => { release = resolve; }), captured = new Promise<void>(resolve => { capture = resolve; });
    let endpoint = "", completed = false;
    await page.route(url => !!endpoint && url.pathname.startsWith(`${endpoint}/ligand-properties/`), async route => {
      if (!["POST", "PUT"].includes(route.request().method())) { await route.continue(); return; }
      const response = await route.fetch(), body = await response.json() as PropertyAggregate;
      const payload = body.entries ? route.request().postDataJSON() as PropertyRequest | null : null;
      const wanted = payload?.entries[0], ids = payload?.descriptor_ids ?? [];
      const ready = wanted && ids.length === 4 && body.entries?.find(entry => entry.status === "ready"
        && entry.source.entry_id === wanted.entry_id && entry.source.source_artifact_id === wanted.source_artifact_id
        && entry.source.instance_id === wanted.instance_id && entry.source.atom_ids.length === wanted.atom_ids.length
        && entry.source.atom_ids.every((id, index) => id === wanted.atom_ids[index])
        && ids.every(id => entry.report?.coverage.includes(id)));
      if (!delivery && ready) {
        delivery = { request: payload!, response: body };
        capture(); await held;
      }
      await route.fulfill({ response });
    });
    try {
      const project = await prepare(page, request, [{ name: "publication-ethanol.smi", mimeType: "chemical/x-daylight-smiles",
        buffer: Buffer.from("CCO ethanol\n") }], `Sidebar publication ${theme}`);
      endpoint = `/api/v1/projects/${project.id}`;
      const entry = project.entries[0], original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
      await setTheme(page, theme); await openLigandInformation(page); await entryChoice(page).selectOption(entry.id);
      await expect(panel(page).getByRole("group", { name: "Designated ligand information", exact: true }).locator("img")).toBeVisible();
      await properties(page).getByRole("combobox", { name: "Profile", exact: true }).selectOption("ro5"); await captured;
      await expect(properties(page).getByRole("status")).toHaveText("Updating properties… Updating profile…");
      const criteria = properties(page).locator(".ligand-profile-details"), methods = properties(page).locator(".ligand-property-methods");
      for (const details of [criteria, methods]) {
        const summary = details.locator("summary"); await summary.scrollIntoViewIfNeeded(); await summary.focus(); await page.keyboard.press("Enter");
        await expect(details).toHaveAttribute("open", "");
      }
      const control = methods.locator("summary"); await control.scrollIntoViewIfNeeded(); await control.focus(); await settledFrames(page);
      const handle = await control.elementHandle(), before = await position(control); reachable(before);
      const beforeCompositor = await compositor(page, info, `sidebar-before-publication-${theme}`);
      release();
      await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      await expect(properties(page).locator(".comparison-point")).toHaveCount(4); await settledFrames(page);
      expect(await handle!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
      const after = await position(control); reachable(after); expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
      const afterCompositor = await compositor(page, info, `sidebar-after-publication-${theme}`);
      const observed = delivery as { request: PropertyRequest; response: PropertyAggregate } | null;
      expect(observed).not.toBeNull();
      const source = observed!.request.entries[0], actual = (await (await request.get(endpoint)).json() as Project).entries[0];
      expect(source).toEqual({ entry_id: entry.id, source_artifact_id: actual.current_artifact_id,
        instance_id: actual.ligand_designation.instance_id, atom_ids: actual.ligand_designation.atom_ids });
      expect(observed!.request.descriptor_ids).toEqual(["molecular_weight", "hbd", "hba", "calculated_logp"]);
      for (const id of observed!.request.descriptor_ids) {
        const value = observed!.response.entries[0].report?.values.find(value => value.descriptor_id === id);
        expect(value?.status).toBe("ready"); expect(Number.isFinite(value?.value)).toBe(true);
      }
      expect(await preferences(request)).toEqual(hidden);
      expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
      await info.attach("actual-sidebar-publication", { contentType: "application/json", body: JSON.stringify({ theme,
        profile: info.project.name, before, after, beforeCompositor, afterCompositor, delivery: observed }) });
      completed = true;
    } finally { release(); if (completed) await saveCategories(request, previous.enabled_categories); }
  });
}
