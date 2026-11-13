import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AtomReference, Job, QuickMinimizationCapabilities, QuickMinimizationProposal, QuickMinimizationRequest } from "../../apps/web/src/api/types";
import { prepare } from "./support/interactions";
import { current, panel, select, structures } from "./support/minimization";

const fixture = "tests/fixtures/quick-minimization/New_molecule.sdf";
const pending = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
const submission = (url: string) => /\/quick-minimizations$/.test(new URL(url).pathname);

// Existing application selection actions let a background selection change while
// the narrow non-modal setup covers the Inspector. Molecular data is untouched.
async function replaceSelection(page: Page, atoms: AtomReference[]) {
  await page.evaluate(async selected => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path);
    useSelectionStore.getState().replace({ schema_version: 1, atoms: selected, granularity: "atom", source: "inspector" });
  }, atoms);
}
const captured = (page: Page) => page.evaluate(async () => {
  const path = "/src/minimization/store.ts";
  const { useMinimizationStore } = await import(/* @vite-ignore */ path);
  const draft = useMinimizationStore.getState().draft;
  return draft ? { revision: draft.project.revision, atoms: draft.selection.atoms,
    included: [...draft.included], mode: draft.mode, iterations: draft.iterations,
    expandHydrogens: draft.expandHydrogens, allowRepair: draft.allowRepair } : null;
});

