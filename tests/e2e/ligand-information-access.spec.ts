import { chromium, expect, test, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Project } from "../../apps/web/src/api/types";
import type { PropertyAggregate, PropertyPreferences, PropertyRequest, PropertySource } from "../../apps/web/src/ligandProperties/types";
import type { ProfileRegistry } from "../../apps/web/src/ligandProfiles/types";
import { parseProfileRegistry, profileConstraints } from "../../apps/web/src/ligandProfiles/validate";
import { prepare } from "./support/interactions";
import { openInspectorTools, openLigandInformation } from "./support/navigation";

interface ZoomAPI { tabs: { query(query: object): Promise<{ id: number; url?: string }[]>;
  setZoom(id: number, factor: number): Promise<void>; getZoom(id: number): Promise<number> } }
interface Delivery { path: string; method: string; request: PropertyRequest; response: PropertyAggregate }
interface Gate { source: PropertySource; ids: string[]; captured: Promise<void>; capture: () => void;
  held: Promise<void>; release: () => void; delivery: Delivery | null; delivered: boolean }
const inspector = (page: Page) => page.getByRole("region", { name: "Project inspector", exact: true });
const properties = (page: Page) => inspector(page).getByRole("region", { name: "Properties", exact: true });
const comparison = (page: Page) => properties(page).getByRole("region", { name: "Profile comparison", exact: true });
const preferencePath = "/api/v1/workspace/ligand-property-preferences";
function gateFor(source: PropertySource, ids: string[]): Gate {
  let release!: () => void, capture!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), captured = new Promise<void>(resolve => { capture = resolve; });
  return { source, ids, held, captured, release, capture, delivery: null, delivered: false };
}
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function geometry(control: Locator) {
  return control.evaluate(node => {
    const bounds = node.getBoundingClientRect(), owner = node.closest(".inspector-scroll");
    if (!(owner instanceof HTMLElement)) throw new Error("Expected one inspector scroll owner");
    const viewport = owner.getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
      viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom),
      viewportLeft: Math.max(0, viewport.left), viewportRight: Math.min(innerWidth, viewport.right),
      hit: hit === node || node.contains(hit), scrollTop: owner.scrollTop, scrollHeight: owner.scrollHeight,
      horizontalOverflow: owner.scrollWidth > owner.clientWidth + 1 };
  });
}
function reachable(bounds: Awaited<ReturnType<typeof geometry>>) {
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.viewportTop - 1); expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportBottom + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.viewportLeft - 1); expect(bounds.right).toBeLessThanOrEqual(bounds.viewportRight + 1);
  expect(bounds.hit).toBe(true); expect(bounds.horizontalOverflow).toBe(false);
}
function samePosition(before: Awaited<ReturnType<typeof geometry>>, after: Awaited<ReturnType<typeof geometry>>) {
  reachable(after);
  for (const key of ["top", "bottom", "left", "right"] as const) expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1);
}
async function compositor(page: Page, info: TestInfo, label: string) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const png = Buffer.from(data, "base64"); await info.attach(label, { contentType: "image/png", body: png });
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
  } finally { await cdp.detach(); }
}
async function expand(page: Page, details: Locator) {
  const summary = details.locator("summary"); await summary.scrollIntoViewIfNeeded(); await summary.focus();
  if (await details.getAttribute("open") === null) await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
}
async function setTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await button.isVisible()) await button.click(); await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
async function restore(request: APIRequestContext, original: PropertyPreferences) {
  const current = await (await request.get(preferencePath)).json() as PropertyPreferences;
  if (JSON.stringify(current.enabled_categories) !== JSON.stringify(original.enabled_categories)) {
    expect((await request.put(preferencePath, { data: { expected_revision: current.revision, enabled_categories: original.enabled_categories } })).ok()).toBe(true);
  }
}
async function captureComparison(page: Page, info: TestInfo, label: string, delivery: Delivery, registry: ProfileRegistry, profileId: string) {
  const definition = registry.profiles.find(item => item.id === profileId)!;
  const axes = registry.axes.filter(axis => definition.axis_ids.includes(axis.id) && definition.required_descriptor_ids.includes(axis.descriptor_id));
  const current = delivery.response.entries.find(item => item.source.entry_id === delivery.request.entries[0].entry_id)!;
  expect(current.status).toBe("ready"); expect(current.report).not.toBeNull();
  await expect(comparison(page).locator("svg > g")).toHaveCount(axes.length);
  const values = axes.map(axis => current.report!.values.find(value => value.descriptor_id === axis.descriptor_id)!);
  expect(values.every(item => item.status === "ready" && item.value !== null && Number.isFinite(item.value))).toBe(true);
  await expect(comparison(page).locator(".comparison-point")).toHaveCount(values.length);
  await expect(comparison(page).locator("polygon")).toHaveCount(values.length >= 3 ? 1 : 0);
  const plotted = await comparison(page).locator(".comparison-point").evaluateAll(nodes => nodes.map(node => ({
    x: Number(node.getAttribute("cx")), y: Number(node.getAttribute("cy")), clipped: node.getAttribute("data-clipped"),
  })));
  for (const [index, axis] of axes.entries()) {
    const raw = values[index].value!, scaled = Math.max(0, Math.min(1, (raw - axis.domain[0]) / (axis.domain[1] - axis.domain[0])));
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    expect(plotted[index].x).toBeCloseTo(120 + Math.cos(angle) * 78 * scaled, 6);
    expect(plotted[index].y).toBeCloseTo(120 + Math.sin(angle) * 78 * scaled, 6);
    expect(plotted[index].clipped).toBe(raw < axis.domain[0] ? "low" : raw > axis.domain[1] ? "high" : null);
  }
  const plot = comparison(page).getByRole("img", { name: "Current ligand profile comparison", exact: true });
  await plot.scrollIntoViewIfNeeded(); await frames(page); const plotBounds = await geometry(plot); reachable(plotBounds);
  const plotCapture = await compositor(page, info, `${label}-visible-radar`);
  const tableDetails = comparison(page).locator(".comparison-table"); await expand(page, tableDetails);
  const table = tableDetails.getByRole("table"); await expect(table).toBeVisible(); await expect(table.locator("tbody tr")).toHaveCount(axes.length);
  const operators = { lt: "<", le: "≤", gt: ">", ge: "≥" };
  for (const axis of axes) {
    const descriptor = registry.descriptors.find(item => item.id === axis.descriptor_id)!;
    const actual = current.report!.values.find(item => item.descriptor_id === descriptor.id)!;
    const row = table.locator(`tr[data-descriptor="${descriptor.id}"]`);
    await expect(row.locator("td > span").first()).toHaveText(`${actual.value}${descriptor.unit ? ` ${descriptor.unit}` : ""}`);
    for (const criterion of profileConstraints(registry, profileId).filter(item => item.descriptor_id === descriptor.id)) {
      await expect(row).toContainText(`${operators[criterion.operator]} ${criterion.limit}${descriptor.unit ? ` ${descriptor.unit}` : ""} · Met`);
    }
  }
  const first = table.locator("tbody tr").first(), last = table.locator("tbody tr").last();
  await first.scrollIntoViewIfNeeded(); await frames(page); const firstBounds = await geometry(first); reachable(firstBounds);
  const firstCapture = await compositor(page, info, `${label}-open-table-first`);
  await last.scrollIntoViewIfNeeded(); await frames(page); const lastBounds = await geometry(last); reachable(lastBounds);
  const lastCapture = await compositor(page, info, `${label}-open-table-last`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return { profileId, axes, values, plotted, plotBounds, firstBounds, lastBounds,
    captures: { plotCapture, firstCapture, lastCapture }, layout: await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      dpr: devicePixelRatio, visualScale: visualViewport?.scale, touchPoints: navigator.maxTouchPoints, coarse: matchMedia("(any-pointer: coarse)").matches })) };
}

