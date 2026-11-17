import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../apps/web/src/api/types";
import type { ProfileRegistry } from "../../apps/web/src/ligandProfiles/types";
import { prepare } from "./support/interactions";

interface Preferences { revision: number; enabled_categories: string[]; default_categories: string[] }
const preferencePath = "/api/v1/workspace/ligand-property-preferences";

async function inspect(page: Page, entryId: string) {
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) {
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
  }
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
  test(`evaluates profiles with hidden categories, cancellation and inspectable sources (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const mobile = info.project.name === "mobile-chromium";
    if (mobile) await page.setViewportSize({ width: 320, height: 700 });
    const originalPreferences = await (await request.get(preferencePath)).json() as Preferences;
    const hiddenResponse = await request.put(preferencePath, {
      data: { expected_revision: originalPreferences.revision, enabled_categories: [] },
    });
    expect(hiddenResponse.ok()).toBe(true);
    const hiddenPreferences = await hiddenResponse.json() as Preferences;
    const registry = await (await request.get("/api/v1/ligand-profiles/registry")).json() as ProfileRegistry;
    expect(registry.profiles.filter(profile => profile.availability === "available")).toHaveLength(7);
    const unavailable = registry.profiles.find(profile => profile.id === "cns-mpo")!;
    expect(unavailable.required_descriptor_ids).toEqual([]);
    let release!: () => void, capture!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const captured = new Promise<void>(resolve => { capture = resolve; });
    const demands: { descriptor_ids: string[] }[] = [];
    let allocations = 0, holdNext = true, completed = false;
    page.on("request", outgoing => {
      if (outgoing.method() === "POST" && /\/ligand-properties\/consumers$/.test(new URL(outgoing.url()).pathname)) allocations++;
    });
    await page.route(url => /\/ligand-properties\/consumers\/[^/]+$/.test(url.pathname), async route => {
      if (route.request().method() !== "PUT") { await route.continue(); return; }
      demands.push(route.request().postDataJSON() as { descriptor_ids: string[] });
      if (holdNext) { holdNext = false; capture(); await held; }
      await route.continue();
    });
    try {
      const project = await prepare(page, request, [{ name: "profile-ethanol.smi", mimeType: "chemical/x-daylight-smiles",
        buffer: Buffer.from("CCO ethanol\n") }], `Profile dependent demand ${theme}`);
      const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
      const before = await (await request.get(endpoint)).json() as Project;
      const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
      const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
      if (await toggle.count()) await toggle.click();
      if (mobile) await page.getByRole("button", { name: "Inspector", exact: true }).click();
      await page.getByRole("region", { name: "Ligand of interest", exact: true })
        .getByRole("combobox", { name: "Entry", exact: true }).selectOption(entry.id);
      const properties = page.getByRole("region", { name: "Properties", exact: true });
      const choice = properties.getByRole("combobox", { name: "Profile", exact: true });
      await expect(choice.locator('option[value="ro5"]')).toHaveCount(1);
      await expect(choice).toHaveValue("");
      await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(0);
      expect(demands).toEqual([]);
      await choice.selectOption("ro5");
      await captured;
      expect(demands[0].descriptor_ids).toEqual(["molecular_weight", "hbd", "hba", "calculated_logp"]);
      await expect(properties.getByRole("status")).toHaveText("Updating properties… Updating profile…");
      const deleted = page.waitForResponse(response => response.request().method() === "DELETE"
        && new URL(response.url()).pathname.startsWith(`${endpoint}/ligand-properties/consumers/`));
      await properties.getByRole("button", { name: "Cancel update", exact: true }).click();
      expect((await deleted).ok()).toBe(true);
      await expect(properties.getByRole("status")).toHaveText("Update cancelled Profile update cancelled.");
      const cancelledAllocations = allocations;
      await choice.selectOption("ro3");
      release();
      await expect(properties.getByRole("status")).toHaveText("Update cancelled Profile update cancelled.");
      expect(allocations).toBe(cancelledAllocations);
      await properties.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(0);
      await expect(choice).toHaveValue("ro3");
      const methods = properties.locator(".ligand-property-methods");
      await methods.locator("summary").click();
      await expect(methods.locator("dt")).toHaveCount(4);
      await expect(methods.locator("time")).toHaveCount(1);
      const details = properties.locator(".ligand-profile-details");
      await details.getByText("Criteria and sources", { exact: true }).click();
      await expect(details.getByText("Value: 46.069 g/mol", { exact: true })).toBeVisible();
      await expect(details.getByText("Criterion: < 300 g/mol", { exact: true })).toBeVisible();
      expect(await details.getByRole("link").count()).toBeGreaterThan(0);
      await choice.selectOption("cns-mpo");
      await expect(properties.getByRole("status")).toHaveText(`No property categories selected. ${unavailable.unavailable_reason}`);
      await expect(details).toContainText(unavailable.unavailable_reason!);
      await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(0);
      expect(await (await request.get(preferencePath)).json()).toEqual(hiddenPreferences);
      expect(await (await request.get(endpoint)).json()).toEqual(before);
      expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
      expect(await (await request.get(`${endpoint}/jobs`)).json()).toEqual([]);
      expect((await new AxeBuilder({ page }).include(".project-inspector")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await info.attach("actual-profile-dependent-demands", { contentType: "application/json", body: JSON.stringify({ demands, allocations, registry: registry.registry_version }) });
      await page.screenshot({ path: info.outputPath(`profile-dependent-demand-${theme}.png`) });
      completed = true;
    } finally {
      release();
      if (completed) {
        const current = await (await request.get(preferencePath)).json() as Preferences;
        const restored = await request.put(preferencePath, { data: {
          expected_revision: current.revision, enabled_categories: originalPreferences.enabled_categories,
        } });
        expect(restored.ok()).toBe(true);
      }
    }
  });

  test(`retires profile criteria during hidden-inspector edits and restores exact Undo and Redo (${theme})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const project = await prepare(page, request, [{ name: "profile-edit.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Profile edit ${theme}`);
    const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
    const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const preferences = await (await request.get(preferencePath)).json() as Preferences;
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await inspect(page, entry.id);
    const properties = page.getByRole("region", { name: "Properties", exact: true });
    const choice = properties.getByRole("combobox", { name: "Profile", exact: true });
    await choice.selectOption("ro5");
    await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
    const details = properties.locator(".ligand-profile-details");
    await details.getByText("Criteria and sources", { exact: true }).click();
    await expect(details.getByText("Value: 46.069 g/mol", { exact: true })).toBeVisible();
    let release!: () => void, capture!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const captured = new Promise<void>(resolve => { capture = resolve; });
    let holdNext = true;
    await page.route(url => url.pathname.startsWith(`${endpoint}/ligand-properties/`), async route => {
      if (holdNext && ["POST", "PUT"].includes(route.request().method())) {
        const payload = route.request().postDataJSON() as { entries?: { source_artifact_id: string }[] } | null;
        if (payload?.entries?.some(source => source.source_artifact_id !== entry.current_artifact_id)) {
          holdNext = false; capture(); await held;
        }
      }
      await route.continue();
    });
    try {
      await page.getByRole("tab", { name: "selection", exact: true }).click();
      await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
      await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
      await page.getByRole("button", { name: "Apply query", exact: true }).click();
      await closeInspector(page);
      await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
      await page.getByRole("dialog", { name: "Edit molecule", exact: true })
        .getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
      await expect.poll(async () => (await (await request.get(`${endpoint}/entries/${entry.id}/structure`)).json())
        .structure.atoms.find((atom: { id: number }) => atom.id === 1).element).toBe("N");
      await captured;
      await page.getByRole("button", { name: "Close molecular editor", exact: true }).click();
      await inspect(page, entry.id);
      await expect(choice).toHaveValue("ro5");
      await expect(properties.getByRole("status")).toHaveText("Updating properties… Updating profile…");
      expect(await details.getByText("Value: 46.069 g/mol", { exact: true }).count()).toBe(0);
      await choice.focus();
      const focusedChoice = await choice.elementHandle();
      release();
      await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      expect(await focusedChoice!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
      if (await details.getAttribute("open") === null) await details.getByText("Criteria and sources", { exact: true }).click();
      await expect(details.getByText("Value: 47.057 g/mol", { exact: true })).toBeVisible();
      await closeInspector(page);
      await page.getByRole("button", { name: /^Undo:/ }).click();
      await inspect(page, entry.id);
      await expect(choice).toHaveValue("ro5");
      await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      if (await details.getAttribute("open") === null) await details.getByText("Criteria and sources", { exact: true }).click();
      await expect(details.getByText("Value: 46.069 g/mol", { exact: true })).toBeVisible();
      await closeInspector(page);
      await page.getByRole("button", { name: /^Redo:/ }).click();
      await inspect(page, entry.id);
      await expect(choice).toHaveValue("ro5");
      await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      if (await details.getAttribute("open") === null) await details.getByText("Criteria and sources", { exact: true }).click();
      await expect(details.getByText("Value: 47.057 g/mol", { exact: true })).toBeVisible();
      expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
      expect(await (await request.get(preferencePath)).json()).toEqual(preferences);
      await page.screenshot({ path: info.outputPath(`profile-edited-current-${theme}.png`) });
    } finally { release(); }
  });
}


for (const theme of ["light", "dark"] as const) test(`withholds profile values throughout a real bond preview and restores Cancel and Apply (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(150_000);
  const project = await prepare(page, request, [{ name: "profile-preview.smi", mimeType: "chemical/x-daylight-smiles",
    buffer: Buffer.from("CCO ethanol\n") }], `Profile preview ${theme}`);
  const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
  const readProject = async () => await (await request.get(endpoint)).json() as Project;
  const readStructure = async () => (await (await request.get(`${endpoint}/entries/${entry.id}/structure`)).json()).structure;
  const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
  const preferences = await (await request.get(preferencePath)).json() as Preferences;
  const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  await inspect(page, entry.id);
  const properties = page.getByRole("region", { name: "Properties", exact: true });
  const choice = properties.getByRole("combobox", { name: "Profile", exact: true });
  const details = properties.locator(".ligand-profile-details");
  const current = async (weight: string) => {
    await expect(choice).toHaveValue("ro5");
    await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
    if (await details.getAttribute("open") === null) await details.locator("summary").click();
    await expect(details.getByText(`Value: ${weight} g/mol`, { exact: true })).toBeVisible();
  };
  await choice.selectOption("ro5");
  await current("46.069");
  await page.getByRole("tab", { name: "selection", exact: true }).click();
  await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
  const mode = page.getByRole("group", { name: "Operation mode" });
  for (const [index, atomId] of [1, 2].entries()) {
    await mode.getByRole("button", { name: index ? "add" : "replace", exact: true }).click();
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:${atomId}`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
    await expect(page.locator(".viewer-status")).toContainText(`/ ${index + 1} selected`);
  }
  await closeInspector(page);
  const beforePreview = await readProject(), beforeStructure = await readStructure();
  const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Bonds", exact: true }).click();
  await panel.getByText("Advanced bond details", { exact: true }).click();
  await panel.getByRole("checkbox", { name: "Preview changes before applying", exact: true }).check();
  await panel.getByRole("button", { name: "Increase bond order", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled({ timeout: 30_000 });
  // Closing the editor deliberately cancels placement. Keep the real proposal
  // active while inspecting it; the already chosen Entry cannot change in preview.
  const drawer = page.getByRole("dialog", { name: "Inspector panel", exact: true });
  if (await page.evaluate(() => innerWidth <= 840) && !await drawer.isVisible()) {
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
  }
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await expect(choice).toHaveValue("ro5");
  await expect(properties.getByRole("status")).toHaveText("Preview — properties unavailable Preview — profile unavailable.");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  expect(await details.getByText("Value: 46.069 g/mol", { exact: true }).count()).toBe(0);
  await expect(details.getByText("Value: Unavailable", { exact: true })).toHaveCount(4);
  await expect(properties.locator(".ligand-property-methods time")).toHaveCount(0);
  expect(await readProject()).toEqual(beforePreview);
  expect(await readStructure()).toEqual(beforeStructure);
  await page.screenshot({ path: info.outputPath(`profile-preview-withheld-${theme}.png`) });
  if (await drawer.isVisible()) {
    // Entry choice is disabled during an active proposal. Target the sheet's own
    // Escape handler without closing or cancelling the molecular editor beneath it.
    await drawer.focus(); await page.keyboard.press("Escape"); await expect(drawer).toBeHidden();
  }
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Cancel placement", exact: true }).click();
  await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await inspect(page, entry.id);
  await current("46.069");
  expect(await readProject()).toEqual(beforePreview);
  expect(await readStructure()).toEqual(beforeStructure);
  await closeInspector(page);
  await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
  await panel.getByRole("button", { name: "Increase bond order", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Apply placement", exact: true }).click();
  await expect.poll(async () => (await readProject()).revision).toBe(beforePreview.revision + 1);
  const appliedStructure = await readStructure();
  expect(appliedStructure).not.toEqual(beforeStructure);
  await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
  await inspect(page, entry.id);
  await current("44.053");
  await closeInspector(page);
  await page.getByRole("button", { name: /^Undo:/ }).click();
  await inspect(page, entry.id);
  await current("46.069");
  expect(await readStructure()).toEqual(beforeStructure);
  await closeInspector(page);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await inspect(page, entry.id);
  await current("44.053");
  expect(await readStructure()).toEqual(appliedStructure);
  expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
  expect(await (await request.get(preferencePath)).json()).toEqual(preferences);
  await page.screenshot({ path: info.outputPath(`profile-preview-applied-${theme}.png`) });
});


for (const theme of ["light", "dark"] as const) test(`recovers failed profile metadata without blocking independent current properties (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  let release!: () => void, capture!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const captured = new Promise<void>(resolve => { capture = resolve; });
  let reads = 0, allocations = 0;
  page.on("request", outgoing => {
    if (outgoing.method() === "POST" && /\/ligand-properties\/consumers$/.test(new URL(outgoing.url()).pathname)) allocations++;
  });
  await page.route(url => url.pathname === "/api/v1/ligand-profiles/registry", async route => {
    reads++;
    if (reads === 1) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Injected profile metadata outage" }) }); return; }
    if (reads === 2) {
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      capture(); await held; await route.fulfill({ response }); return;
    }
    await route.continue();
  });
  try {
    const project = await prepare(page, request, [{ name: "profile-metadata.smi", mimeType: "chemical/x-daylight-smiles",
      buffer: Buffer.from("CCO ethanol\n") }], `Profile metadata recovery ${theme}`);
    const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`;
    const original = await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body();
    const preferences = await (await request.get(preferencePath)).json() as Preferences;
    const toggle = page.getByRole("button", { name: `Use ${theme} theme`, exact: true });
    if (await toggle.count()) await toggle.click();
    await inspect(page, entry.id);
    const properties = page.getByRole("region", { name: "Properties", exact: true });
    const choice = properties.getByRole("combobox", { name: "Profile", exact: true });
    await expect(properties.getByRole("status")).toHaveText("Properties current Profile options could not be loaded. Property updates remain independent.", { timeout: 30_000 });
    await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(14);
    await expect(choice).toHaveValue("");
    await properties.getByRole("button", { name: "Retry profiles", exact: true }).click();
    await captured;
    await page.getByRole("tab", { name: "selection", exact: true }).click();
    await page.getByRole("combobox", { name: "Select by", exact: true }).selectOption("atom_reference");
    await page.getByRole("textbox", { name: "Value", exact: true }).fill(`${entry.id}:1`);
    await page.getByRole("button", { name: "Apply query", exact: true }).click();
    await closeInspector(page);
    await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Edit molecule", exact: true });
    await panel.getByRole("button", { name: "Replace selected atom with N", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`${endpoint}/entries/${entry.id}/structure`)).json())
      .structure.atoms.find((atom: { id: number }) => atom.id === 1).element).toBe("N");
    await panel.getByRole("button", { name: "Close molecular editor", exact: true }).click();
    await inspect(page, entry.id);
    await expect(properties.getByRole("status")).toHaveText("Properties current Loading profile options…", { timeout: 30_000 });
    await expect(properties.locator(".ligand-properties-groups dt")).toHaveCount(14);
    const beforeRelease = allocations;
    release();
    await expect(properties.getByRole("status")).toHaveText("Properties current No profile selected.");
    await choice.selectOption("ro5");
    await expect(properties.getByRole("status")).toHaveText("Properties current Within profile criteria.");
    const details = properties.locator(".ligand-profile-details");
    await details.locator("summary").click();
    await expect(details.getByText("Value: 47.057 g/mol", { exact: true })).toBeVisible();
    expect(await details.getByText("Value: 46.069 g/mol", { exact: true }).count()).toBe(0);
    expect(allocations).toBe(beforeRelease);
    expect(reads).toBe(2);
    expect(await (await request.get(`${endpoint}/entries/${entry.id}/original`)).body()).toEqual(original);
    expect(await (await request.get(preferencePath)).json()).toEqual(preferences);
    await info.attach("profile-metadata-recovery", { contentType: "application/json", body: JSON.stringify({ reads, allocations, beforeRelease, fault: "First metadata GET503; second actual GET held across real molecular edit" }) });
    await page.screenshot({ path: info.outputPath(`profile-metadata-recovered-${theme}.png`) });
  } finally { release(); }
});