for (const theme of ["light", "dark"] as const) test(`rechecks capability failures without submitting or losing draft and keyboard focus at 320px (${theme})`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, [fixture], `Capability controls ${theme}`);
  await select(page, [{ structure_id: project.entries[0].id, atom_id: 3 }], info.project.name === "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole("button", { name: "Inspector", exact: true })).toBeVisible();
  if (theme === "dark") await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  const held = pending(), entered = pending();
  let phase: "held" | "failure" | "success" = "held", checks = 0, writes = 0;
  page.on("request", req => { if (req.method() === "POST" && submission(req.url())) writes++; });
  await page.route("**/quick-minimization-capabilities", async route => {
    checks++;
    const response = await route.fetch();
    const capabilities = await response.json() as QuickMinimizationCapabilities;
    if (phase === "held") {
      entered.resolve(); await held.promise;
      await route.fulfill({ response, json: { ...capabilities, available: false, unavailable_reason: "Injected local model unavailable" } });
    } else if (phase === "failure") {
      await route.fulfill({ status: 503, json: { detail: { code: "capability_transport", message: "Injected availability transport error" } } });
    } else await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
    await entered.promise;
    await expect(panel(page)).toContainText("Checking minimization availability");
    await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeDisabled();
    await panel(page).getByRole("combobox", { name: "Minimization mode", exact: true }).selectOption("isolated");
    await panel(page).getByRole("checkbox", { name: "Move attached terminal hydrogens", exact: true }).uncheck();
    await panel(page).getByText("More settings", { exact: true }).click();
    await panel(page).getByRole("spinbutton", { name: "Minimization iterations", exact: true }).fill("37");
    await panel(page).getByRole("checkbox", { name: "Allow warned approximate repair", exact: true }).uncheck();
    const draft = await captured(page);
    held.resolve();
    await expect(panel(page)).toContainText("Injected local model unavailable");
    const check = panel(page).getByRole("button", { name: "Check again", exact: true });
    await check.focus(); phase = "failure"; await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("alert")).toContainText("Injected availability transport error");
    await expect(check).toBeFocused();
    await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeDisabled();
    expect(await captured(page)).toEqual(draft);
    phase = "success"; await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeEnabled();
    await expect(check).toBeFocused();
    expect(await captured(page)).toEqual(draft);
    expect(checks).toBe(3); expect(writes).toBe(0);
    const box = await panel(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
    expect((await new AxeBuilder({ page }).include(".minimization-panel").analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-320-capability-controls.png`) });
    await panel(page).getByRole("button", { name: "Close minimization", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Minimize selection", exact: true })).toBeFocused();
    expect((await current(request, project.id)).revision).toBe(project.revision);
  } finally { held.resolve(); }
});

test("explicitly recaptures current revision and selection while retaining choices and freezing the submitted target", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const mobile = info.project.name === "mobile-chromium";
  const project = await prepare(page, request, [fixture, "tests/fixtures/quick-minimization/paracetamol.pdb"], "Recapture controls");
  const [first, second] = project.entries;
  const initial = [{ structure_id: first.id, atom_id: 3 }], replacement = [{ structure_id: second.id, atom_id: second.atom_ids[0] }];
  await select(page, initial, mobile);
  let writes = 0;
  page.on("request", req => { if (req.method() === "POST" && submission(req.url())) writes++; });
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeEnabled();
  await panel(page).getByRole("combobox", { name: "Minimization mode", exact: true }).selectOption("environment");
  await panel(page).getByRole("checkbox", { name: second.name, exact: true }).check();
  await panel(page).getByRole("checkbox", { name: "Move attached terminal hydrogens", exact: true }).uncheck();
  await panel(page).getByText("More settings", { exact: true }).click();
  await panel(page).getByRole("spinbutton", { name: "Minimization iterations", exact: true }).fill("37");
  await panel(page).getByRole("checkbox", { name: "Allow warned approximate repair", exact: true }).uncheck();
  const before = await captured(page);
  await replaceSelection(page, replacement);
  expect(await captured(page)).toEqual(before);
  if (mobile) await page.getByRole("button", { name: "Project browser", exact: true }).click();
  // Keyboard activation remains reachable while modeless setup overlays the
  // narrow browser; this is a genuine project command and cache publication.
  await page.getByRole("button", { name: `Hide ${second.name}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toContainText("Project changed. Use current selection to refresh this setup.");
  await expect(panel(page).getByRole("button", { name: "Run quick minimization", exact: true })).toBeDisabled();
  expect(await captured(page)).toEqual(before);
  if (mobile) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Project browser panel", exact: true })).toBeHidden();
    await expect(panel(page)).toBeVisible();
  }
  const updated = await current(request, project.id);
  expect(updated.revision).toBe(project.revision + 1);
  await panel(page).getByRole("button", { name: "Use current selection", exact: true }).click();
  expect(await captured(page)).toEqual({ ...before, revision: updated.revision, atoms: replacement });
  expect(writes).toBe(0);
  await expect(panel(page).getByRole("checkbox", { name: `${second.name} · hidden`, exact: true })).toBeChecked();
  await expect(panel(page).getByRole("checkbox", { name: `${second.name} · hidden`, exact: true })).toBeDisabled();
  const held = pending(), entered = pending();
  let body: QuickMinimizationRequest | undefined, job: Job | undefined;
  await page.route("**/quick-minimizations", async route => {
    body = route.request().postDataJSON() as QuickMinimizationRequest;
    const response = await route.fetch(); expect(response.status()).toBe(201);
    job = await response.json() as Job; entered.resolve(); await held.promise;
    await route.fulfill({ response });
  });
  try {
    await panel(page).getByRole("button", { name: "Run quick minimization", exact: true }).click();
    await entered.promise;
    await replaceSelection(page, initial);
    expect(body).toMatchObject({ expected_revision: updated.revision, selection: { atoms: replacement },
      mode: "environment", context_entry_ids: [second.id], expand_hydrogens: false, allow_repair: false, max_iterations: 37 });
    expect(job?.parameters.requested_selection).toMatchObject({ atoms: replacement });
    expect(writes).toBe(1);
    await panel(page).getByRole("button", { name: "Close minimization", exact: true }).click();
  } finally { held.resolve(); }
});

test("shows server-resolved attached H before the actual local context and effective methods", async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, [fixture], "Staged minimization counts");
  const entry = project.entries[0], source = (await structures(request, project))[entry.id];
  const selected = 1;
  const h = source.atoms.filter(atom => atom.element === "H" && source.bonds.filter(bond =>
    bond.atom_1_id === atom.id || bond.atom_2_id === atom.id).length === 1 && source.bonds.some(bond =>
    (bond.atom_1_id === selected && bond.atom_2_id === atom.id) || (bond.atom_2_id === selected && bond.atom_1_id === atom.id)));
  expect(h.length).toBeGreaterThan(0);
  await select(page, [{ structure_id: entry.id, atom_id: selected }], info.project.name === "mobile-chromium");
  const held = pending(), entered = pending();
  let proposal: QuickMinimizationProposal | undefined;
  await page.route("**/quick-minimizations/*/proposal", async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    proposal = await response.json() as QuickMinimizationProposal; entered.resolve(); await held.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
    await expect(panel(page)).toContainText("Requested selection: 1 atom");
    await panel(page).getByRole("button", { name: "Run quick minimization", exact: true }).click();
    await entered.promise;
    const targets = panel(page).getByRole("region", { name: "Captured minimization targets", exact: true });
    await expect(targets).toContainText(`Resolved movers: ${1 + h.length}`);
    await expect(targets).toContainText(`${h.length} attached H added`);
    await expect(targets).toContainText("Local context is determined during calculation");
    held.resolve();
    await expect(targets).toContainText("Actual context:");
    const report = proposal!.report;
    expect(report.movable_count).toBe(1 + h.length);
    const canonical = Object.values(report.modeled_atoms).reduce((sum, atoms) => sum + atoms.length, 0);
    expect(report.fixed_count).toBe(canonical - report.movable_count);
    expect(report.fixed_count).toBeLessThan(entry.atom_count);
    await expect(targets).toContainText(`${report.movable_count} movable / ${report.fixed_count} fixed`);
    await panel(page).getByText("Calculation details", { exact: true }).click();
    await expect(panel(page).locator("dt").filter({ hasText: /^Temporary helper atoms \(including cap atoms\)$/ })
      .locator("xpath=following-sibling::dd[1]")).toHaveText(String(report.helper_count));
    await expect(panel(page).locator("dt").filter({ hasText: /^Boundary cap groups$/ })
      .locator("xpath=following-sibling::dd[1]")).toHaveText(String(report.cap_count));
    await panel(page).getByText(/^Effective model methods \(/).click();
    await expect(panel(page)).toContainText("Coverage describes the disclosed local objective");
    await expect(panel(page)).toContainText("MMFF94");
    await expect(panel(page)).toContainText(`${canonical} canonical atoms`);
    const methods = panel(page).getByText(/^Effective model methods \(/).locator("..");
    for (const theme of ["light", "dark"] as const) {
      if (theme === "dark") {
        await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
        await expect(page.getByRole("button", { name: "Use light theme", exact: true })).toBeVisible();
      }
      await methods.locator(".minimization-context").scrollIntoViewIfNeeded();
      const bounds = await panel(page).evaluate(node => {
        const box = node.getBoundingClientRect();
        return { x: box.x, right: box.right, y: box.y, bottom: box.bottom,
          viewportWidth: innerWidth, viewportHeight: innerHeight,
          contentWidth: node.scrollWidth, availableWidth: node.clientWidth };
      });
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
      expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.availableWidth + 1);
      expect((await new AxeBuilder({ page }).include(".minimization-panel").analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${theme}-expanded-model-methods.png`) });
    }
  } finally { held.resolve(); }
});

for (const metadata of ["missing", "invalid"] as const) test(`retains report inspection and normal application with ${metadata} effective-field metadata`, async ({ page, request }, info) => {
  test.setTimeout(120000);
  const project = await prepare(page, request, [fixture], `Effective field ${metadata}`);
  const entry = project.entries[0];
  await select(page, entry.atom_ids.map(atom_id => ({ structure_id: entry.id, atom_id })), info.project.name === "mobile-chromium");
  await page.route("**/api/v1/jobs/*", async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch(), job = await response.json() as Job;
    if (job.status === "completed") {
      if (metadata === "missing") delete job.result_values.effective_field;
      else job.result_values.effective_field = { schema_version: 999, model: "quick-local-v1" };
    }
    await route.fulfill({ response, json: job });
  });
  await page.getByRole("button", { name: "Minimize selection", exact: true }).click();
  await panel(page).getByRole("button", { name: "Run quick minimization", exact: true }).click();
  await expect(page.getByRole("button", { name: /Undo: Quick minimize selection/ })).toBeEnabled({ timeout: 30000 });
  await expect(panel(page)).toContainText("Quick coordinates applied");
  await panel(page).getByText("Calculation details", { exact: true }).click();
  await expect(panel(page)).toContainText(metadata === "missing"
    ? "Detailed method information was not recorded for this result"
    : "Detailed method information is invalid or unsupported");
  await expect(panel(page)).toContainText("MMFF94");
  expect((await current(request, project.id)).revision).toBe(project.revision + 1);
});
