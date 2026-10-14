import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import type { Project, StructureProjection } from "../../apps/web/src/api/types";
import type { MolstarEngine } from "../../apps/web/src/viewer/MolstarEngine";
import { browseComponents, showEntries } from "./support/navigation";

async function setup(page: Page, request: APIRequestContext, info: TestInfo) {
  const project = await (await request.post("/api/v1/projects", { data: { name: `Navigation ${info.project.name} ${Date.now()}` } })).json() as Project;
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await page.getByRole("button", { name: "Import structures" }).first().click();
  const importer = page.getByRole("dialog", { name: "Import structures" });
  await importer.locator('input[type="file"]').setInputFiles([
    resolve("tests/fixtures/complex/component_hierarchy.pdb"), resolve("tests/fixtures/formats/ethanol.mol"),
  ]);
  await importer.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importer).toBeHidden({ timeout: 30000 });
  await expect(page.locator(".viewer-status")).toContainText("2 visible / 2 loaded", { timeout: 45000 });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact: true }).click();
  return await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
}

test("keeps compact entries independent from component expansion, selection and metadata", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await setup(page, request, info);
  const entry = project.entries.find(entry => entry.source_format === "pdb")!;
  const normalizedRequests: string[] = [];
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/structure")) normalizedRequests.push(request.url());
    if (["POST", "PATCH", "DELETE"].includes(request.method())) mutations.push(request.url());
  });
  const baseline = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  const entryList = page.getByLabel("Project structures", { exact: true });
  const beforeBounds = await entryList.boundingBox();
  await browseComponents(page, entry.name);
  await expect(page.locator(".hierarchy-category").first()).toBeVisible();
  await expect(page.locator(".viewer-status")).toContainText("/ 0 selected");
  const protein = page.locator(".hierarchy-category").filter({ has: page.getByRole("button", { name: /^Select Protein in/ }) });
  await protein.locator(".hierarchy-disclosure").click();
  await expect(page.locator(".hierarchy-component").first()).toBeVisible();
  if (info.project.name === "chromium") expect(await entryList.boundingBox()).toEqual(beforeBounds);
  await page.getByLabel(`Select Protein in ${entry.name}`, { exact: true }).click();
  await expect(page.locator(".viewer-status")).not.toContainText("/ 0 selected");
  await expect(page.locator(".component-parent")).toContainText(entry.name);
  await showEntries(page);
  await page.getByPlaceholder("Search structures").fill("Ethanol");
  if (info.project.name === "mobile-chromium") await page.getByRole("tab", { name: "Components", exact: true }).click();
  await expect(page.getByText("Outside displayed entry list", { exact: true })).toBeVisible();
  await showEntries(page);
  await page.getByPlaceholder("Search structures").fill("");
  await page.getByRole("button", { name: `Actions for ${entry.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Details", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Entry details" });
  await expect(details).toContainText(entry.original_filename!);
  await expect(details.getByText("Warnings", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Actions for ${entry.name}`, exact: true })).toBeFocused();
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(baseline);
  expect(normalizedRequests).toEqual([]);
  expect(mutations).toEqual([]);
  expect((await new AxeBuilder({ page }).include(".project-browser").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("navigation.png") });
});

