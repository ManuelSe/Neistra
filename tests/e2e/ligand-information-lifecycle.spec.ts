import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { observeEditPicks } from "../../apps/web/src/test/molecularEditHarness";
import type { inspectModelPreview } from "../../apps/web/src/test/modelingHarness";
import type { Project } from "../../apps/web/src/api/types";
import type { LigandCandidate, LigandCandidatesRead } from "../../apps/web/src/ligands/types";
import type { PropertyAggregate, PropertyPreferences, PropertyRequest } from "../../apps/web/src/ligandProperties/types";
import { prepare } from "./support/interactions";
import { observe, previewState, selectPair } from "./support/modeling";
import { openInspectorTools, openLigandInformation, showEntries } from "./support/navigation";

const preferencePath = "/api/v1/workspace/ligand-property-preferences";
const inspector = (page: Page) => page.getByRole("region", { name: "Project inspector", exact: true });
const properties = (page: Page) => inspector(page).getByRole("region", { name: "Properties", exact: true });
const header = (page: Page) => inspector(page).getByRole("group", { name: "Designated ligand information", exact: true });
const entryChoice = (page: Page) => inspector(page).getByRole("combobox", { name: "Entry", exact: true });
const profile = (page: Page) => properties(page).getByRole("combobox", { name: "Profile", exact: true });
const comparison = (page: Page) => properties(page).getByRole("region", { name: "Profile comparison", exact: true });
const sourceErrors = ["artifact_integrity_error", "artifact_not_found", "structure_artifact_conflict"] as const;
interface Delivery { path: string; request: PropertyRequest; response: PropertyAggregate }
interface BrowserQueryClient { invalidateQueries(options: { queryKey: readonly unknown[]; refetchType: "active" }): Promise<void> }
declare global { interface Window {
  __ligandInformationQueryClient: BrowserQueryClient;
  editingPicks: Awaited<ReturnType<typeof observeEditPicks>>;
  __ligandInformationRetiredFilterPatch?: () => boolean;
} }
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function theme(page: Page, value: "light" | "dark") {
  const toggle = page.getByRole("button", { name: `Use ${value} theme`, exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", value);
}
async function preferences(request: APIRequestContext, categories: PropertyPreferences["enabled_categories"]) {
  const before = await (await request.get(preferencePath)).json() as PropertyPreferences;
  const saved = await request.put(preferencePath, { data: { expected_revision: before.revision, enabled_categories: categories } });
  expect(saved.ok()).toBe(true);
  return { before, saved: await saved.json() as PropertyPreferences };
}
async function restore(request: APIRequestContext, previous: PropertyPreferences) {
  const current = await (await request.get(preferencePath)).json() as PropertyPreferences;
  if (JSON.stringify(current.enabled_categories) !== JSON.stringify(previous.enabled_categories)) {
    expect((await request.put(preferencePath, { data: { expected_revision: current.revision, enabled_categories: previous.enabled_categories } })).ok()).toBe(true);
  }
}
async function closeSheet(page: Page) {
  const sheet = page.getByRole("dialog", { name: /^(Inspector panel|Project browser panel)$/ });
  if (await sheet.isVisible()) { await sheet.focus(); await page.keyboard.press("Escape"); await expect(sheet).toBeHidden(); }
}
async function browser(page: Page) {
  const region = page.getByRole("region", { name: "Project browser", exact: true });
  if (!await region.isVisible()) {
    const mobile = page.getByRole("button", { name: "Project browser", exact: true });
    if (await mobile.isVisible()) await mobile.click();
    else await page.getByRole("button", { name: "Expand project browser", exact: true }).click();
  }
  await expect(region).toBeVisible(); await showEntries(page); return region;
}
async function inspect(page: Page, entryId: string) {
  await openLigandInformation(page); await entryChoice(page).selectOption(entryId);
}
async function selectProject(page: Page, name: string) {
  await closeSheet(page); await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
async function selection(page: Page) {
  return page.evaluate(async () => { const path = "/src/store/selection.ts";
    return (await import(/* @vite-ignore */ path)).useSelectionStore.getState().selection; });
}
async function compositor(page: Page, info: TestInfo, label: string) {
  const cdp = await page.context().newCDPSession(page);
  try { const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await info.attach(label, { contentType: "image/png", body: Buffer.from(result.data, "base64") });
  } finally { await cdp.detach(); }
}
async function openDetails(page: Page, selector: string) {
  const details = properties(page).locator(selector);
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", ""); return details;
}
async function unavailableNumbers(page: Page) {
  await expect(properties(page).getByRole("status")).not.toContainText("Properties current");
  await expect(properties(page).getByRole("status")).not.toContainText("Within profile criteria");
  await expect(comparison(page).locator(".comparison-point")).toHaveCount(0);
  await expect(properties(page).locator(".ligand-property-methods time")).toHaveCount(0);
  await expect(properties(page).locator(".ligand-profile-criteria dd > span:first-child").filter({ hasText: /^Value: (?!Unavailable)/ })).toHaveCount(0);
}

for (const value of ["light", "dark"] as const) {
  test(`retains a manually chosen raw-complex instance and explains existing browser filters without retargeting (${value})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    const preference = await preferences(request, ["composition", "polarity", "lipophilicity", "flexibility"]);
    try {
      const source = await readFile("tests/fixtures/complex/1stp.pdb");
      expect(createHash("sha256").update(source).digest("hex")).toBe("6fbb3d5c324e717fe7284703426e74ea58191431720daab1b2faa0bbb6430f30");
      const other = await (await request.post("/api/v1/projects", { data: { name: `Other filter visit ${value} ${Date.now()}` } })).json() as Project;
      const project = await prepare(page, request, ["tests/fixtures/complex/1stp.pdb", "tests/fixtures/formats/ethanol.mol"], `Complex sidebar ${value}`);
      const entry = project.entries.find(item => item.structure_type === "complex")!;
      expect(entry).toBeDefined(); expect(entry.atom_count).toBe(1001);
      const endpoint = `/api/v1/projects/${project.id}`, entryPath = `${endpoint}/entries/${entry.id}`;
      const read = async () => await (await request.get(endpoint)).json() as Project;
      const original = await (await request.get(`${entryPath}/original`)).body(); expect(original).toEqual(source);
      const normalized = await (await request.get(`/api/v1/artifacts/${entry.current_artifact_id}`)).body();
      const selected = await selection(page); await theme(page, value); await inspect(page, entry.id);
      const inventories: LigandCandidatesRead[] = []; let candidate: LigandCandidate | undefined;
      for (let offset = 0; ; offset += 12) {
        const response = await request.get(`${entryPath}/ligand-candidates?expected_artifact_id=${entry.current_artifact_id}&offset=${offset}&limit=12`);
        expect(response.ok()).toBe(true); const inventory = await response.json() as LigandCandidatesRead; inventories.push(inventory);
        candidate = inventory.candidates.find(item => item.locations.some(location => location.residue_name === "BTN"
          && location.author_number === 300 && location.chain_name === "A"));
        if (candidate || offset + 12 >= inventory.total) break;
      }
      expect(candidate).toBeDefined(); expect(candidate!.boundary_status).toBe("source_instance");
      expect(candidate!.atom_ids).toEqual(Array.from({ length: 16 }, (_, index) => 902 + index));
      expect(candidate!.residue_ids).toEqual([122]);
      expect(candidate!.formula).toBeNull(); expect(candidate!.molecular_weight).toBeNull(); expect(candidate!.formal_charge).toBeNull();
      const inventory = inventories.at(-1)!; expect(inventory.offset).toBe(0); expect(inventory.selectable_candidate_keys).toContain(candidate!.candidate_key);
      await inspector(page).getByRole("button", { name: "Choose", exact: true }).click();
      const chooser = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
      const radio = chooser.getByRole("radio", { name: /BTN 300 · chain A/ });
      await expect(radio).toBeVisible();
      await radio.check(); await chooser.getByRole("button", { name: "Use ligand", exact: true }).click(); await expect(chooser).toBeHidden();
      const assigned = (await read()).entries.find(item => item.id === entry.id)!;
      expect(assigned.ligand_designation.status).toBe("resolved"); expect(assigned.ligand_designation.origin).toBe("manual");
      expect(assigned.ligand_designation.instance_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(assigned.ligand_designation.instance_id).not.toBe(candidate!.candidate_key);
      expect(assigned.ligand_designation.atom_ids).toEqual(candidate!.atom_ids);
      expect(assigned.ligand_designation.source_artifact_id).toBe(entry.current_artifact_id);
      await expect(header(page)).toContainText(assigned.ligand_designation.instance_id!);
      for (const label of ["Formula", "Formal charge"]) await expect(header(page).locator(".ligand-designated-composition > div").filter({ hasText: label }).locator("dd")).toHaveText("Unavailable");
      await expect(header(page).locator("img")).toHaveCount(0); await expect(header(page)).toContainText("2D unavailable");
      await profile(page).selectOption("ro5");
      await expect(properties(page).getByRole("status")).toContainText("Some properties are unavailable", { timeout: 30_000 });
      await expect(properties(page).getByRole("status")).toContainText("Profile unavailable for the current molecular representation.");
      const counts = [["Heavy atoms", "16"], ["Heteroatoms", "6"], ["Carbon atoms", "10"]] as const;
      for (const [label, count] of counts) await expect(properties(page).locator(".ligand-properties-groups dl > div").filter({ has: page.locator("dt", { hasText: label }) }).locator("dd")).toHaveText(count);
      const registry = await (await request.get("/api/v1/ligand-properties/registry")).json() as { definitions: { id: string }[] };
      const rawPropertyRead = await request.post(`${endpoint}/ligand-properties/read`, { data: {
        entries: [{ entry_id: entry.id, source_artifact_id: entry.current_artifact_id, instance_id: assigned.ligand_designation.instance_id, atom_ids: candidate!.atom_ids }],
        descriptor_ids: registry.definitions.map(item => item.id),
      } });
      expect(rawPropertyRead.ok()).toBe(true); const rawProperties = await rawPropertyRead.json() as PropertyAggregate;
      const report = rawProperties.entries[0].report!; expect(report.model_status).toBe("unavailable");
      expect(report.contains_formally_charged_atoms).toBeNull();
      expect(report.values.find(item => item.descriptor_id === "formal_charge")).toMatchObject({ value: null, status: "unavailable", reason: "atomic_charge_not_qualified" });
      for (const [id, count] of [["heavy_atom_count", 16], ["heteroatom_count", 6], ["carbon_count", 10]] as const)
        expect(report.values.find(item => item.descriptor_id === id)).toMatchObject({ status: "ready", value: count });
      const criteria = await openDetails(page, ".ligand-profile-details");
      await expect(criteria).toContainText("profile required descriptor unavailable");
      await expect(criteria).not.toContainText("Within profile criteria");
      await openDetails(page, ".comparison-table");
      await expect(comparison(page).locator("tbody tr")).toHaveCount(4);
      await expect(comparison(page).locator('tr[data-descriptor="molecular_weight"] td > span:first-child')).toHaveText("Unavailable");
      await expect(comparison(page).locator(".comparison-point")).toHaveCount(0);
      const interactions = inspector(page).locator(".ligand-interaction-unavailable"); await interactions.locator("summary").click();
      await expect(interactions).toContainText("Interaction diagram unavailable — choose exact ligand and protein inputs when this tool is available.");
      await expect(interactions.locator("svg,canvas")).toHaveCount(0);
      const beforeFilters = await read();
      await closeSheet(page); const list = await browser(page), search = list.getByRole("textbox", { name: "Search structures", exact: true });
      await search.fill("does not match this entry"); await expect(list.locator(`[data-entry-id="${entry.id}"]`)).toHaveCount(0);
      await closeSheet(page); await openLigandInformation(page);
      await expect(inspector(page).getByText("Outside current filters", { exact: true })).toBeVisible();
      await expect(entryChoice(page)).toHaveValue(entry.id); await expect(entryChoice(page).locator("option")).toHaveCount(3);
      expect(await selection(page)).toEqual(selected); expect(await read()).toEqual(beforeFilters);
      await closeSheet(page); await browser(page); await search.fill("");
      if (await list.locator(".browser-filter-details").getAttribute("open") === null) await list.locator(".browser-filter-details > summary").click();
      await list.getByRole("combobox", { name: "Filter structure type", exact: true }).selectOption("ligand");
      await closeSheet(page); await openLigandInformation(page); await expect(inspector(page).getByText("Outside current filters", { exact: true })).toBeVisible();
      await expect(entryChoice(page)).toHaveValue(entry.id); expect(await read()).toEqual(beforeFilters);
      await closeSheet(page); await browser(page);
      if (await list.locator(".browser-filter-details").getAttribute("open") === null) await list.locator(".browser-filter-details > summary").click();
      await list.getByRole("combobox", { name: "Filter structure type", exact: true }).selectOption("all");
      await closeSheet(page); await openLigandInformation(page); await expect(inspector(page).getByText("Outside current filters", { exact: true })).toHaveCount(0);
      await closeSheet(page); await browser(page); await search.fill("1stp");
      await page.evaluate(async () => { const path = "/src/store/workspace.ts", store = (await import(/* @vite-ignore */ path)).useWorkspaceStore;
        const state = store.getState(), scope = { projectId: state.activeProjectId, visit: state.browserFilterVisit };
        window.__ligandInformationRetiredFilterPatch = () => store.getState().patchBrowserFilters(scope, { search: "retired A visit" }); });
      await selectProject(page, other.name); await selectProject(page, project.name); await browser(page);
      await expect(search).toHaveValue(""); await search.fill("current visit");
      expect(await page.evaluate(() => window.__ligandInformationRetiredFilterPatch!())).toBe(false); await expect(search).toHaveValue("current visit");
      await search.fill(""); await closeSheet(page); await inspect(page, entry.id);
      await page.reload(); await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 30_000 });
      await inspect(page, entry.id); await expect(header(page)).toContainText(assigned.ligand_designation.instance_id!);
      expect((await read()).entries.find(item => item.id === entry.id)!.ligand_designation).toEqual(assigned.ligand_designation);
      expect(await (await request.get(`${entryPath}/original`)).body()).toEqual(original);
      expect(await (await request.get(`/api/v1/artifacts/${entry.current_artifact_id}`)).body()).toEqual(normalized);
      expect((await read()).entries.map(item => ({ id: item.id, visible: item.visible, artifact: item.current_artifact_id })))
        .toEqual(project.entries.map(item => ({ id: item.id, visible: item.visible, artifact: item.current_artifact_id })));
      await compositor(page, info, `raw-complex-current-${value}`);
      await info.attach("raw-complex-identity-and-filter-visits", { contentType: "application/json", body: JSON.stringify({ inventories,
        designation: assigned.ligand_designation, rawProperties, selected, normalizedSha256: createHash("sha256").update(normalized).digest("hex") }) });
    } finally { await restore(request, preference.before); }
  });

  test(`withholds primary composition and comparison during real bond proposals and restores Cancel Apply Undo Redo (${value})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    const preference = await preferences(request, []);
    try {
      const project = await prepare(page, request, [{ name: "sidebar-proposal.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") }], `Sidebar proposal ${value}`);
      const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`, entryPath = `${endpoint}/entries/${entry.id}`;
      const read = async () => await (await request.get(endpoint)).json() as Project;
      const structure = async () => (await (await request.get(`${entryPath}/structure`)).json()).structure as unknown;
      const original = await (await request.get(`${entryPath}/original`)).body();
      await theme(page, value); await observe(page); await inspect(page, entry.id); await profile(page).selectOption("ro5-veber");
      const current = async (weight: string, formula: string) => {
        await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
        await expect(header(page)).toContainText(formula); await expect(comparison(page).locator(".comparison-point")).toHaveCount(6);
        await openDetails(page, ".comparison-table");
        await expect(comparison(page).locator('tr[data-descriptor="molecular_weight"] td > span:first-child')).toHaveText(`${weight} g/mol`);
      };
      await current("46.069", "C2H6O"); await closeSheet(page); await selectPair(page, entry.id, [1, 2], info.project.name === "mobile-chromium");
      const committed = await read(), initialStructure = await structure(), editor = page.getByRole("dialog", { name: "Edit molecule", exact: true });
      await page.getByRole("button", { name: "Edit molecule", exact: true }).click();
      await editor.getByRole("button", { name: "Bonds", exact: true }).click(); await editor.getByText("Advanced bond details", { exact: true }).click();
      await editor.getByRole("checkbox", { name: "Preview changes before applying", exact: true }).check();
      const propose = async () => {
        await editor.getByRole("button", { name: "Increase bond order", exact: true }).click();
        await expect(editor.getByRole("button", { name: "Apply placement", exact: true })).toBeEnabled({ timeout: 30_000 });
        const preview: Awaited<ReturnType<typeof inspectModelPreview>> = await previewState(page); expect(preview.preview).not.toBeNull();
        expect(preview.objects.some(item => item.drawCount > 0)).toBe(true);
        await openLigandInformation(page); await expect(editor).toBeVisible();
        await expect(properties(page).getByRole("status")).toHaveText("Preview — properties unavailable Preview — profile unavailable.");
        await expect(header(page)).toContainText("Composition unavailable during preview.");
        await expect(header(page).locator("img")).toHaveCount(0); await expect(header(page)).toContainText("2D unavailable during preview");
        await unavailableNumbers(page); await openDetails(page, ".comparison-table");
        await expect(comparison(page).locator("tbody tr td > span:first-child")).toHaveText(Array(6).fill("Unavailable"));
        expect(await read()).toEqual(committed); expect(await structure()).toEqual(initialStructure);
      };
      await propose(); await compositor(page, info, `primary-proposal-withheld-${value}`); await closeSheet(page);
      await editor.getByRole("button", { name: "Cancel placement", exact: true }).click();
      await editor.getByRole("button", { name: "Close molecular editor", exact: true }).click(); await inspect(page, entry.id);
      await current("46.069", "C2H6O"); expect(await read()).toEqual(committed); expect(await structure()).toEqual(initialStructure);
      await closeSheet(page); await page.getByRole("button", { name: "Edit molecule", exact: true }).click(); await propose(); await closeSheet(page);
      await editor.getByRole("button", { name: "Apply placement", exact: true }).click();
      await expect.poll(async () => (await read()).revision).toBe(committed.revision + 1);
      const applied = await structure(); expect(applied).not.toEqual(initialStructure);
      await editor.getByRole("button", { name: "Close molecular editor", exact: true }).click(); await inspect(page, entry.id); await current("44.053", "C2H4O");
      await closeSheet(page); await page.getByRole("button", { name: /^Undo:/ }).click(); await inspect(page, entry.id); await current("46.069", "C2H6O"); expect(await structure()).toEqual(initialStructure);
      await closeSheet(page); await page.getByRole("button", { name: /^Redo:/ }).click(); await inspect(page, entry.id); await current("44.053", "C2H4O"); expect(await structure()).toEqual(applied);
      expect(await (await request.get(`${entryPath}/original`)).body()).toEqual(original);
      expect(await (await request.get(preferencePath)).json()).toEqual(preference.saved);
      await info.attach("real-proposal-source-history", { contentType: "application/json", body: JSON.stringify({ initial: committed, applied: await read() }) });
      await compositor(page, info, `primary-proposal-redone-${value}`);
    } finally { await restore(request, preference.before); }
  });

  test(`retires cached numbers on known same-source failures and recovers only through fresh verified property READ (${value})`, async ({ page, request }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 700 });
    const preference = await preferences(request, []), releases: (() => void)[] = [], evidence: unknown[] = [];
    const workspaceExposures: { beforeSha256: string; afterSha256: string; appended: string }[] = [];
    await page.route("**/src/workspace.tsx*", async route => {
      const response = await route.fetch(), beforeBody = await response.text(), appended = "\nwindow.__ligandInformationQueryClient = queryClient;", afterBody = beforeBody + appended;
      workspaceExposures.push({ beforeSha256: createHash("sha256").update(beforeBody).digest("hex"),
        afterSha256: createHash("sha256").update(afterBody).digest("hex"), appended });
      await info.attach(`workspace-query-client-exposure-before-${workspaceExposures.length}`, { contentType: "text/javascript", body: beforeBody });
      await info.attach(`workspace-query-client-exposure-after-${workspaceExposures.length}`, { contentType: "text/javascript", body: afterBody });
      await route.fulfill({ response, body: afterBody });
    });
    let failedImage = false, failedImageUrl = "";
    const imageRequests: string[] = [];
    await page.route(/\/api\/v1\/artifacts\//, async route => {
      if (route.request().resourceType() !== "image") { await route.continue(); return; }
      imageRequests.push(route.request().url());
      if (!failedImage) { failedImage = true; failedImageUrl = route.request().url(); await route.abort("failed"); }
      else await route.continue();
    });
    try {
      const project = await prepare(page, request, [{ name: "sidebar-source.smi", mimeType: "chemical/x-daylight-smiles", buffer: Buffer.from("CCO ethanol\n") }], `Sidebar source authority ${value}`);
      const entry = project.entries[0], endpoint = `/api/v1/projects/${project.id}`, entryPath = `${endpoint}/entries/${entry.id}`;
      const before = await (await request.get(endpoint)).json() as Project, original = await (await request.get(`${entryPath}/original`)).body();
      await theme(page, value); await inspect(page, entry.id); await profile(page).selectOption("ro5");
      await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
      await expect(header(page)).toContainText("C2H6O");
      await expect(header(page)).toContainText("2D could not be loaded");
      const imagesBefore = imageRequests.length; await header(page).getByRole("button", { name: "Retry 2D", exact: true }).click();
      await expect.poll(() => header(page).locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      expect(imageRequests).toHaveLength(imagesBefore + 1); expect(new URL(imageRequests.at(-1)!).pathname).toBe(new URL(failedImageUrl).pathname);
      expect(imageRequests.at(-1)).not.toBe(failedImageUrl);
      let injected: typeof sourceErrors[number] | null = null, failures = 0, reads = 0, newDemands = 0;
      const browserPropertyReads: { sequence: number; path: string; request: PropertyRequest }[] = [];
      const staleReady = deferred(), staleCaptured = deferred(); releases.push(staleReady.release);
      let stalePending = false, staleDelivery: Delivery | null = null, staleResponseSettled = false;
      let heldRead: { ready: ReturnType<typeof deferred>; captured: ReturnType<typeof deferred>; delivery: Delivery | null } | null = null;
      await page.route(url => url.pathname === `${entryPath}/ligand-candidates`, async route => {
        expect(route.request().method()).toBe("GET"); expect(new URL(route.request().url()).searchParams.get("expected_artifact_id")).toBe(entry.current_artifact_id);
        if (injected) { failures++; await route.fulfill({ status: injected === "artifact_not_found" ? 404 : 409,
          contentType: "application/json", body: JSON.stringify({ detail: { code: injected, message: `Injected exact-source verification failure: ${injected}` } }) }); }
        else await route.continue();
      });
      await page.route(url => url.pathname.startsWith(`${endpoint}/ligand-properties/`), async route => {
        const method = route.request().method();
        if (method === "POST" && urlPath(route.request().url()).endsWith("/consumers")) newDemands++;
        if (method === "POST" && urlPath(route.request().url()).endsWith("/read")) {
          reads++; browserPropertyReads.push({ sequence: reads, path: urlPath(route.request().url()), request: route.request().postDataJSON() as PropertyRequest });
        }
        if (stalePending && ["POST", "PUT"].includes(method) && route.request().postData()) {
          const staleRequest = route.request().postDataJSON() as PropertyRequest;
          if (staleRequest.entries?.some(item => item.entry_id === entry.id) && staleRequest.descriptor_ids?.length === 6) {
            const response = await route.fetch(); expect(response.ok()).toBe(true); const body = await response.json() as PropertyAggregate;
            if (body.entries.some(item => item.status === "ready" && item.report && staleRequest.descriptor_ids.every(id => item.report!.coverage.includes(id)))) {
              stalePending = false; staleDelivery = { path: urlPath(route.request().url()), request: staleRequest, response: body };
              staleCaptured.release(); await staleReady.promise;
            }
            await route.fulfill({ response }); if (staleDelivery?.response === body) staleResponseSettled = true; return;
          }
        }
        if (method !== "POST" || !urlPath(route.request().url()).endsWith("/read")) { await route.continue(); return; }
        const gate = heldRead, response = await route.fetch(); expect(response.ok()).toBe(true);
        const payload = await response.json() as PropertyAggregate, source = (route.request().postDataJSON() as PropertyRequest).entries[0];
        expect(source).toEqual({ entry_id: entry.id, source_artifact_id: entry.current_artifact_id,
          instance_id: entry.ligand_designation.instance_id, atom_ids: entry.ligand_designation.atom_ids });
        const ready = payload.entries.find(item => item.source.entry_id === entry.id);
        expect(payload.project_id).toBe(project.id); expect(ready?.source).toEqual(source);
        expect(ready?.status).toBe("ready"); expect(ready?.report?.values.every(item => item.status === "ready" && item.value !== null)).toBe(true);
        if (gate) { gate.delivery = { path: urlPath(route.request().url()), request: route.request().postDataJSON() as PropertyRequest, response: payload };
          gate.captured.release(); await gate.ready.promise; }
        await route.fulfill({ response });
      });
      for (const code of sourceErrors) {
        if (code === sourceErrors[0]) { stalePending = true; await profile(page).selectOption("ro5-veber"); await staleCaptured.promise; }
        injected = code; const readsBefore = reads, demandsBefore = newDemands;
        await page.evaluate(async ({ projectId, entryId }) => { const path = "/src/ligands/presentation.ts";
          const { POLICY } = await import(/* @vite-ignore */ path);
          await window.__ligandInformationQueryClient.invalidateQueries({ queryKey: ["ligand-candidates", POLICY, projectId, entryId], refetchType: "active" });
        }, { projectId: project.id, entryId: entry.id });
        await expect(header(page).locator(".ligand-designated-composition")).toHaveCount(0); await expect(header(page).locator("img")).toHaveCount(0);
        await unavailableNumbers(page); await expect(properties(page).getByRole("button", { name: "Retry", exact: true })).toBeVisible();
        expect(reads).toBe(readsBefore);
        if (code === sourceErrors[0]) { staleReady.release(); await expect.poll(() => staleResponseSettled).toBe(true); await unavailableNumbers(page); }
        injected = null;
        const candidateResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return response.request().method() === "GET" && url.pathname === `${entryPath}/ligand-candidates`
            && url.searchParams.get("expected_artifact_id") === entry.current_artifact_id
            && url.searchParams.get("offset") === "0" && url.searchParams.get("limit") === "12" && response.status() === 200;
        });
        await inspector(page).getByRole("button", { name: "Change", exact: true }).click();
        const candidateRecovery = await (await candidateResponse).json() as LigandCandidatesRead;
        expect(candidateRecovery.project_id).toBe(project.id); expect(candidateRecovery.entry_id).toBe(entry.id);
        expect(candidateRecovery.artifact_id).toBe(entry.current_artifact_id);
        expect(candidateRecovery.designation.instance_id).toBe(entry.ligand_designation.instance_id);
        expect(candidateRecovery.designated_candidate?.atom_ids).toEqual(entry.ligand_designation.atom_ids);
        const chooser = page.getByRole("dialog", { name: "Choose ligand of interest", exact: true });
        await expect(chooser.getByRole("radio")).toHaveCount(1); await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(header(page)).toContainText("C2H6O"); await unavailableNumbers(page); expect(reads).toBe(readsBefore);
        const candidateOnlyCounts = { reads, demands: newDemands };
        const gate = { ready: deferred(), captured: deferred(), delivery: null as Delivery | null }; heldRead = gate; releases.push(gate.ready.release);
        const recoveryTrigger = code === sourceErrors[0] ? "automatic-profile-change" : "explicit-retry";
        if (code === sourceErrors[0]) await profile(page).selectOption("ro5");
        else await properties(page).getByRole("button", { name: "Retry", exact: true }).click();
        await gate.captured.promise;
        await unavailableNumbers(page); expect(reads).toBe(readsBefore + 1); expect(newDemands).toBe(demandsBefore);
        expect(reads).toBe(browserPropertyReads.length);
        expect(gate.delivery!.request.descriptor_ids).toEqual(["molecular_weight", "hbd", "hba", "calculated_logp"]);
        expect(browserPropertyReads.slice(readsBefore)).toEqual([{ sequence: readsBefore + 1,
          path: `${endpoint}/ligand-properties/read`, request: gate.delivery!.request }]);
        const oldReady = staleDelivery as Delivery | null; expect(oldReady).not.toBeNull();
        const oldWarmReport = oldReady!.response.entries.find(item => item.source.entry_id === entry.id)!.report!;
        const freshWarmReport = gate.delivery!.response.entries.find(item => item.source.entry_id === entry.id)!.report!;
        expect(freshWarmReport.input_hash).toBe(oldWarmReport.input_hash); expect(freshWarmReport.created_at).toBe(oldWarmReport.created_at);
        expect(freshWarmReport.implementation_version).toBe(oldWarmReport.implementation_version);
        expect(freshWarmReport.library_version).toBe(oldWarmReport.library_version); expect(freshWarmReport.policy_version).toBe(oldWarmReport.policy_version);
        const heldReadCounts = { reads, demands: newDemands };
        gate.ready.release(); heldRead = null;
        await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
        await expect(comparison(page).locator(".comparison-point")).toHaveCount(4);
        await openDetails(page, ".comparison-table"); await expect(comparison(page).locator('tr[data-descriptor="molecular_weight"] td > span:first-child')).toHaveText("46.069 g/mol");
        expect(reads).toBe(readsBefore + 1); expect(newDemands).toBe(demandsBefore);
        evidence.push({ code, failures, readsBefore, readsAfter: reads, freshVerifiedWarmRead: gate.delivery, newDemands,
          recoveryTrigger, requestedDescriptorIds: gate.delivery!.request.descriptor_ids,
          phaseCounts: { beforeFailure: { reads: readsBefore, demands: demandsBefore }, candidateOnly: candidateOnlyCounts,
            responseHeld: heldReadCounts, responseReleased: { reads, demands: newDemands } },
          browserPropertyReads: browserPropertyReads.slice(readsBefore), warmReportCreatedAt: freshWarmReport.created_at });
      }
      // A drawing-file failure is not evidence that molecular inputs failed verification.
      // Only the production committed depiction query's exact source and typed provenance can retire numbers.
      type SourceVerification = "current" | "original";
      type DepictionFault = { code: typeof sourceErrors[number]; status: 404 | 409; source_verification?: SourceVerification };
      let depictionFault: DepictionFault | null = null;
      const depictionRequests: { path: string; expectedArtifactId: string | null; fault: DepictionFault | null }[] = [];
      const numericalTraffic: { method: string; path: string }[] = [];
      const depictionEvidence: unknown[] = [];
      page.on("request", outgoing => {
        const path = new URL(outgoing.url()).pathname;
        if (["POST", "PUT"].includes(outgoing.method()) && path.startsWith(`${endpoint}/ligand-properties/`)
          && /\/(read|consumers(?:\/[^/]+)?)$/.test(path)) numericalTraffic.push({ method: outgoing.method(), path });
      });
      const actualInventoryResponse = await request.get(`${entryPath}/ligand-candidates?expected_artifact_id=${entry.current_artifact_id}&offset=0&limit=12`);
      expect(actualInventoryResponse.ok()).toBe(true);
      const actualInventory = await actualInventoryResponse.json() as LigandCandidatesRead;
      expect(actualInventory.project_id).toBe(project.id); expect(actualInventory.entry_id).toBe(entry.id);
      expect(actualInventory.artifact_id).toBe(entry.current_artifact_id);
      expect(actualInventory.designation.instance_id).toBe(entry.ligand_designation.instance_id);
      const actualCandidate = actualInventory.designated_candidate!;
      expect(actualCandidate.atom_ids).toEqual(entry.ligand_designation.atom_ids);
      expect(entry.original_artifact_id).not.toBeNull();
      const depictionPath = `${entryPath}/ligand-candidates/${encodeURIComponent(actualCandidate.candidate_key)}/depiction`;
      await page.route(url => url.pathname === depictionPath, async route => {
        expect(route.request().method()).toBe("GET");
        const expectedArtifactId = new URL(route.request().url()).searchParams.get("expected_artifact_id");
        expect(expectedArtifactId).toBe(entry.current_artifact_id);
        const fault = depictionFault;
        depictionRequests.push({ path: new URL(route.request().url()).pathname, expectedArtifactId, fault });
        if (!fault) { await route.continue(); return; }
        const detail: { code: typeof sourceErrors[number]; message: string; source_verification?: SourceVerification } = {
          code: fault.code, message: `Injected exact depiction endpoint failure: ${fault.code}`,
        };
        if (fault.source_verification) detail.source_verification = fault.source_verification;
        await route.fulfill({ status: fault.status, contentType: "application/json", body: JSON.stringify({ detail }) });
      });
      const refetchCurrentDepiction = async () => {
        await page.evaluate(async ({ projectId, entryId, currentArtifactId, originalArtifactId }) => {
          const path = "/src/ligands/presentation.ts", { POLICY } = await import(/* @vite-ignore */ path);
          await window.__ligandInformationQueryClient.invalidateQueries({ queryKey: ["ligand-depiction", POLICY,
            "ligand-2d-v1", "committed", projectId, entryId, currentArtifactId, originalArtifactId], refetchType: "active" });
        }, { projectId: project.id, entryId: entry.id, currentArtifactId: entry.current_artifact_id, originalArtifactId: entry.original_artifact_id });
      };
      const readyNumbers = async () => {
        await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.");
        await expect(comparison(page).locator(".comparison-point")).toHaveCount(4);
        await expect(comparison(page).locator('tr[data-descriptor="molecular_weight"] td > span:first-child')).toHaveText("46.069 g/mol");
        await expect(header(page)).toContainText("C2H6O");
      };
      const retiredNumbers = async () => {
        await unavailableNumbers(page); await expect(profile(page)).toHaveValue("ro5");
        const tableValues = await comparison(page).locator("tbody tr td > span:first-child").allTextContents();
        expect(tableValues.every(text => text === "Unavailable")).toBe(true);
      };
      for (const code of ["artifact_integrity_error", "artifact_not_found"] as const) {
        await readyNumbers();
        await expect.poll(() => header(page).locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        const readsBefore = reads, demandsBefore = newDemands, trafficBefore = numericalTraffic.length, requestsBefore = depictionRequests.length;
        depictionFault = { code, status: code === "artifact_not_found" ? 404 : 409 };
        await refetchCurrentDepiction();
        await expect(header(page)).toContainText("2D could not be loaded"); await expect(header(page).locator("img")).toHaveCount(0);
        await readyNumbers(); expect(reads).toBe(readsBefore); expect(newDemands).toBe(demandsBefore);
        expect(numericalTraffic).toHaveLength(trafficBefore); expect(depictionRequests).toHaveLength(requestsBefore + 1);
        depictionFault = null; await header(page).getByRole("button", { name: "Retry 2D", exact: true }).click();
        await expect.poll(() => header(page).locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        await readyNumbers(); expect(numericalTraffic).toHaveLength(trafficBefore);
        depictionEvidence.push({ kind: "untagged-derived-drawing-error", code, readsBefore, readsAfter: reads,
          demandsBefore, demandsAfter: newDemands, numericalTraffic: numericalTraffic.slice(trafficBefore),
          depictionRequests: depictionRequests.slice(requestsBefore) });
      }
      const molecularDepictionFaults: DepictionFault[] = [{ code: "structure_artifact_conflict", status: 409 }];
      for (const source_verification of ["current", "original"] as const) for (const code of ["artifact_integrity_error", "artifact_not_found"] as const) {
        molecularDepictionFaults.push({ code, status: code === "artifact_not_found" ? 404 : 409, source_verification });
      }
      const previousWarmRead = (evidence.at(-1) as { freshVerifiedWarmRead: Delivery }).freshVerifiedWarmRead;
      const previousWarmReport = previousWarmRead.response.entries.find(item => item.source.entry_id === entry.id)!.report!;
      for (const fault of molecularDepictionFaults) {
        await readyNumbers();
        await expect.poll(() => header(page).locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        const readsBefore = reads, demandsBefore = newDemands, trafficBefore = numericalTraffic.length, requestsBefore = depictionRequests.length;
        depictionFault = fault; await refetchCurrentDepiction();
        await expect(header(page).locator(".ligand-designated-composition")).toHaveCount(0); await expect(header(page).locator("img")).toHaveCount(0);
        await retiredNumbers(); await expect(properties(page).getByRole("button", { name: "Retry", exact: true })).toBeVisible();
        expect(reads).toBe(readsBefore); expect(newDemands).toBe(demandsBefore); expect(numericalTraffic).toHaveLength(trafficBefore);
        expect(depictionRequests).toHaveLength(requestsBefore + 1);
        depictionFault = null;
        const candidateResponse = page.waitForResponse(response => response.request().method() === "GET"
          && new URL(response.url()).pathname === `${entryPath}/ligand-candidates`
          && new URL(response.url()).searchParams.get("expected_artifact_id") === entry.current_artifact_id && response.ok());
        await header(page).getByRole("button", { name: "Retry ligand information", exact: true }).click();
        const candidateRecovery = await (await candidateResponse).json() as LigandCandidatesRead;
        expect(candidateRecovery.designation.instance_id).toBe(entry.ligand_designation.instance_id);
        expect(candidateRecovery.designated_candidate?.atom_ids).toEqual(entry.ligand_designation.atom_ids);
        await expect(header(page)).toContainText("C2H6O");
        await retiredNumbers(); expect(reads).toBe(readsBefore); expect(numericalTraffic).toHaveLength(trafficBefore);
        const gate = { ready: deferred(), captured: deferred(), delivery: null as Delivery | null };
        heldRead = gate; releases.push(gate.ready.release);
        await properties(page).getByRole("button", { name: "Retry", exact: true }).click(); await gate.captured.promise;
        await retiredNumbers(); expect(reads).toBe(readsBefore + 1); expect(newDemands).toBe(demandsBefore);
        expect(numericalTraffic.slice(trafficBefore)).toEqual([{ method: "POST", path: `${endpoint}/ligand-properties/read` }]);
        const freshReport = gate.delivery!.response.entries.find(item => item.source.entry_id === entry.id)!.report!;
        expect(freshReport.input_hash).toBe(previousWarmReport.input_hash); expect(freshReport.created_at).toBe(previousWarmReport.created_at);
        gate.ready.release(); heldRead = null;
        await expect(properties(page).getByRole("status")).toHaveText("Properties current Within profile criteria.", { timeout: 30_000 });
        await readyNumbers();
        await expect.poll(() => header(page).locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        depictionEvidence.push({ kind: "verified-molecular-source-error", fault, candidateRecovery,
          freshVerifiedWarmRead: gate.delivery, readsBefore, readsAfter: reads, demandsBefore, demandsAfter: newDemands,
          numericalTraffic: numericalTraffic.slice(trafficBefore), depictionRequests: depictionRequests.slice(requestsBefore) });
      }
      await info.attach("depiction-source-channel-recovery", { contentType: "application/json", body: JSON.stringify({
        actualProductionSource: { projectId: project.id, entryId: entry.id, currentArtifactId: entry.current_artifact_id,
          originalArtifactId: entry.original_artifact_id, candidateKey: actualCandidate.candidate_key },
        actualInventory, previousWarmRead, depictionEvidence,
        injection: "Actual committed depiction refetch: untagged drawing errors remain independent; only exact source conflicts or typed current/original source-verification errors retire numerical authority.",
      }) });
      expect(failures).toBe(3); expect(await (await request.get(endpoint)).json()).toEqual(before);
      expect(await (await request.get(`${entryPath}/original`)).body()).toEqual(original);
      expect(await (await request.get(preferencePath)).json()).toEqual(preference.saved);
      await info.attach("exact-source-authority-recovery", { contentType: "application/json", body: JSON.stringify({ source: entry.ligand_designation,
        failedImageUrl, imageRequests, workspaceExposures, stalePreFailureActualReady: staleDelivery, staleResponseSettled, browserPropertyReads,
        requestAccounting: "Each browser POST/read is counted at route entry before any hold; route.fetch forwarding does not add another browser READ.",
        evidence, injection: "Typed source-verification errors on exact current candidate request, never transport or eviction" }) });
      await compositor(page, info, `source-authority-recovered-${value}`);
    } finally { releases.forEach(release => release()); await restore(request, preference.before); }
  });
}
function urlPath(url: string) { return new URL(url).pathname; }