for (const theme of ["light", "dark"] as const) test(`keeps the primary publication anchor and visible radar/table accessible at actual100/200% and320px (${theme})`, async ({ page: runnerPage, request, baseURL }, info) => {
  test.setTimeout(120_000);
  const originalPreferences = await (await request.get(preferencePath)).json() as PropertyPreferences;
  const hiddenResponse = await request.put(preferencePath, { data: { expected_revision: originalPreferences.revision, enabled_categories: [] } });
  expect(hiddenResponse.ok()).toBe(true); const hiddenPreferences = await hiddenResponse.json() as PropertyPreferences;
  const extension = resolve("tests/e2e/support/zoom-extension"), directory = await mkdtemp(join(tmpdir(), "neistra-sidebar-access-"));
  const context = await chromium.launchPersistentContext(directory, {
    channel: "chromium", headless: true, viewport: null, deviceScaleFactor: undefined, isMobile: false, hasTouch: false, baseURL,
    args: ["--window-size=1440,1000", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const gates: Gate[] = []; let gate: Gate | null = null;
  try {
    const page = context.pages()[0], worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    let endpoint = "";
    await page.route(url => !!endpoint && url.pathname.startsWith(`${endpoint}/ligand-properties/`), async route => {
      const method = route.request().method();
      if (!["POST", "PUT"].includes(method)) { await route.continue(); return; }
      const response = await route.fetch();
      if (!response.ok()) { await route.fulfill({ response }); return; }
      const body = await response.json() as PropertyAggregate, current = gate;
      const payload = body.entries ? route.request().postDataJSON() as PropertyRequest | null : null;
      const wanted = payload?.entries?.[0];
      const exact = wanted && current && JSON.stringify(wanted) === JSON.stringify(current.source)
        && current.ids.every(id => payload.descriptor_ids.includes(id));
      const ready = exact && body.entries?.find(item => item.status === "ready" && item.report
        && JSON.stringify(item.source) === JSON.stringify(current.source) && current.ids.every(id => item.report!.coverage.includes(id)));
      if (current && !current.delivery && ready) {
        current.delivery = { path: new URL(route.request().url()).pathname, method, request: payload, response: body };
        current.capture(); await current.held;
      }
      await route.fulfill({ response }); if (current?.delivery?.response === body) current.delivered = true;
    });
    const project = await prepare(page, request, Array.from({ length: 4 }, (_, index) => ({ name: `sidebar-access-${index}.smi`,
      mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") })), `Primary access ${theme}`);
    endpoint = `/api/v1/projects/${project.id}`;
    const before = await (await request.get(endpoint)).json() as Project;
    const originals = await Promise.all(project.entries.map(async entry => ({ id: entry.id, body: await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body() })));
    const registry = parseProfileRegistry(await (await request.get("/api/v1/ligand-profiles/registry")).json());
    await setTheme(page, theme); const evidence: unknown[] = [];
    for (const [zoomIndex, factor] of [1, 2].entries()) {
      const actualZoom = await worker.evaluate(async ({ url, factor }) => {
        const chrome = (globalThis as unknown as { chrome: ZoomAPI }).chrome;
        const tab = (await chrome.tabs.query({})).find(item => item.url === url);
        if (!tab) throw new Error("Current application tab missing for actual browser zoom");
        await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id);
      }, { url: page.url(), factor });
      expect(actualZoom).toBe(factor); await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(factor);
      expect(await page.evaluate(() => ({ touch: navigator.maxTouchPoints, coarse: matchMedia("(any-pointer: coarse)").matches }))).toEqual({ touch: 0, coarse: false });
      const entry = project.entries[zoomIndex * 2], source = { entry_id: entry.id, source_artifact_id: entry.current_artifact_id!,
        instance_id: entry.ligand_designation.instance_id!, atom_ids: entry.ligand_designation.atom_ids };
      const ids = ["molecular_weight", "hbd", "hba", "calculated_logp"];
      gate = gateFor(source, ids); gates.push(gate); const currentGate = gate;
      await openLigandInformation(page); await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
      await properties(page).getByRole("combobox", { name: "Profile", exact: true }).selectOption("ro5"); await currentGate.captured;
      await expect(properties(page).getByRole("status")).toHaveText("Updating properties… Updating profile…");
      const methods = properties(page).locator(".ligand-property-methods"), criteria = properties(page).locator(".ligand-profile-details");
      await expand(page, criteria); await expand(page, methods);
      const control = methods.locator("summary"); await control.scrollIntoViewIfNeeded(); await control.focus(); await frames(page);
      const handle = await control.elementHandle(), boundsBefore = await geometry(control); reachable(boundsBefore);
      const beforeCapture = await compositor(page, info, `primary-methods-before-${theme}-${factor * 100}`);
      currentGate.release();
      await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      await frames(page);
      // Read without scrolling or focusing after publication; user task ownership must survive on its own.
      expect(await handle!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
      const boundsAfter = await geometry(control); samePosition(boundsBefore, boundsAfter);
      expect(boundsAfter.scrollHeight).not.toBe(boundsBefore.scrollHeight);
      const afterCapture = await compositor(page, info, `primary-methods-after-${theme}-${factor * 100}`);
      const primaryComparison = await captureComparison(page, info, `primary-${theme}-${factor * 100}`, currentGate.delivery!, registry, "ro5");
      expect(primaryComparison.axes).toHaveLength(4);
      const next = project.entries[zoomIndex * 2 + 1];
      gate = gateFor({ entry_id: next.id, source_artifact_id: next.current_artifact_id!, instance_id: next.ligand_designation.instance_id!, atom_ids: next.ligand_designation.atom_ids },
        ["molecular_weight", "hbd", "hba", "calculated_logp", "tpsa", "rotatable_bond_count"]);
      gates.push(gate); const toolsGate = gate;
      await inspector(page).getByRole("combobox", { name: "Entry", exact: true }).selectOption(next.id);
      await properties(page).getByRole("combobox", { name: "Profile", exact: true }).selectOption("ro5-veber"); await toolsGate.captured;
      await openInspectorTools(page); await inspector(page).getByRole("tab", { name: "selection", exact: true }).click();
      const selection = inspector(page).getByRole("tabpanel", { name: "selection", exact: true });
      await selection.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
      const draft = selection.getByRole("textbox", { name: "Value", exact: true }); await draft.fill(`${next.id}:1`);
      await draft.scrollIntoViewIfNeeded(); await draft.click(); await frames(page);
      const draftHandle = await draft.elementHandle(), draftBefore = await geometry(draft); reachable(draftBefore);
      const draftBeforeCapture = await compositor(page, info, `retained-tools-before-${theme}-${factor * 100}`);
      toolsGate.release(); await expect.poll(() => toolsGate.delivered, { timeout: 30_000 }).toBe(true); await frames(page);
      expect(await draftHandle!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
      await expect(draft).toHaveValue(`${next.id}:1`); const draftAfter = await geometry(draft); samePosition(draftBefore, draftAfter);
      const draftAfterCapture = await compositor(page, info, `retained-tools-after-${theme}-${factor * 100}`);
      await selection.getByRole("button", { name: "Apply query", exact: true }).click(); await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
      await openLigandInformation(page); await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.");
      const sixComparison = await captureComparison(page, info, `combined-${theme}-${factor * 100}`, toolsGate.delivery!, registry, "ro5-veber");
      expect(sixComparison.axes).toHaveLength(6);
      evidence.push({ theme, actualContext: "persistent desktop Chromium", runnerProject: info.project.name, factor, actualZoom,
        boundsBefore, boundsAfter, draftBefore, draftAfter, beforeCapture, afterCapture, draftBeforeCapture, draftAfterCapture,
        primaryComparison, sixComparison, primaryReady: currentGate.delivery, hiddenPresenterReady: toolsGate.delivery });
      const sheet = page.getByRole("dialog", { name: "Inspector panel", exact: true });
      if (await sheet.isVisible()) { await sheet.focus(); await page.keyboard.press("Escape"); await expect(sheet).toBeHidden(); }
    }
    // This 320px geometry check uses the runner context; actual touch input is qualified separately in the primary sidebar workflow.
    await runnerPage.setViewportSize({ width: 320, height: 700 }); await runnerPage.goto("/");
    await runnerPage.getByRole("button", { name: "Projects", exact: true }).click();
    await runnerPage.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
    await setTheme(runnerPage, theme); await openLigandInformation(runnerPage);
    const last = project.entries.at(-1)!;
    await inspector(runnerPage).getByRole("combobox", { name: "Entry", exact: true }).selectOption(last.id);
    await properties(runnerPage).getByRole("combobox", { name: "Profile", exact: true }).selectOption("ro5-veber");
    await expect(properties(runnerPage).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
    const mobileComparison = await captureComparison(runnerPage, info, `runner-${theme}-320px`, gates.at(-1)!.delivery!, registry, "ro5-veber");
    expect(mobileComparison.layout.width).toBe(320); evidence.push({ runnerProject: info.project.name, mobileComparison });
    expect(await (await request.get(endpoint)).json()).toEqual(before);
    for (const original of originals) expect(await (await request.get(`${endpoint}/entries/${original.id}/original`)).body()).toEqual(original.body);
    expect(await (await request.get(preferencePath)).json()).toEqual(hiddenPreferences);
    await info.attach("primary-visible-access-and-publication-evidence", { contentType: "application/json", body: JSON.stringify(evidence) });
  } finally { gates.forEach(item => item.release()); await context.close(); await rm(directory, { recursive: true, force: true }); await restore(request, originalPreferences); }
});

test("keeps both Inspector header actions reachable at the actual minimum desktop panel size", async ({ browser, request, baseURL }, info) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const page = await context.newPage(), records = [];
  try {
    const project = await prepare(page, request, [{ name: "header-access.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], "Minimum Inspector header");
    const endpoint = `/api/v1/projects/${project.id}`;
    const before = await (await request.get(endpoint)).json() as Project;
    const entry = before.entries[0], original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const panel = page.locator('[data-panel-id="inspector-panel"]');
    const separator = page.getByRole("separator", { name: "Resize inspector", exact: true });
    await expect(panel).toHaveAttribute("data-panel-size", "22.0");
    // The real divider's ordinary 10-point keyboard step clamps22 to the expanded
    // minimum17. Do not inject saved layouts or substitute fixed-width markup.
    await separator.focus(); await page.keyboard.press("ArrowRight");
    await expect(panel).toHaveAttribute("data-panel-size", "17.0");
    const bounds = async (control: Locator) => control.evaluate(node => {
      const rect = node.getBoundingClientRect(), section = node.closest(".project-inspector")!;
      const owner = section.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const style = getComputedStyle(node);
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        ownerLeft: Math.max(0, owner.left), ownerRight: Math.min(innerWidth, owner.right),
        ownerTop: Math.max(0, owner.top), ownerBottom: Math.min(innerHeight, owner.bottom),
        hit: hit === node || node.contains(hit), focused: document.activeElement === node,
        outline: { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor } };
    });
    const reachableHeader = (value: Awaited<ReturnType<typeof bounds>>) => {
      expect(value.width).toBeGreaterThanOrEqual(44); expect(value.height).toBeGreaterThanOrEqual(44);
      expect(value.left).toBeGreaterThanOrEqual(value.ownerLeft); expect(value.right).toBeLessThanOrEqual(value.ownerRight);
      expect(value.top).toBeGreaterThanOrEqual(value.ownerTop); expect(value.bottom).toBeLessThanOrEqual(value.ownerBottom);
      expect(value.hit).toBe(true);
    };
    for (const width of [841, 900, 1000, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeHidden();
      await expect(panel).toHaveAttribute("data-panel-size", "17.0");
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        for (const view of ["ligand", "tools"] as const) {
          if (view === "ligand") await openLigandInformation(page); else await openInspectorTools(page);
          const frame = inspector(page), heading = view === "ligand" ? "Ligand information" : "Selection";
          await expect(frame.getByRole("heading", { name: heading, exact: true })).toBeVisible();
          const first = frame.getByRole("button", { name: view === "ligand" ? "Inspector tools" : "Ligand information", exact: true });
          const collapse = frame.getByRole("button", { name: "Collapse inspector", exact: true });
          const initial = [await bounds(first), await bounds(collapse)]; initial.forEach(reachableHeader);
          await separator.focus(); await page.keyboard.press("Tab"); await expect(first).toBeFocused();
          const firstFocus = await bounds(first); reachableHeader(firstFocus);
          expect(firstFocus.outline.style).not.toBe("none"); expect(parseFloat(firstFocus.outline.width)).toBeGreaterThan(0);
          await page.keyboard.press("Enter");
          await expect(frame.getByRole("heading", { name: view === "ligand" ? "Selection" : "Ligand information", exact: true })).toBeVisible();
          await page.keyboard.press("Tab"); await expect(collapse).toBeFocused();
          const collapseFocus = await bounds(collapse); reachableHeader(collapseFocus);
          expect(collapseFocus.outline.style).not.toBe("none"); expect(parseFloat(collapseFocus.outline.width)).toBeGreaterThan(0);
          await compositor(page, info, `minimum-header-${width}-${theme}-${view}`);
          await page.keyboard.press("Enter"); await expect(frame).toBeHidden();
          const expand = page.getByRole("button", { name: "Expand inspector", exact: true }); await expect(expand).toBeVisible();
          await expand.focus(); await page.keyboard.press("Enter"); await expect(frame).toBeVisible();
          await expect(panel).toHaveAttribute("data-panel-size", "17.0");
          records.push({ width, theme, startingView: view, panelSize: await panel.getAttribute("data-panel-size"),
            initial, firstFocus, collapseFocus, context: "Actual desktop context and native App divider, both runner projects" });
        }
      }
    }
    expect(records).toHaveLength(16);
    const after = await (await request.get(endpoint)).json() as Project;
    expect(after.revision).toBe(before.revision);
    expect(after.entries.map(item => ({ id: item.id, current: item.current_artifact_id, designation: item.ligand_designation })))
      .toEqual(before.entries.map(item => ({ id: item.id, current: item.current_artifact_id, designation: item.ligand_designation })));
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
    await info.attach("actual-minimum-inspector-header", { contentType: "application/json", body: JSON.stringify(records) });
  } finally { await context.close(); }
});