test("keeps two hundred grouped long-name entries usable at narrow widths and responsive remounts", async ({ page, request }, info) => {
  test.setTimeout(240000);
  await page.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nconst navigationMount = MolstarEngine.prototype.mount;\nMolstarEngine.prototype.mount = async function(target) { await navigationMount.call(this,target); (window.navigationEngines ??= []).push(this); };` });
  });
  let project = await setup(page, request, info);
  const prototype = project.entries.find(entry => entry.source_format === "mol")!;
  const complex = project.entries.find(entry => entry.source_format === "pdb")!;
  const longName = `Navigation candidate ${"long reference ".repeat(7)}end`;
  let response = await request.patch(`/api/v1/projects/${project.id}/entries/${prototype.id}`, { data: { expected_revision: project.revision, name: longName } });
  expect(response.status()).toBe(200); project = await response.json();
  response = await request.post(`/api/v1/projects/${project.id}/entries/${prototype.id}/visibility`, { data: { expected_revision: project.revision, value: false } });
  expect(response.status()).toBe(200); project = await response.json();
  for (let i = 0; i < 198; i++) {
    response = await request.post(`/api/v1/projects/${project.id}/entries/${prototype.id}/duplicate`, { data: { expected_revision: project.revision } });
    expect(response.status()).toBe(200); project = await response.json();
  }
  expect(project.entries).toHaveLength(200);
  for (let group = 0; group < 4; group++) {
    response = await request.post(`/api/v1/projects/${project.id}/groups`, { data: {
      expected_revision: project.revision, name: `Navigation group ${group + 1}`,
      entry_ids: project.entries.slice(group * 50, (group + 1) * 50).map(entry => entry.id),
    } });
    expect(response.status()).toBe(200); project = await response.json();
  }
  await page.reload();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded", { timeout:45000 });
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact:true }).click();
  await expect(page.locator(".entry-row")).toHaveCount(200);
  if (info.project.name === "chromium") {
    const handle = page.getByRole("separator", { name: "Resize project browser", exact:true });
    const box = (await handle.boundingBox())!;
    const width = (await page.locator(".project-browser").boundingBox())!.width;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - (width - 240), box.y + box.height / 2, { steps:5 }); await page.mouse.up();
    expect((await page.locator(".project-browser").boundingBox())!.width).toBeCloseTo(240, -1);
  } else await page.setViewportSize({ width:320, height:700 });
  let reads = 0; page.on("request", req => { if (req.url().endsWith("/structure")) reads++; });
  const snapshot = () => page.evaluate(() => {
    const engines = (window as unknown as { navigationEngines: MolstarEngine[] }).navigationEngines;
    return { camera: engines.at(-1)?.getCamera(), mounts: engines.length };
  });
  let stable: unknown;
  await expect.poll(async () => { const frame = await snapshot(); const equal = frame.camera !== null && JSON.stringify(stable) === JSON.stringify(frame); stable=frame; return equal; }).toBe(true);
  const before = await snapshot();
  const baseline = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  await browseComponents(page, complex.name);
  await page.getByRole("button", { name:`Expand Water in ${complex.name}`, exact:true }).click();
  await showEntries(page);
  const heights = await page.locator(".entry-row").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBe(info.project.name === "mobile-chromium" ? 44 : 32);
  await page.getByPlaceholder("Search structures").fill("Navigation candidate");
  await expect(page.locator(".entry-row")).toHaveCount(199);
  if (info.project.name === "mobile-chromium") await page.getByRole("tab", { name:"Components", exact:true }).click();
  await expect(page.getByText("Outside displayed entry list", { exact:true })).toBeVisible();
  expect(await snapshot()).toEqual(before);
  expect(reads).toBe(0);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(baseline);
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name:"Use dark theme", exact:true }).click();
    expect((await new AxeBuilder({ page }).include(".project-browser").withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:info.outputPath(`many-entries-${theme}.png`) });
  }
  await showEntries(page);
  await page.getByRole("button", { name:`Actions for ${longName}`, exact:true }).click();
  await page.getByRole("menuitem", { name:"Details", exact:true }).click();
  await expect(page.getByRole("dialog", { name:"Entry details" })).toContainText(longName);
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Search structures").fill("");
  if (info.project.name === "chromium") {
    await page.setViewportSize({ width:640, height:700 });
    await page.getByRole("button", { name:"Project browser", exact:true }).click();
    await page.getByRole("tab", { name:"Components", exact:true }).click();
  } else await page.getByRole("tab", { name:"Components", exact:true }).click();
  await expect(page.getByRole("button", { name:`Collapse Water in ${complex.name}`, exact:true })).toBeVisible();
  await expect(page.locator(".component-parent")).toContainText(complex.name);
  await info.attach("many-entry-invariance", { body:JSON.stringify({ entries:200, rowHeight:heights[0], normalizedRequests:reads, cameraBefore:before }), contentType:"application/json" });
});

test("virtualizes ten thousand real normalized components and reaches off-screen rows by keyboard", async ({ page, request }, info) => {
  test.setTimeout(180000);
  const created = await request.post("/api/v1/projects", { data: { name: `Virtual components ${info.project.name} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  let project = await created.json() as Project;
  // Synthetic O-only crystallographic waters exercise navigation, not preparation
  // chemistry or a realistic solvent environment. Two chains avoid PDB residue overflow.
  const lines = Array.from({ length: 10000 }, (_, i) => {
    const serial = String(i + 1).padStart(5);
    const residue = String(i % 5000 + 1).padStart(4);
    const chain = i < 5000 ? "A" : "B";
    const coordinate = (value: number) => value.toFixed(3).padStart(8);
    return `HETATM${serial}  O   HOH ${chain}${residue}    ${coordinate((i % 100) * 3)}${coordinate(Math.floor(i / 100) * 3)}${coordinate(0)}  1.00 20.00           O  `;
  });
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: String(project.revision), files: { name: "synthetic-waters.pdb", mimeType: "chemical/x-pdb", buffer: Buffer.from(lines.join("\n") + "\nEND\n") },
  } });
  expect(imported.status()).toBe(201);
  project = (await imported.json()).project;
  const entry = project.entries[0];
  expect(entry.atom_count).toBe(10000);
  const hidden = await request.post(`/api/v1/projects/${project.id}/entries/${entry.id}/visibility`, { data: { expected_revision: project.revision, value: false } });
  expect(hidden.status()).toBe(200);
  project = await hidden.json() as Project;
  const payload = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection;
  expect(payload.hierarchy.components).toHaveLength(10000);
  expect(payload.hierarchy.components.every(component => component.category === "water")).toBe(true);
  let loads = 0;
  page.on("request", req => { if (req.url().endsWith("/structure")) loads++; });
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  if (info.project.name === "mobile-chromium") await page.getByRole("button", { name: "Project browser", exact: true }).click();
  expect(loads).toBe(0);
  const baseline = await (await request.get(`/api/v1/projects/${project.id}`)).json();
  await browseComponents(page, entry.name);
  await page.getByRole("button", { name: `Expand Water in ${entry.name}`, exact: true }).click();
  const category = page.getByRole("button", { name: `Select Water in ${entry.name}`, exact: true });
  await category.focus();
  await page.keyboard.press("End");
  const last = payload.hierarchy.components.at(-1)!;
  const lastLabel = page.getByRole("button", { name: `Select ${last.display_label} in ${entry.name}`, exact: true });
  await expect(lastLabel).toBeFocused();
  const scroll = page.locator(".component-scroll");
  const bounded = await scroll.evaluate(element => {
    const rows = [...element.querySelectorAll<HTMLElement>(".hierarchy-row")];
    const rowHeight = rows[0].getBoundingClientRect().height;
    return { mounted: rows.length, bound: Math.ceil(element.clientHeight / rowHeight) + 16 + 2, scroll: element.scrollTop };
  });
  expect(bounded.mounted).toBeLessThanOrEqual(bounded.bound);
  expect(bounded.scroll).toBeGreaterThan(10000);
  await lastLabel.press("Enter");
  await expect(page.locator(".viewer-status")).toContainText("/ 1 selected");
  const details = page.getByRole("button", { name: `Details for ${last.display_label} in ${entry.name}`, exact: true });
  await details.click();
  await expect(page.getByRole("dialog", { name: "Component details" })).toContainText(last.display_label);
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  await page.keyboard.press("Home");
  await expect(category).toBeFocused();
  await category.press("Enter");
  await expect(page.locator(".viewer-status")).toContainText("/ 10000 selected");
  expect(loads).toBe(1);
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json()).toEqual(baseline);
  expect((await new AxeBuilder({ page }).include(".component-pane").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await info.attach("virtual-window", { body: JSON.stringify({ ...bounded, components:10000, normalizedRequests:loads }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("virtual-components.png") });
});

test("retains two component rows at the minimum expanded desktop pane height", async ({ page, request }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop divider minimum; mobile uses full-height tabs.");
  const project = await setup(page, request, info);
  const complex = project.entries.find(entry => entry.source_format === "pdb")!;
  await page.setViewportSize({ width:1200, height:600 });
  await browseComponents(page, complex.name);
  await page.getByRole("button", { name:`Expand Water in ${complex.name}`, exact:true }).click();
  await page.locator(`[data-entry-id="${complex.id}"]`).getByRole("button", { name:`Hide ${complex.name}`, exact:true }).click();
  await page.getByPlaceholder("Search structures").fill("Ethanol");
  await expect(page.locator(".component-parent")).toContainText("Parent hidden");
  await expect(page.locator(".component-parent")).toContainText("Outside displayed entry list");
  const divider = page.getByRole("separator", { name:"Resize entries and components", exact:true });
  const box = (await divider.boundingBox())!;
  const group = (await page.locator('#project-navigation-panels').boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down(); await page.mouse.move(box.x+box.width/2,group.y+group.height-125,{ steps:5 }); await page.mouse.up();
  await expect(page.getByRole("button", { name:"Collapse components", exact:true })).toBeVisible();
  await expect.poll(() => page.locator(".component-scroll").evaluate(node => node.clientHeight)).toBeGreaterThanOrEqual(64);
  await page.screenshot({ path:info.outputPath("minimum-pane.png") });
});
